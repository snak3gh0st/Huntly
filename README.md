# Huntly

Intelligence-first lead generation engine. Crawls Google Maps to find businesses, analyzes their reviews for pain signals, and sends hyper-personalized email outreach that converts.

## How It Works

```
Source → Enrich → Qualify → Outreach
```

1. **Source** — Queries Google Maps via Outscraper for businesses matching your target vertical and regions
2. **Enrich** — Crawls each business website (emails, WhatsApp, chatbot, booking) + AI-analyzes their Google reviews for pain signals ("slow response", "hard to reach")
3. **Qualify** — AI scores each lead (0-100) and generates a personalized email hook + simulated WhatsApp demo conversation
4. **Outreach** — Sends a 3-email drip sequence via Resend with a personalized demo page per lead

## The Differentiator

Instead of generic cold email, Huntly uses review pain signals in the first email:

> "Dr. Silva, 12 of your 340 Google reviews mention patients struggling to reach Odonto Premium by phone. What if every WhatsApp message got an instant, accurate reply?"

Each lead gets a **personalized demo page** showing a simulated WhatsApp conversation tailored to their business — making the value tangible in 10 seconds.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22, TypeScript (ESM) |
| HTTP | Fastify |
| Jobs | BullMQ + Redis |
| Database | PostgreSQL + Prisma |
| Web Crawling | Cheerio + Playwright |
| AI | Groq (Llama 3.3 70B) with GPT-4o-mini fallback |
| Email | Resend |
| Lead Sourcing | Outscraper API |

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- Redis 7+

### Setup

```bash
# Clone and install
git clone https://github.com/your-username/huntly.git
cd huntly
npm install

# Configure
cp .env.example .env
# Edit .env with your API keys (Outscraper, Groq, OpenAI, Resend)

# Database
npx prisma migrate dev --name init

# Install Playwright browser
npx playwright install chromium
```

### With Docker

```bash
cp .env.example .env
# Edit .env with your API keys

docker compose up -d
docker compose exec huntly npx prisma migrate dev --name init
```

### Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Usage

### 1. Create a Campaign

```bash
npm run seed -- --vertical dental_clinic --regions "London,UK" "Dubai,AE" --name "Dental Q2 2026"
```

### 2. Launch It

```bash
curl -X POST http://localhost:3001/api/campaigns/{id}/launch \
  -H "x-api-key: YOUR_API_KEY"
```

The pipeline runs automatically from here. Leads are sourced, enriched, qualified, and emailed without intervention.

### 3. Monitor the Funnel

```bash
curl http://localhost:3001/api/funnel -H "x-api-key: YOUR_API_KEY"
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

The drip stops automatically when a lead clicks, replies, bounces, or unsubscribes.

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
| Outscraper (places + reviews) | ~$10/mo |
| Groq AI | $0 (free tier) |
| Resend | $0 (free tier: 3K emails/mo) |
| **Total** | **~$10-12/mo** |

## Testing

```bash
npm test          # Run all tests (188 tests)
npm run test:watch  # Watch mode
```

## Project Structure

```
src/
├── index.ts              # Fastify server + worker bootstrap
├── config.ts             # Environment validation
├── lib/                  # Shared utilities (Redis, Prisma, AI, tokens)
├── db/repositories/      # Database access layer (6 repos)
├── services/             # Business logic
│   ├── outscraper        # Google Maps search + reviews
│   ├── crawler           # Website signal extraction
│   ├── review-analyzer   # AI review pain signal analysis
│   ├── qualifier         # AI lead scoring + content gen
│   ├── email             # Resend sending + template rendering
│   └── demo-page         # Demo page rendering
├── workers/              # BullMQ pipeline workers
│   ├── source            # Outscraper → raw leads
│   ├── enrich            # Crawl + review analysis
│   ├── qualify           # AI scoring + routing
│   └── outreach          # Drip engine
├── routes/               # Fastify HTTP endpoints
├── middleware/            # API key auth
└── templates/            # HTML email + demo + unsubscribe templates
```

## License

[MIT](LICENSE)
