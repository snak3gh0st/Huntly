# Huntly — Intelligence-First Lead Generation Engine

**Date:** 2026-03-19
**Status:** Draft
**Author:** Paulo + Claude

## Overview

Huntly is a standalone lead generation system that crawls Google Maps and business websites to find companies that would benefit from AI-powered WhatsApp automation (SigmaAI), enriches them with review sentiment analysis and website signals, generates hyper-personalized outreach emails, and drives them to SigmaAI signups through a multi-touch drip campaign.

**End goal:** Every lead that enters the funnel is pushed toward subscribing to SigmaAI.

## Key Differentiator

Instead of generic cold email, Huntly builds an **intelligence profile** per lead — analyzing their Google reviews for pain signals ("hard to reach", "no online booking", "slow response") and using those signals in the email. The first email feels like a business consultation, not spam.

A **personalized demo page** per lead shows a simulated WhatsApp conversation tailored to their business, making the value tangible in 10 seconds.

## Target Audience

- Global, specific verticals (dental clinics, law firms, real estate agencies, salons, etc.)
- Appointment-based businesses with high customer inquiry volume
- Businesses that have WhatsApp on their website but no automation
- Signals: WhatsApp presence + appointment-based + decent Google review volume

## Architecture

### Pipeline Stages

```
[1. Source]  →  [2. Enrich]  →  [3. Qualify + Generate]  →  [4. Outreach]
 Outscraper     Playwright       AI Scoring +               Resend drip
 Google Maps    website crawl    Hook generation +          + open/click
                review analysis  Demo page generation        tracking
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 + TypeScript (ES modules) |
| HTTP Server | Fastify |
| Job Orchestration | BullMQ + Redis (shared with SigmaAI VPS) |
| Database | PostgreSQL (`huntly_db` — separate from `sigmaai_db`) |
| ORM | Prisma |
| Lead Sourcing | Outscraper API (pay-per-result, ~$0.002/result) |
| Website Crawling | Playwright (headless Chromium) |
| AI | Groq (Llama 3.3 70B, free tier) with OpenAI GPT-4o-mini fallback |
| Email | Resend SDK (free tier: 3K emails/mo) |
| Demo Pages | Server-rendered HTML from Fastify |

### Deployment (Cost-Optimized)

Runs on the existing SigmaAI VPS (`ssh sigma` — root@46.225.111.73) as separate Docker containers. Shares Redis, has its own database. Demo pages served at `outreach.sigmaintel.io/demo/:token`.

**Domain strategy:** Use `outreach.sigmaintel.io` for everything (sending emails + demo pages). Same root domain avoids SPF/DKIM alignment issues and does not require purchasing a new domain.

**Monthly cost at ~100 leads/week:**

| Service | Cost |
|---------|------|
| Outscraper (place search) | ~$1-2/mo (400 results) |
| Outscraper (reviews) | ~$8-10/mo (20 reviews × 400 leads = 8K reviews) |
| Groq AI | $0 (free tier: 14.4K req/day, 131K TPM) |
| Resend | $0 (free tier: 3K emails/mo) |
| Hosting | $0 (existing VPS) |
| **Total** | **~$10-12/mo** |

**Note:** Outscraper `google_maps_reviews` is a separate endpoint from `google_maps_search`. Reviews cost ~$1/1000 reviews. We fetch 20 reviews per lead (not 50) to keep costs down while still capturing pain signals.

## Data Model

### campaigns

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | string | Campaign name |
| status | enum | draft / active / paused / completed |
| vertical | string | e.g., "dental_clinic", "law_firm" |
| regions | string[] | e.g., ["London,UK", "Dubai,AE"] |
| email_template_set_id | uuid | FK to email_template_sets |
| drip_config | json | Delays, max_emails, stop_conditions |
| created_at | timestamp | |
| updated_at | timestamp | |

### leads

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| campaign_id | uuid | FK to campaigns |
| business_name | string | |
| category | string | Google Maps category |
| address | string | |
| region | string | |
| country | string | |
| phone | string | |
| website_url | string | |
| email | string | Extracted from website |
| google_maps_place_id | string | **Dedup key** |
| google_rating | float | |
| google_review_count | int | |
| source_data | json | Raw Outscraper response |
| status | enum | sourced → enriched → qualified → contacted → replied → converted → unsubscribed |
| has_replied | boolean | True when any reply detected (lead-level, not per-email) |
| demo_token | string | Cryptographically random token for demo page URL (`crypto.randomBytes(16).toString('hex')`) |
| demo_expires_at | timestamp | Demo page expiry (60 days after last email sent) |
| unsubscribe_token | string | Unique random token for unsubscribe URL |
| last_error | text | Last pipeline error (for debugging stuck leads) |
| created_at | timestamp | |
| updated_at | timestamp | |

### lead_enrichment

| Column | Type | Description |
|--------|------|-------------|
| lead_id | uuid | FK to leads (1:1) |
| has_whatsapp | boolean | WhatsApp link/widget detected |
| has_chatbot | boolean | Existing chatbot detected |
| has_online_booking | boolean | Booking widget detected |
| emails_found | string[] | All emails found on site |
| website_tech_signals | json | CMS, forms, integrations |
| review_sentiment_summary | text | AI-generated summary |
| pain_signals | json[] | `[{ signal, count, example }]` |
| enriched_at | timestamp | |

### lead_qualification

| Column | Type | Description |
|--------|------|-------------|
| lead_id | uuid | FK to leads (1:1) |
| fit_score | int | 0-100 |
| score_reasoning | text | Why this score |
| personalized_hook | text | AI-generated first paragraph |
| demo_page_data | json | Business name, scenario, simulated conversation |
| qualified_at | timestamp | |

### outreach_emails

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| lead_id | uuid | FK to leads |
| sequence_number | int | 1, 2, or 3 |
| resend_message_id | string | Resend tracking ID |
| subject | string | |
| body_html | text | |
| campaign_id | uuid | FK to campaigns (denormalized for cross-campaign queries) |
| status | enum | scheduled → sending → delivered → opened → clicked → bounced → failed → complained |
| scheduled_for | timestamp | |
| sent_at | timestamp | |
| delivered_at | timestamp | |
| opened_at | timestamp | |
| clicked_at | timestamp | |
| created_at | timestamp | |
| updated_at | timestamp | |

### email_template_sets

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | string | Template set name |
| vertical | string | Target vertical |
| templates | json[] | `[{ sequence_number, subject_template, body_template }]` |

### email_templates (separate table for future A/B testing)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| template_set_id | uuid | FK to email_template_sets |
| sequence_number | int | 1, 2, or 3 |
| subject_template | string | Subject with merge fields |
| body_template | text | HTML body with merge fields |
| created_at | timestamp | |

### excluded_clients

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| phone | string | Phone number to exclude |
| domain | string | Website domain to exclude |
| reason | string | e.g., "existing_client", "competitor" |
| created_at | timestamp | |

Populated via periodic script that reads from `sigmaai_db.tenants`. Used during qualification to disqualify existing SigmaAI clients.

## Pipeline Details

### Stage 1: Source (Outscraper → Raw Leads)

- Campaign config defines vertical + regions
- Source worker builds queries: `"{vertical} in {region}"` for each combination
- Outscraper returns structured data: name, address, phone, website, category, rating, reviews, place_id
- Deduplicates by `google_maps_place_id` across all campaigns
- Stores leads with status `sourced`
- Rate-limited via BullMQ concurrency settings

### Stage 2: Enrich (Playwright + AI Review Analysis)

Two parallel passes per lead:

**Pass 1 — Website Crawl (Playwright):**
- Visits max 5 pages: home, contact, about, services, footer links
- Extracts: email addresses (regex + mailto:), WhatsApp links (wa.me, widgets), chatbot presence (Intercom, Drift, Tidio, ManyChat), booking widgets (Calendly, Cal.com, forms)
- Detects CMS and tech signals
- Timeout: 15 seconds per site, graceful failure

**Pass 2 — Review Analysis (AI):**
- Input: last 20 Google reviews (fetched via separate Outscraper `google_maps_reviews` endpoint)
- Single Groq API call (Llama 3.3 70B), max 6 concurrent calls/min (TPM limit: 131K tokens)
- Fallback: on Groq 429, retry once after 10s, then fall back to GPT-4o-mini
- Structured JSON output: sentiment_summary, pain_signals[{signal, count, example}], positive_themes
- Pain signal categories: slow_response, hard_to_reach, hard_to_book, no_after_hours, no_online_booking, rude_staff, long_wait

**Output:** Lead status → `enriched`

### Stage 3: Qualify + Generate (AI Scoring + Content)

Single AI call per lead that produces:

- **fit_score** (0-100): Based on pain signals, WhatsApp presence, review volume, no existing chatbot
- **score_reasoning**: Human-readable explanation
- **personalized_hook**: First paragraph for Email 1, referencing specific pain signals and stats
- **demo_scenario**: Simulated WhatsApp conversation tailored to their business

**Qualification thresholds:**
- Score >= 70: Auto-approved for outreach
- Score 40-69: Queued for manual review
- Score < 40: Auto-skipped
- Disqualified: No email found, competitor, already a SigmaAI client (checked against `excluded_clients` table)

**Output:** Lead status → `qualified`

**Status transition to `converted`:** When a lead signs up for SigmaAI via the demo page CTA (tracked via UTM `ref=huntly&lead={id}`), a webhook or periodic sync marks them as `converted`. For MVP, this is done manually.

### Stage 4: Outreach (Resend Drip Engine)

**3-email drip sequence:**

**Email 1 — The Mirror (Day 0):**
- Subject: `"{count} of your {customers} can't reach you, {business_name}"`
- Body: Personalized hook (from AI) + one stat from reviews + demo page link
- CTA: "See how this works for {business_name}"

**Email 2 — Social Proof (Day 3, only if no click):**
- Subject: `"How {similar_business} cut missed calls by 60%"`
- Body: Short case study from SigmaAI client in same vertical + demo link
- CTA: "Your free pilot is ready"

**Email 3 — Direct Offer (Day 7, only if no click):**
- Subject: `"Free 7-day pilot for {business_name} — no setup needed"`
- Body: Zero-friction offer, reply-is-the-CTA
- CTA: "Reply with your WhatsApp number"

**Demo page** at `outreach.sigmaintel.io/demo/:token`:
- Uses opaque `demo_token` (not lead UUID) — no PII in URL
- Expires after `demo_expires_at` (60 days after last email), returns 404 after expiry
- Business name + simulated WhatsApp conversation from demo_scenario
- Disclaimer at bottom: "This is a simulated example of how an AI assistant could work for your business"
- CTA button → SigmaAI signup with UTM params: `appai.sigmaintel.io/signup?ref=huntly&lead={id}&vertical={vertical}`

**Stop conditions:**
- Lead clicks demo → pause drip
- Lead replies → pause drip + set `has_replied = true` + flag for manual follow-up
- Lead bounces → mark invalid
- Lead unsubscribes → mark permanently, terminal state (no future emails ever)

**Unsubscribe flow:**
- Every email includes `List-Unsubscribe` and `List-Unsubscribe-Post` headers (RFC 8058)
- Unsubscribe URL: `outreach.sigmaintel.io/unsubscribe/:unsubscribe_token`
- GET renders confirmation page, POST processes immediately (GDPR: instant, CAN-SPAM: < 10 days)
- Unsubscribed leads can never re-enter any campaign

**Compliance:**
- Every email includes a physical mailing address in the footer (configured in `campaigns.sender_address` or global config)
- One-click unsubscribe header on every email
- CAN-SPAM + GDPR compliant

**Sending discipline:**
- Send from subdomain: `outreach.sigmaintel.io`
- Warm-up: 20 emails/day, ramp 20% daily over 2 weeks
- Daily cap: configurable, defaults to 50
- Resend handles SPF, DKIM, DMARC

### Webhook Tracking

Resend webhooks update `outreach_emails` in real-time:
- `email.sent` → status = sending
- `email.delivered` → status = delivered, record delivered_at
- `email.opened` → status = opened, record opened_at
- `email.clicked` → status = clicked, record clicked_at, pause drip
- `email.bounced` → status = bounced, mark lead invalid
- `email.complained` → status = complained, mark lead unsubscribed
- Resend 4xx rejection → status = failed

**Reply detection:** Use Resend inbound routing — configure a reply-to address on `outreach.sigmaintel.io` that forwards to a webhook. Replies set `lead.has_replied = true`, pause the drip, and trigger a notification (configurable: Slack, WhatsApp, email). Reply detection is a **lead-level event**, not an email status.

## Failure Handling

Each pipeline stage has explicit retry and fallback behavior. All failures are recorded in `leads.last_error`.

| Stage | Failure | Retry | Fallback |
|-------|---------|-------|----------|
| Source | Outscraper API down | 3x exponential backoff (5s, 15s, 45s) | Dead-letter queue, alert |
| Source | Duplicate query | BullMQ job ID dedup | Skip (idempotent) |
| Enrich/Playwright | Site timeout (15s) | No retry | Mark signals as `null` (unknown), continue pipeline |
| Enrich/Playwright | Site blocks crawler | No retry | Mark signals as `null`, continue |
| Enrich/AI (Groq) | 429 rate limit | 1x after 10s | Fall back to GPT-4o-mini |
| Enrich/AI | Malformed JSON response | 1x retry with stricter prompt | Skip review analysis, proceed with website-only data |
| Qualify | AI call fails | 2x retry | Leave in `enriched` status for manual review |
| Outreach | Resend rejects (4xx) | No retry | Mark email `failed`, continue drip with next email |
| Outreach | Resend rate limit (429) | 3x with 5-min backoff | Delay remaining sends |
| Webhook | Webhook processing fails | BullMQ auto-retry (3x) | Dead-letter, manual reconciliation |

**Worker concurrency limits:**
- Source worker: 2 concurrent jobs (Outscraper rate limits)
- Enrich worker: 5 concurrent Playwright instances (memory: ~300MB each, cap at 1.5GB)
- Enrich/Qualify AI: max 6 Groq calls/min (TPM constraint), no limit for GPT-4o-mini fallback
- Outreach worker: 1 concurrent job (respect daily sending cap)

**Playwright resource note:** Use `cheerio` for simple HTML parsing (email extraction, link detection) on most sites. Only invoke Playwright for JavaScript-rendered sites (SPA detection: if cheerio finds no content in `<body>`, retry with Playwright). This reduces memory usage from ~1.5GB to ~300MB for typical batches.

## Auth & Security

- All admin API routes protected by API key (stored in `.env`, checked via Fastify `onRequest` hook)
- Demo pages are public but use opaque tokens (not UUIDs) and expire
- Unsubscribe pages are public but use unique tokens per lead
- No PII in URLs — tokens only
- `.env` contains: Outscraper API key, Groq API key, OpenAI API key, Resend API key, DB connection string, admin API key

## Project Structure

```
Huntly/
├── package.json
├── tsconfig.json
├── .env
├── docker-compose.yml
├── prisma/
│   └── schema.prisma
├── src/
│   ├── index.ts                  # Fastify server entry
│   ├── config.ts                 # Env validation
│   ├── db/
│   │   └── repositories/         # Lead, campaign, outreach repos
│   ├── workers/
│   │   ├── source.worker.ts      # Outscraper → raw leads
│   │   ├── enrich.worker.ts      # Playwright + review AI
│   │   ├── qualify.worker.ts     # Scoring + hook + demo gen
│   │   └── outreach.worker.ts    # Drip sends + scheduling
│   ├── services/
│   │   ├── outscraper.service.ts # Google Maps search
│   │   ├── crawler.service.ts    # Playwright website analysis
│   │   ├── review-analyzer.ts    # AI review analysis
│   │   ├── qualifier.service.ts  # Lead scoring + content gen
│   │   ├── email.service.ts      # Resend SDK wrapper
│   │   └── demo-page.service.ts  # Demo page rendering
│   ├── middleware/
│   │   └── api-key-auth.ts       # Admin API key verification
│   ├── routes/
│   │   ├── campaign.routes.ts    # CRUD campaigns (auth required)
│   │   ├── lead.routes.ts        # Browse/approve/reject leads (auth required)
│   │   ├── outreach.routes.ts    # Email status, manual actions (auth required)
│   │   ├── demo.routes.ts        # GET /demo/:token (public, token-gated)
│   │   ├── unsubscribe.routes.ts # GET+POST /unsubscribe/:token (public)
│   │   └── webhook.routes.ts     # Resend webhooks (signature verified)
│   └── templates/
│       ├── emails/               # HTML email templates
│       └── demo/                 # Demo page HTML template
├── dashboard/                    # Simple React UI (post-MVP)
└── scripts/
    └── seed-campaign.ts          # CLI to create first campaign
```

## Success Criteria

1. End-to-end pipeline works: campaign config → sourced → enriched → qualified → email sent → tracked
2. Personalized demo page renders correctly per lead
3. Drip sequence respects stop conditions (click/reply/bounce/unsubscribe)
4. Resend webhooks update email status in real-time
5. Full funnel visible: sourced → enriched → qualified → contacted → opened → clicked → replied → converted
6. Cost stays under $15/mo at 100 leads/week

## Future (Not MVP)

- Dashboard UI for campaign management and funnel visualization
- Multi-tenancy: let other people use Huntly as a product
- A/B testing email subjects and hooks
- LinkedIn enrichment as secondary signal
- Auto-signup flow (lead clicks CTA → SigmaAI trial created automatically)
- Multi-channel: WhatsApp outreach in addition to email
