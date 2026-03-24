# Huntly

Intelligence-first lead generation and outreach engine for B2B SaaS companies targeting small and medium businesses.

Huntly sources leads from Google Maps, enriches them by crawling websites and analyzing reviews for pain signals, scores them with AI, and runs hyper-personalized drip email campaigns — all from a single dashboard.

## How It Works

```
Source → Enrich → Qualify → Outreach
```

1. **Source** — Searches Google Maps via Apify for businesses matching your target vertical and regions
2. **Enrich** — Crawls each business website (emails, WhatsApp, chatbot, booking, social profiles) + AI-analyzes their Google reviews for pain signals
3. **Qualify** — AI scores each lead 0–100 based on fit indicators and generates a personalized email hook + simulated WhatsApp demo conversation
4. **Outreach** — Sends a 3-email drip sequence via Resend with a personalized demo page per lead

## The Differentiator

Instead of generic cold email, Huntly uses review pain signals in the first email:

> "Dr. Silva, 12 of your 340 Google reviews mention patients struggling to reach Odonto Premium by phone. What if every WhatsApp message got an instant, accurate reply?"

Each lead gets a **personalized demo page** showing a simulated WhatsApp conversation tailored to their business — making the value tangible in 10 seconds.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22, TypeScript (ESM) |
| HTTP | Fastify 5 |
| Jobs | BullMQ + Redis 7 |
| Database | PostgreSQL 16 + Prisma ORM |
| Web Crawling | Playwright + Cheerio |
| AI | Ollama (local) / Groq (fast cloud) / OpenAI (fallback) |
| Email | Resend |
| Lead Sourcing | Apify (Google Maps Scraper) |
| Frontend | React 19 + Vite + Tailwind CSS 4 + TanStack Query |
| Charts | Recharts |

## Dashboard

Real-time dashboard served directly from the backend:

