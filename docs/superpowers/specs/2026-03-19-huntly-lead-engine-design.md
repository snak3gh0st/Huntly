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

Runs on the existing SigmaAI VPS (`ssh sigma` — root@46.225.111.73) as separate Docker containers. Shares Redis, has its own database. Demo pages served at `huntly.sigmaintel.io/demo/:id`.

**Monthly cost at ~100 leads/week:**

| Service | Cost |
|---------|------|
| Outscraper | ~$1-2/mo (400 results) |
| Groq AI | $0 (free tier: 14.4K req/day) |
| Resend | $0 (free tier: 3K emails/mo) |
| Hosting | $0 (existing VPS) |
| **Total** | **~$1-2/mo** |

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
| created_at | timestamp | |

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
| status | enum | scheduled → sent → opened → clicked → replied → bounced |
| scheduled_for | timestamp | |
| sent_at | timestamp | |
| opened_at | timestamp | |
| clicked_at | timestamp | |
| created_at | timestamp | |

### email_template_sets

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | string | Template set name |
| vertical | string | Target vertical |
| templates | json[] | `[{ sequence_number, subject_template, body_template }]` |

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
- Input: last 50 Google reviews from Outscraper data
- Single Groq API call (Llama 3.3 70B)
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
- Disqualified: No email found, competitor, already a SigmaAI client

**Output:** Lead status → `qualified`

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

**Demo page** at `huntly.sigmaintel.io/demo/:leadId`:
- Business name + simulated WhatsApp conversation from demo_scenario
- CTA button → SigmaAI signup with UTM params: `appai.sigmaintel.io/signup?ref=huntly&lead={id}&vertical={vertical}`

**Stop conditions:**
- Lead clicks demo → pause drip
- Lead replies → pause drip + flag for manual follow-up
- Lead bounces → mark invalid
- Lead unsubscribes → mark permanently

**Sending discipline:**
- Send from subdomain: `outreach.huntly.io`
- Warm-up: 20 emails/day, ramp 20% daily over 2 weeks
- Daily cap: configurable, defaults to 50
- One-click unsubscribe header (CAN-SPAM / GDPR compliant)
- Resend handles SPF, DKIM, DMARC

### Webhook Tracking

Resend webhooks update `outreach_emails` in real-time:
- `email.delivered` → status = sent
- `email.opened` → status = opened, record opened_at
- `email.clicked` → status = clicked, record clicked_at, pause drip
- `email.bounced` → status = bounced, mark lead invalid
- `email.complained` → mark lead unsubscribed

Warm reply detection: inbound webhook or monitored reply-to address. Any reply triggers notification (configurable: Slack, WhatsApp, email).

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
│   ├── routes/
│   │   ├── campaign.routes.ts    # CRUD campaigns
│   │   ├── lead.routes.ts        # Browse/approve/reject leads
│   │   ├── outreach.routes.ts    # Email status, manual actions
│   │   ├── demo.routes.ts        # GET /demo/:leadId
│   │   └── webhook.routes.ts     # Resend webhooks
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
6. Cost stays under $5/mo at 100 leads/week

## Future (Not MVP)

- Dashboard UI for campaign management and funnel visualization
- Multi-tenancy: let other people use Huntly as a product
- A/B testing email subjects and hooks
- LinkedIn enrichment as secondary signal
- Auto-signup flow (lead clicks CTA → SigmaAI trial created automatically)
- Multi-channel: WhatsApp outreach in addition to email
