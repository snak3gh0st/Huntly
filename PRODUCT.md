# Product

## Register

brand

## Users

US small-business owners and the people they answer to — dentists, vets, law firms, restaurants, real-estate brokers, auto-service shops, salons, fitness studios. Typically 50–300 Google reviews, 1–5 locations. They open the rendered page from a cold email, on a phone or a laptop, while doing five other things. They have an existing website that they know is dated; they're skeptical of "let me redesign your site" pitches because they've heard it before from Wix resellers and freelancers who delivered template-grade work.

The decision the page is meant to drive: pay one flat fee for the website Huntly drafted for them. That decision happens in 30–60 seconds of scrolling, not after a sales call. So the design has to do the convincing.

## Product Purpose

The rendered per-lead site is a sales artifact AND the deliverable. If the lead accepts the proposal, the same content is deployed at `/sites/:slug` as their real website. So the page has two simultaneous jobs: (1) make the lead think *"this is way better than my current site"* within the first scroll, and (2) actually be the website we'll ship them. Quality has to clear both bars; there's no "we'll polish it after they pay."

Success looks like: a lead opens the proposal link, scrolls past the diagnosis card (which uses crawler signals + their actual Google review quotes), sees the brand hero + services + their own testimonials rendered into a polished page, and the answer to "should I do this?" becomes obvious before they reach the pricing card. Conversion target: the operator's volume bet (per-segment price ranges, see Pricing Model below) means the page has to convert at a rate where one closed lead per ~20 opens covers the AI generation cost plus operator time.

## Brand Personality

Confident. Warm. Modern.

This is the personality of the RENDERED SITE, not Huntly's own brand. It's the personality the small-business owner will inherit — the kind of voice a high-end local agency would bring to a dental clinic in Austin or a family law firm in Denver. Approachable, premium but never aloof, contemporary without chasing trends. Voice should sound like a competent professional describing what they do, not a copywriter selling them on themselves.

Emotional goals when the lead opens the page: trust (someone took this seriously), competence (this isn't AI sludge), recognition (this is actually my business, not a stock template), restraint (no one's shouting at me).

## Anti-references

**Don't look like Squarespace/Wix template defaults.** No stock photos of smiling diverse people on neutral backgrounds. No vague headlines like "Your trusted partner since 2010". No gradients on buttons. No identical 6-card icon grids labeled "Services" with generic line icons. No "Lorem ipsum"-shaped copy that could apply to any business.

**Don't look like a SaaS landing page.** No hero-metric template (giant number + small label + supporting stats + accent line). No "simple. powerful. modern." triplet copy. No glassmorphism backdrops. No side-stripe accent borders on feature cards. No "trusted by" logo strip for a single-location dental clinic.

**Don't look like AI slop.** No pure black backgrounds with neon accents applied to a vet clinic. No identical card grids repeated four times down the page. No em-dashes everywhere. No AI-generated 3D blob illustrations. No "the future of dentistry" framing. Nothing where a viewer could say "an LLM made this" without doubt.

**Don't look like a portfolio site or brutalist art project.** No wild experimental typography. No broken/asymmetric grids that disorient. No noise textures, drop shadows on text, or animations that compete with the content. The lead's customers need to be able to find a phone number.

## Design Principles

1. **Better than yours before look-at-us.** The page must beat the lead's current site on a side-by-side comparison. Trust and ROI come before craft showcase. If a design choice doesn't make the lead think "this would actually be my site, and it's good," cut it.

2. **Typography carries the weight, not photography.** We have no per-lead photo budget. Type is the primary visual medium — scale, weight contrast, line economy, restraint. Big headlines are allowed. Stock photos and AI-generated images are not.

3. **Specific over generic.** Every concrete signal we have (their actual review quotes, their actual service list, their actual location, their actual rating) appears in the page. Generic affirmation copy ("Your trusted partner") is forbidden — it's the single fastest tell that this is a template.

