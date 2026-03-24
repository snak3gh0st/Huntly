<p align="center">
  <h1 align="center">Huntly</h1>
  <p align="center">
    Intelligence-first lead generation and outreach engine for B2B SaaS.
    <br />
    Source from Google Maps. Enrich with AI. Outreach on autopilot.
    <br />
    <br />
    <a href="#quick-start">Quick Start</a>
    &nbsp;&middot;&nbsp;
    <a href="#features">Features</a>
    &nbsp;&middot;&nbsp;
    <a href="#api-reference">API Reference</a>
    &nbsp;&middot;&nbsp;
    <a href="https://github.com/snak3gh0st/Huntly/releases">Releases</a>
  </p>
</p>

<br />

## What is Huntly?

Huntly finds businesses on Google Maps, crawls their websites for contact signals, reads their Google reviews to find pain points, and uses AI to score and craft hyper-personalized outreach — then sends a 3-email drip sequence with a custom demo page tailored to each lead.

Instead of generic cold email, the first message references **real pain signals** from their reviews:

> *"Dr. Silva, 12 of your 340 Google reviews mention patients struggling to reach Odonto Premium by phone. What if every WhatsApp message got an instant, accurate reply?"*

Each lead gets a **personalized demo page** showing a simulated WhatsApp conversation for their business type — making value tangible in 10 seconds.

<br />

## Pipeline

```
┌─────────┐     ┌─────────┐     ┌──────────┐     ┌──────────┐
│  Source  │────▶│ Enrich  │────▶│ Qualify  │────▶│ Outreach │
└─────────┘     └─────────┘     └──────────┘     └──────────┘
 Google Maps     Website crawl    AI scoring       3-email drip
 via Apify       + review         0–100 fit        + demo page
                 analysis         + email hook      per lead
```

| Stage | What happens |
|-------|-------------|
| **Source** | Searches Google Maps for businesses by vertical and region. Deduplicates by Place ID. |
| **Enrich** | Crawls up to 5 pages per site — extracts emails, WhatsApp, chatbot, booking signals, social profiles. AI-analyzes Google reviews for pain signals. |
| **Qualify** | Scores each lead 0–100 on fit. Generates a personalized email hook and a simulated WhatsApp demo conversation. |
| **Outreach** | Sends a 3-email drip (Day 0, 3, 7) via Resend. Pauses on reply, bounce, or unsubscribe. Respects daily warm-up caps. |

<br />

## Features

**Lead Pipeline**
- 4-stage BullMQ worker pipeline (source → enrich → qualify → outreach)
- AI-powered review analysis — extracts pain signals like "slow response", "hard to reach"
- Website crawling for emails, WhatsApp, chatbot vendors, booking systems, social profiles
- AI qualification scoring with personalized email hooks and demo content
- Configurable max leads per region per campaign

**Outreach**
- 3-email drip sequence with per-lead personalized demo pages
- Email warm-up ramp: 20/day → 50/day over 2 weeks
- Open, click, bounce, and reply tracking via Resend webhooks
- Auto-pause drip on reply or unsubscribe
- CAN-SPAM & GDPR compliant (one-click unsubscribe, physical address, instant opt-out)

**Dashboard**
- Real-time funnel: sourced → enriched → qualified → contacted → replied → converted
- Live pipeline queue depths
- Campaign management — create, launch, pause, monitor
- Lead explorer with filters, sorting, and CSV export
- Email inbox with delivery status and engagement metrics
- Settings — toggle email, switch AI provider, manage keys (no restart needed)

**AI Providers** (switchable at runtime from the dashboard)
- **Ollama** — free, local inference
- **Groq** — fast cloud, Llama 3.3 70B (free tier)
- **OpenAI** — GPT-4o-mini fallback

<br />

## Tech Stack

