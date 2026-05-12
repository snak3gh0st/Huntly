# Claude Code Conventions — Huntly

> This file is loaded into every Claude Code session on this repo. Rules below are not suggestions.

## Repository overview

Huntly is a lead-generation and outreach engine for B2B SaaS. Two products inside one repo:

1. **Huntly (operator tool)** — Node 22 / TypeScript / Fastify 5 / BullMQ / Prisma 7 / Postgres / Redis / React 19 dashboard. Sources leads from Google Maps, enriches via crawling, qualifies with AI, runs email drips via Resend.
2. **Huntly Sites** — AI-drafted one-page websites sold per lead. Operator generates → Claude (Anthropic) drafts content → human-coded template renders → lead pays via Stripe Payment Link → operator deploys to `/sites/:slug`. Lives in `src/templates/proposal/`, `src/services/proposal-*.service.ts`, `src/routes/proposal*.routes.ts`, `src/workers/proposal.worker.ts`, `dashboard/src/components/Proposal*`.

Authoritative design context:

- `PRODUCT.md` — register, audience, anti-references, principles.
- `DESIGN.md` — color tokens (OKLCH), type scale, component specs, motion rules.

Both files must be read before any UI change.

## Required skills for UI work

Before touching any of the following, you MUST invoke and follow these skills:

- `impeccable` — design intelligence, OKLCH discipline, anti-slop rules, structured workflow (teach → shape → craft → critique).
- `design-taste-frontend` — strict component architecture, no AI-default aesthetics, hardware-accelerated patterns.
- `ui-ux-pro-max` — UI/UX patterns, accessibility, motion, layout, color palette discipline.

Surfaces this rule applies to:

- `src/templates/proposal/**` — per-lead website templates (brand register per PRODUCT.md)
- `dashboard/src/**` — operator dashboard (product register, override per task)
- Any new HTML, CSS, or JSX in this repo

You may load all three skills for the same task. They reinforce each other. Skipping them produces generic output that ignores the project — which is the single largest design failure mode listed in PRODUCT.md anti-references.

The current visual implementation was built using `impeccable` (see commit history for `feat(sites): redesign templates per impeccable brief`). Future iterations on these surfaces must clear the same bar.

## Required discipline for AI prompt work

When editing prompts that drive the per-lead content generation (`src/services/proposal-generator.service.ts:buildSystemPrompt`):

- Read `PRODUCT.md` anti-references in full before changing any rule.
- The system prompt embeds project-specific bans (generic affirmation copy, SaaS triplet copy, em-dashes, fabricated trust signals). These bans are not stylistic preferences — they map directly to the anti-references in PRODUCT.md and removing them weakens the design discipline of every future proposal generation.
- Tests cover key prompt assertions (one-time pricing language, icon enum). Run `npx vitest run tests/services/proposal-generator.service.test.ts` after any prompt edit.

## Required discipline for backend work

- `src/services/proposal-*.service.ts`, `src/workers/proposal.worker.ts`, `src/routes/proposal*.routes.ts` — XSS-escaping of AI strings is non-negotiable. The renderer wraps every AI-generated field in `escapeHtml(...)`. The accept-form thank-you page in `proposal.routes.ts` does the same. Removing escape calls is a security regression.
- Operator-pasted Stripe Payment Links must pass the `isSafeHttpUrl` check (only `http://` or `https://` schemes render as the payment-link button). Do not relax this — `javascript:` URIs would be clickable.
- The status state machine (`generating → draft → approved → accepted → paid → deployed → failed`) is enforced server-side via `proposalRepo.updateIfStatusIn(id, from[], data)`. Do not bypass with raw `update()` for status changes.

## Testing convention

Vitest. Mock external dependencies (`vi.mock(...)`) BEFORE the `import` of the module under test — Vitest hoists `vi.mock` automatically. For shared state between hoisted mocks and test bodies, use `vi.hoisted(() => ({...}))` — see `tests/integration/proposal.flow.test.ts` for the pattern.

Pre-existing failing tests in `tests/services/qualifier.service.test.ts` and `tests/workers/enrich.worker.test.ts` predate the Huntly Sites work; ignore unless you're explicitly fixing them.

## Branch / PR workflow

- Feature branches: `feature/<topic>`
- Atomic commits per task — see `docs/superpowers/plans/2026-05-11-huntly-sites.md` for the granularity standard
- PR body documents: summary, test plan checklist, out-of-scope items
- `superpowers:requesting-code-review` for substantial PRs before merging

## What NOT to do

- Do not synthesize PRODUCT.md or DESIGN.md from a single prompt without running the `impeccable teach` interview properly.
- Do not "improve" templates by adding Tailwind CDN back, gradient buttons, side-stripe borders, glassmorphism, or hero-metric blocks. These are explicitly banned in PRODUCT.md and `impeccable`'s shared design laws.
- Do not relax the US-only guard on `POST /api/leads/:id/proposals` without an explicit product decision recorded.
- Do not add `@/` path aliases or restructure imports — the project uses explicit relative paths with `.js` extensions (ESM).
- Do not commit `docs/superpowers/` (it's gitignored intentionally — those are session-local artifacts).