4. **Restraint over decoration.** The page is for a small business, not a design portfolio. Each element earns its place: a section that doesn't move the lead toward "yes" gets cut. No decorative dividers, no animated accents that compete with content, no second hero.

5. **Adapt without templating.** The same template renders for a dental clinic and a Mexican restaurant. The vertical-specific differences come from the content (service names, review quotes, brand tagline) — not from swapping CSS themes. The visual system has to flex without obviously template-shopping.

## Pricing Model

Price is a single one-time payment (build + 12 months hosting/maintenance). No subscriptions, no recurring billing — copy must never frame the price as "per month".

The price for a given proposal is determined by three inputs: **segment** (industry × business size), **price range** (a `[min, max]` set per segment), and **difficulty** (a 0–1 score that positions the final price inside the segment's range).

### Segments — industry × size

Segments are a 2D matrix. The row is the lead's industry; the column is their business size (proxied by Google review count). Each cell of the matrix has its own `[min, max]` price range. Industries with higher complexity / regulatory weight / craft requirements occupy higher cells; smaller businesses occupy lower cells.

**Industries** (TBD — fill in the list and order of complexity):

- `<TBD industry 1>` — e.g. `dental`
- `<TBD industry 2>` — e.g. `legal`
- `<TBD industry 3>` — e.g. `restaurant`
- `<TBD …>`
- `other` — fallback for anything not on the list above

**Size bands** (TBD — confirm or adjust the review-count cutoffs):

- `S` — `< <TBD> Google reviews`
- `M` — `<TBD>–<TBD> Google reviews`
- `L` — `<TBD>+ Google reviews`

**Price-range matrix** (TBD — fill in `[min, max]` USD per cell):

| Industry | S | M | L |
|---|---|---|---|
| `<TBD industry 1>` | $`<min>`–$`<max>` | $`<min>`–$`<max>` | $`<min>`–$`<max>` |
| `<TBD industry 2>` | $`<min>`–$`<max>` | $`<min>`–$`<max>` | $`<min>`–$`<max>` |
| `<TBD industry 3>` | $`<min>`–$`<max>` | $`<min>`–$`<max>` | $`<min>`–$`<max>` |
| `other`            | $`<min>`–$`<max>` | $`<min>`–$`<max>` | $`<min>`–$`<max>` |

### Difficulty — positions price inside the range

Difficulty is a single 0–1 score (0 = trivial build, 1 = worst-case). The final price is `min + difficulty × (max − min)`, rounded to the nearest whole dollar.

Inputs to the difficulty score:

1. **Field of work (industry) complexity** — implicit in the segment; treated as a baseline shift, not a difficulty input. Difficulty layers on *within* a segment.
2. **Quality / maturity of the lead's existing website** — derived from `src/services/lead-study.service.ts` audits (`designAudit`, `copyAudit`, `conversionAudit`). A polished existing site means the bar to "obviously better" is higher → higher difficulty. A 2008-era template with no booking flow → lower difficulty.
3. **Estimated build effort (operator hours)** — operator's expected hands-on time beyond the AI draft. Set by the operator on the draft view; biggest single driver of difficulty.

The operator sees the computed difficulty and the resulting price on the draft view and can override the difficulty (not the price directly) before approval. `priceCents` is locked at approval time from `segment` + `difficulty`, identically to how it was previously locked from `finalTier`.

## Accessibility & Inclusion

WCAG AA minimum across all generated pages: 4.5:1 contrast for body text, 3:1 for large text, focus-visible states on every interactive element, semantic HTML structure (`<main>`, `<section>`, `<h1>`/`<h2>` hierarchy, `<form>` for the accept form). All interactions must be keyboard-reachable. The accept-form has visible labels (not placeholder-only inputs).

Reduced-motion respected: any animation gated behind `prefers-reduced-motion`.

No regulated-industry claims in copy: the AI prompt already forbids medical/legal/financial superlatives ("best dentist", "guaranteed results", "expert legal advice"). Templates do not introduce claim language through static fragments either — no "trusted by thousands" banners or fabricated stat counters.