- **Funnel visualization** — sourced → enriched → qualified → contacted → replied → converted
- **Pipeline status** — live job counts for each BullMQ queue
- **Campaign management** — create, launch, pause, and monitor multiple campaigns
- **Lead explorer** — filter and sort by status, qualification score, region, category
- **Email inbox** — recent emails with delivery status and engagement tracking (opens/clicks)
- **Settings** — toggle email sending, switch AI provider, manage API keys

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- Redis 7+
- [Ollama](https://ollama.ai) (for local AI) or a Groq/OpenAI API key

### Setup

```bash
# Clone and install
git clone https://github.com/snak3gh0st/Huntly.git
cd Huntly
npm install
npm --prefix dashboard install

# Configure
cp .env.example .env
# Edit .env with your API keys

# Database
npx prisma migrate dev --name init

# Install Playwright browser
npx playwright install chromium

# Seed sample campaign + email templates
npm run seed
```

### With Docker

```bash
cp .env.example .env
# Edit .env with your API keys

docker compose up -d
docker compose exec huntly npx prisma migrate dev --name init
```

### Full Local Stack (with Ollama)

```bash
npm run start:local
# Checks/starts Ollama, pulls the default model, starts Docker services
```

### Run

```bash
# Backend (with hot reload)
npm run dev

# Dashboard (separate terminal)
cd dashboard && npm run dev
```

The app runs at `http://localhost:3002` with the dashboard served from `/`.

## Environment Variables

```bash
# Database & Queue
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/huntly_db
REDIS_URL=redis://localhost:6379

# Lead Sourcing
APIFY_API_TOKEN=           # Required — Google Maps scraper

# AI Provider (pick one, switchable at runtime via dashboard)
AI_PROVIDER=ollama         # ollama | groq | openai
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.5:latest
GROQ_API_KEY=
OPENAI_API_KEY=

# Email (optional — set EMAIL_ENABLED=true to turn on outreach)
EMAIL_ENABLED=false
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
SENDER_EMAIL=hello@yourdomain.com
SENDER_NAME=Huntly
PHYSICAL_ADDRESS="Your physical address"
WARMUP_START_DATE=2026-03-19

# Server
BASE_URL=https://yourdomain.com
PORT=3002
NODE_ENV=development
ADMIN_API_KEY=             # Protects API endpoints
```

## Usage

### 1. Create a Campaign

Use the dashboard or the API:

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

### 2. Launch It

```bash
curl -X POST http://localhost:3002/api/campaigns/{id}/launch \
  -H "x-api-key: YOUR_API_KEY"
```

The pipeline runs automatically. Leads are sourced, enriched, qualified, and emailed without intervention.

### 3. Monitor

Track progress from the dashboard or the API:

```bash
curl http://localhost:3002/api/funnel -H "x-api-key: YOUR_API_KEY"
```

```json
{
  "sourced": 287,
  "enriched": 245,
  "qualified": 230,
  "contacted": 185,
  "replied": 12,
  "converted": 3
}
```

### 4. Handle Replies

When leads reply, the drip pauses automatically. You follow up personally with hot leads.

## Drip Sequence

| Day | Email | Strategy |
|-----|-------|----------|
| 0 | The Mirror | Pain signals from their reviews + personalized demo link |
| 3 | Social Proof | Case study from a similar business |
| 7 | Direct Offer | "Reply with your WhatsApp number, we'll set it up" |

The drip stops automatically when a lead replies, bounces, or unsubscribes.

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/demo/:token` | Personalized demo page |
| GET | `/unsubscribe/:token` | Unsubscribe confirmation |
| POST | `/unsubscribe/:token` | Process unsubscribe |
| POST | `/webhooks/resend` | Resend event webhooks |
| POST | `/webhooks/reply` | Inbound reply detection |

### Admin (requires `x-api-key` header)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/campaigns` | List campaigns |
| GET | `/api/campaigns/:id` | Campaign detail + funnel |
| PATCH | `/api/campaigns/:id` | Update campaign |
| POST | `/api/campaigns/:id/launch` | Launch campaign |
| GET | `/api/campaigns/:id/leads` | List leads (filterable) |
| GET | `/api/campaigns/:id/leads/export` | Export leads as CSV |
| GET | `/api/leads/:id` | Lead detail |
| POST | `/api/leads/:id/approve` | Approve lead for outreach |
| POST | `/api/leads/:id/skip` | Skip lead |
| POST | `/api/leads/:id/convert` | Mark as converted |
| GET | `/api/funnel` | Aggregate funnel stats |
| GET | `/api/campaigns/:id/emails` | List outreach emails |
| POST | `/api/leads/:id/pause-drip` | Pause drip manually |
| GET | `/api/stats` | Sending stats |

## Compliance

- **CAN-SPAM**: Physical address in every email, one-click unsubscribe, instant processing
- **GDPR**: Immediate unsubscribe, no re-entry after opt-out
- **Email Deliverability**: Domain warm-up (20/day → 50/day over 2 weeks), SPF/DKIM/DMARC via Resend

## Cost

At ~100 leads/week:

| Service | Cost |
|---------|------|
| Apify (Google Maps + reviews) | ~$10/mo |
| Groq AI | $0 (free tier) |
| Resend | $0 (free tier: 3K emails/mo) |
| **Total** | **~$10/mo** |

Self-hosted Ollama brings AI cost to $0.

## Scripts

```bash
npm run dev            # Backend with hot reload
npm run build          # Compile TypeScript
npm start              # Run compiled backend
npm run db:migrate     # Create Prisma migration
npm run db:push        # Sync schema to DB
npm run db:studio      # Open Prisma Studio
npm run seed           # Seed sample campaign + templates
npm test               # Run tests
npm run test:watch     # Watch mode
npm run start:local    # Bootstrap Ollama + Docker services
```

## Project Structure

```
src/
├── index.ts              # Fastify server + worker bootstrap
├── config.ts             # Environment validation
├── lib/                  # Shared utilities (Redis, Prisma, AI, tokens)
├── db/repositories/      # Database access layer
├── services/             # Business logic
│   ├── apify             # Google Maps search + contact extraction
│   ├── crawler           # Website signal extraction
│   ├── review-analyzer   # AI review pain signal analysis
│   ├── qualifier         # AI lead scoring + content gen
│   ├── email             # Resend sending + template rendering
│   └── demo-page         # Personalized demo page rendering
├── workers/              # BullMQ pipeline workers
│   ├── source            # Apify → raw leads
│   ├── enrich            # Crawl + review analysis
│   ├── qualify           # AI scoring + routing
│   └── outreach          # Drip engine
├── routes/               # Fastify HTTP endpoints
├── middleware/            # API key auth
└── templates/            # HTML email + demo + unsubscribe templates

dashboard/
├── src/
│   ├── pages/            # Dashboard, Campaigns, Leads, Emails, Settings
│   ├── hooks/            # React Query API hooks
│   └── components/       # Layout, UI components
└── package.json
```

## License

[MIT](LICENSE)