| | Technology |
|---|-----------|
| **Runtime** | Node.js 22 &middot; TypeScript &middot; ESM |
| **Server** | Fastify 5 |
| **Queue** | BullMQ &middot; Redis 7 |
| **Database** | PostgreSQL 16 &middot; Prisma ORM |
| **AI** | Ollama &middot; Groq &middot; OpenAI |
| **Email** | Resend |
| **Scraping** | Apify (Google Maps) &middot; Cheerio (HTML) |
| **Frontend** | React 19 &middot; Vite &middot; Tailwind CSS 4 &middot; TanStack Query &middot; Recharts |

<br />

## Quick Start

### Option A: Docker (recommended)

```bash
git clone https://github.com/snak3gh0st/Huntly.git
cd Huntly

cp .env.example .env
# Edit .env — add your APIFY_API_TOKEN and ADMIN_API_KEY at minimum

docker compose up -d
docker compose exec huntly npx prisma migrate dev --name init
```

App is live at **http://localhost:3002**.

### Option B: Local development

**Prerequisites:** Node.js 22+, PostgreSQL 16+, Redis 7+, and either [Ollama](https://ollama.ai) or a Groq/OpenAI API key.

```bash
git clone https://github.com/snak3gh0st/Huntly.git
cd Huntly

npm install
npm --prefix dashboard install

cp .env.example .env
# Edit .env with your API keys

npx prisma migrate dev --name init
npm run seed            # sample campaign + email templates

npm run dev             # backend with hot reload
cd dashboard && npm run dev   # dashboard in a second terminal
```

### Option C: Full local stack with Ollama

```bash
npm run start:local
# Checks/starts Ollama, pulls the default model, launches Docker services
```

<br />

## Configuration

Copy `.env.example` and fill in the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `APIFY_API_TOKEN` | Yes | Google Maps scraper API token |
| `ADMIN_API_KEY` | Yes | Protects all `/api/*` endpoints |
| `AI_PROVIDER` | Yes | `ollama`, `groq`, or `openai` |
| `OLLAMA_URL` | If Ollama | Ollama server URL (default `http://localhost:11434`) |
| `OLLAMA_MODEL` | If Ollama | Model to use (default `qwen3.5:latest`) |
| `GROQ_API_KEY` | If Groq | Groq API key |
| `OPENAI_API_KEY` | If OpenAI | OpenAI API key |
| `EMAIL_ENABLED` | No | Set `true` to enable outreach (default `false`) |
| `RESEND_API_KEY` | If email | Resend API key |
| `RESEND_WEBHOOK_SECRET` | If email | Resend webhook signing secret |
| `SENDER_EMAIL` | If email | From address for outreach emails |
| `SENDER_NAME` | If email | From name (default `Huntly`) |
| `PHYSICAL_ADDRESS` | If email | CAN-SPAM compliant mailing address |
| `WARMUP_START_DATE` | If email | Start date for warm-up ramp |
| `BASE_URL` | If email | Public URL for demo/unsubscribe links |
| `PORT` | No | Server port (default `3002`) |

<br />

## Usage

### 1. Create a campaign

From the dashboard, or via API:

```bash
curl -X POST http://localhost:3002/api/campaigns \
  -H "x-api-key: YOUR_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "name": "Dental Q2 2026",
    "vertical": "dental_clinic",
    "regions": ["London,UK", "Dubai,AE"],
    "maxLeadsPerRegion": 50
  }'
```

### 2. Launch

```bash
curl -X POST http://localhost:3002/api/campaigns/{id}/launch \
  -H "x-api-key: YOUR_API_KEY"
```

The pipeline runs end-to-end automatically — sourcing, enriching, qualifying, and emailing without intervention.

### 3. Monitor

Watch the funnel fill up from the dashboard, or poll the API:

```json
GET /api/funnel

{
  "sourced": 287,
  "enriched": 245,
  "qualified": 230,
  "contacted": 185,
  "replied": 12,
  "converted": 3
}
```

### 4. Handle replies

When a lead replies the drip pauses automatically. Follow up personally with hot leads.

<br />

## Drip Sequence

| Day | Email | Strategy |
|-----|-------|----------|
| 0 | **The Mirror** | Pain signals from their reviews + personalized demo link |
| 3 | **Social Proof** | Case study from a similar business |
| 7 | **Direct Offer** | Clear CTA — "Reply with your WhatsApp number, we'll set it up" |

Drip pauses automatically on reply, bounce, or unsubscribe.

<br />

## API Reference

### Public endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/demo/:token` | Personalized demo page |
| `GET` | `/unsubscribe/:token` | Unsubscribe confirmation page |
| `POST` | `/unsubscribe/:token` | Process unsubscribe |
| `POST` | `/webhooks/resend` | Resend event webhooks |
| `POST` | `/webhooks/reply` | Inbound reply detection |

### Admin endpoints (require `x-api-key` header)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/campaigns` | Create campaign |
| `GET` | `/api/campaigns` | List campaigns |
| `GET` | `/api/campaigns/:id` | Campaign detail + funnel |
| `PATCH` | `/api/campaigns/:id` | Update campaign |
| `POST` | `/api/campaigns/:id/launch` | Launch pipeline |
| `GET` | `/api/campaigns/:id/leads` | List leads (filterable) |
| `GET` | `/api/campaigns/:id/leads/export` | Export leads as CSV |
| `GET` | `/api/leads/:id` | Lead detail |
| `POST` | `/api/leads/:id/approve` | Approve lead for outreach |
| `POST` | `/api/leads/:id/skip` | Skip lead |
| `POST` | `/api/leads/:id/convert` | Mark as converted |
| `POST` | `/api/leads/:id/pause-drip` | Pause drip manually |
| `GET` | `/api/campaigns/:id/emails` | List outreach emails |
| `GET` | `/api/funnel` | Aggregate funnel stats |
| `GET` | `/api/stats` | Sending stats |

<br />

## Project Structure

```
src/
├── index.ts                # Fastify server + worker bootstrap
├── config.ts               # Env validation (envalid)
├── lib/                    # Prisma, Redis, AI client, tokens
├── db/repositories/        # Data access layer
├── services/
│   ├── apify.service       # Google Maps search + contact extraction
│   ├── crawler.service     # Website signal extraction (Cheerio)
│   ├── review-analyzer     # AI pain signal extraction from reviews
│   ├── qualifier.service   # AI scoring + personalized content gen
│   ├── email.service       # Resend integration + HTML templates
│   └── demo-page.service   # Personalized WhatsApp demo pages
├── workers/
│   ├── source.worker       # Apify → Lead records
│   ├── enrich.worker       # Crawl + review analysis
│   ├── qualify.worker      # AI scoring → outreach queue
│   └── outreach.worker     # Drip engine + warm-up
├── routes/                 # Fastify HTTP endpoints
├── middleware/              # API key auth
└── templates/              # HTML email + demo + unsubscribe

dashboard/
├── src/
│   ├── pages/              # Dashboard, Campaigns, Leads, Emails, Settings
│   ├── hooks/              # TanStack Query API hooks
│   └── components/         # Layout, UI
└── package.json

prisma/
└── schema.prisma           # Database models
```

<br />

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Backend with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled backend |
| `npm run db:migrate` | Create Prisma migration |
| `npm run db:push` | Sync schema to DB (no migration file) |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run seed` | Seed sample campaign + email templates |
| `npm test` | Run tests |
| `npm run test:watch` | Tests in watch mode |
| `npm run start:local` | Bootstrap Ollama + Docker services |

<br />

## Cost

At ~100 leads/week:

| Service | Cost |
|---------|------|
| Apify (Google Maps + reviews) | ~$10/mo |
| Groq AI (Llama 3.3 70B) | Free tier |
| Resend (3K emails/mo) | Free tier |
| **Total** | **~$10/mo** |

Self-hosted Ollama brings AI cost to $0.

<br />

## Compliance

| Regulation | Implementation |
|------------|---------------|
| **CAN-SPAM** | Physical address footer, one-click unsubscribe, instant opt-out processing |
| **GDPR** | Immediate list suppression, no re-entry after unsubscribe |
| **Deliverability** | Email warm-up ramp (20→50/day), SPF/DKIM/DMARC via Resend |

<br />

## License

[MIT](LICENSE)
