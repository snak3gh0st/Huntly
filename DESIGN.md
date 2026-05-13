# Design

> Visual system for Huntly Sites — the per-lead website templates rendered by `src/services/proposal-renderer.service.ts`. Authoritative for `src/templates/proposal/*`. Other surfaces (the dashboard) override per task.

## Theme

Light, single mode. No dark variant in v1.

**Scene sentence:** A dental practice owner opens this link from a cold email on her iPhone, in her kitchen at 7:42am while making coffee, daylight through the window. (The light theme is forced by the audience and viewing context, not chosen aesthetically.)

## Color

Strategy: **Restrained.** Tinted warm neutrals carry the surface; one accent color is reserved for diagnosis-card icons only — it signifies "your current site is missing this." The accent never appears on the primary CTA, body copy, or decorative dividers. CTA gets visual weight from type-scale + container, not color.

OKLCH values (tinted toward warm/peach, no pure black or pure white):

```css
--bg:           oklch(0.985 0.005 60);     /* paper */
--surface:      oklch(0.965 0.007 65);     /* card / inset */
--border:       oklch(0.905 0.010 65);     /* hairlines */
--ink:          oklch(0.22 0.015 50);      /* primary text — warm near-black */
--ink-muted:    oklch(0.45 0.013 50);      /* secondary text */
--ink-quiet:    oklch(0.62 0.011 55);      /* metadata / captions */
--accent:       oklch(0.62 0.16 35);       /* terracotta — diagnosis icons only */
--accent-quiet: oklch(0.92 0.04 35);       /* accent-tinted background, used once max */
```

Forbidden: `#000`, `#fff`, any pure neutral, gradient buttons, gradient text. The accent (`--accent`) appears on a maximum of ~5% of the surface area — never as a section background, never on the primary CTA.

## Typography

**Fonts:** Two real fonts loaded via Google Fonts CDN, no build step.

- **Display + headings:** Fraunces (variable, weight 400/600, optical-size enabled). Used for hero headline, section headers, pull quotes, price numeral.
- **Body + UI:** Inter (variable, weight 400/500/600). Used for descriptions, list items, form labels, captions, CTA.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

**Scale** (each step ≥1.25× the previous):

```
display     clamp(2.4rem, 5vw + 1rem, 4.25rem)   Fraunces 600   line-height 1.05  letter-spacing -0.02em
h2          clamp(1.5rem, 1.5vw + 1rem, 2rem)    Fraunces 600   line-height 1.15  letter-spacing -0.01em
h3          1.125rem                             Inter 600      line-height 1.3
body        1.0625rem                            Inter 400      line-height 1.55
small       0.875rem                             Inter 400      line-height 1.5
caption     0.75rem                              Inter 500      line-height 1.4   letter-spacing 0.08em uppercase
price       clamp(3rem, 6vw + 1rem, 5.5rem)      Fraunces 600   line-height 1.0   letter-spacing -0.03em
```

**Measure:** body copy capped at 62ch maximum.

## Layout

**Container:** most sections use `max-width: min(960px, calc(100% - 3rem))`. The sales section and CTA form remain at `min(640px, calc(100% - 3rem))` for a focused reading width. No nested cards. No sidebars on the lead-facing pages.

**Section order** (updated 2026-05):

```
hero → stats (optional) → why-us (optional, _study.uniqueAngles >= 2)
     → services → what-changes (optional, _strategy.conversionOpportunities >= 2)
     → testimonials → contact → sales (proposal-only) → footer
```

**Vertical rhythm** (not uniform — deliberately varied to create rhythm):

```
hero          → stats         : 0 (adjacent)
stats         → why-us        : 0 (adjacent)
why-us        → services      : 0 (full-bleed bg change)
services      → what-changes  : 0 (hairline divider)
what-changes  → testimonials  : 0 (hairline divider)
testimonials  → contact       : 0 (hairline divider)
contact       → sales         : 0 (full-bleed bg change)
```

Section inner padding is `5rem` block (was 4rem). Hero is 90vh min desktop, 75vh mobile.

Within sections, paragraph rhythm is `0.75em` between paragraphs, `1.5em` before a fresh heading.

**Alignment:** body text flush-left, ragged right. Section captions (the all-caps small label above an h2) may sit aligned with the body or hang into the gutter (left-aligned at -2rem on wide viewports).

## Components

### Hero
- Full-width section, min 90vh desktop / 75vh mobile. Unsplash background image with OKLCH-tinted gradient overlay (`oklch(0.10 0.015 50 / 0.08)` to `oklch(0.10 0.015 50 / 0.55)`) plus an inset bottom shadow (`oklch(0.10 0.015 50 / 0.45)`) for legibility. If no image: plain `--surface` background.
- **Business name** (not tagline) is the display heading. Fraunces 600 at `clamp(3.5rem, 9vw + 1rem, 9rem)`, line-height 0.95, letter-spacing -0.03em. Tagline moves to a paragraph below.
- Eyebrow: small caps Inter 500, `{category} · {city}` derived from `_study.business.locationContext`. White on image, `--accent` color on plain surface.
- Thin horizontal rule (1px, 32px) between eyebrow and headline.
- Primary CTA: Fraunces 600 1.125rem, `--ink` bg, `--bg` text. Secondary quiet link to `#why`.
- Content in left 60% of a wide container (max 1100px), collapsing to 100% on mobile.
- Unsplash attribution: `0.6875rem` white 55% opacity link bottom-right. Required by Unsplash TOS.

### Sticky nav
- Position sticky, 56px height, 1px border-bottom `--border`. Backdrop-blur via `@supports` query (falls back to solid `--bg`).
- Business name in Fraunces 600 left side. Links (Why us / Services / Reviews / Contact) in center. CTA button (`--ink` bg, Fraunces 600 1rem) right.
- Active section highlighted via `aria-current="true"` + 1.5px solid underline in `--ink` (IntersectionObserver scrollspy).
- Mobile (640px and below): links + desktop CTA hidden; hamburger button shown. Tapping hamburger opens full-screen overlay with Fraunces display nav links.
- Mobile overlay closes on link tap, backdrop tap, or Escape key.

### Stats strip (optional)
- Rendered only when `content.stats !== null` AND lead has googleRating + googleReviewCount.
- `--surface` background, `padding-block: 2.5rem`. 3-column grid (rating | review count | optional `thirdMetric`). Each column: Fraunces 600 numeral + small caps caption.
- `stats.thirdMetric` is optional (`string<=60`): "12 years in Austin", "Bilingual service", etc. Renders as text in a smaller numeral size.

### Why Us section (optional)
- Rendered only when `_study.business.uniqueAngles` has at least 2 items.
- Full-bleed `--accent-quiet` background, 6rem padding. Wide container (960px).
- Each angle: Fraunces 600 numeral ("01", "02") in `--ink-quiet` at clamp(2.5–4rem) on left, body text (1.125rem) on right.
- Odd-indexed items shift right by 2rem (staggered asymmetry). Collapses to no offset on mobile.

### Diagnosis bullets
- NOT icons. Numbers ("01", "02") in Fraunces 600 1.75rem `--ink-quiet` on left.
- Label: Inter 600.
- Evidence: Inter 400 in `--ink-muted`.
- Stack separated by 1px top border. First item has no top border.

### Services
- Section with `--surface` background.
- **Service 01** (featured): displayed with icon badge + Fraunces display title (clamp 1.375–1.75rem) + expandable `<details>`/`<summary>` description.
- **Services 02+**: numbered rows (Fraunces "02", "03" in `--ink-quiet` clamp 2–3rem) + Inter 600 title + expandable `<details>` description. Hairline dividers between rows.
- `<details>`/`<summary>` with CSS chevron rotation at `details[open]`. No JS required.

### What Changes section (optional)
- Rendered only when `_strategy.conversionOpportunities` has at least 2 items.
- Each row: 3-column grid (`1fr auto 1fr`): "Today" gap text (muted) → arrow → "New site" fix text (primary weight). Hairline top borders between rows.
- Mobile: single column, arrow hidden.

### Testimonials
- Pull-quote treatment. 5 star glyphs in `--accent` above each quote (letter-spacing: 0.1em).
- Fraunces 600 italic at `clamp(1.5rem, 2vw + 1rem, 2.25rem)`. Large curly-quote glyph (`&ldquo;`) positioned absolute top-left in `--accent` at 3.5rem, opacity 0.7.
- Attribution: Inter 500 small caps, `--ink-quiet`.
- "Read more on Google →" link below attribution. Stack with 3rem gap.

### Section reveal motion (updated 2026-05)
**NOTE: This intentionally deviates from the previous DESIGN.md rule of "no fade-in / page must paint in one frame."** The user explicitly requested designed reveal motion. The new rule:
- JS adds `.js-reveal-enabled` to `<html>` on load. Only then do sections get `opacity:0; transform:translateY(20px)`.
- IntersectionObserver (threshold 0.1) adds `.in-view` triggering a 700ms cubic-bezier(0.16,1,0.3,1) transition.
- Hero (first `<section>`) is always exempt — never animated (it's LCP).
- Gated behind `prefers-reduced-motion: no-preference`. No motion when reduced-motion is requested.
- JS-disabled users see no opacity:0 — visible content always rendered.

### Contact
- Section with `--surface` background. 2-column desktop: `<dl>` card left, Google Maps iframe right (if address known).
- Definition-list: `<dt>` caption style (small caps, `--ink-quiet`), `<dd>` body `--ink`.
- Map: `<iframe src="https://www.google.com/maps?q=...&output=embed">` 280px height, 8px border-radius.

### Sales section (proposal-only)
- Full-bleed `--accent-quiet` background visually marking it as the sales chrome.
- Contains: caption "Draft preview", h2 "Want to publish this site for [Business]?", then diagnosis bullets, pricing, accept form.
- Max-width 640px container inside.

### Pricing
- Single block, no card. Tier label in caption style (small caps `--ink-quiet`) above the price.
- Price: display-scale Fraunces 600 numeral. Currency mark in superscript-style: aligned to the cap line, 50% scale.
- Sub-line: small body, `--ink-muted`. ("Year-1 package including 12 months hosting" — short.)
- Value bullets: short Inter 500 lines, each prefixed with a 6px `■` glyph in `--ink-quiet` (no green checkmarks).

### CTA form
- Visible labels above inputs. Labels in caption style (small caps `--ink-quiet`).
- Inputs: 1px border in `--border`, no fill. Focus state: 2px border in `--ink`, no glow.
- Primary button: Fraunces 600 at body+2, container `--ink` background, `--bg` text, 12px vertical padding, no border-radius shouting. Hover: `--ink` lightens to `oklch(0.30 0.015 50)`. No gradient.
- Optional secondary payment-link link sits below the primary, styled as a quiet text link with underline.

### Contact
- Section with `--surface` background. 2-column on desktop (`2fr 3fr`): left = contact card (`<dl>`) with `section-caption` + `section-heading` + address/phone/hours; right = Google Maps iframe (400px height, 8px border-radius).
- Mobile: stacks single column.

### Footer
- Multi-column on desktop (`2fr 1fr 1fr 1fr`). `--surface` background, `padding-block: 3rem`.
  - Col 1: business name (Fraunces 600) + tagline (small, `--ink-quiet`).
  - Col 2: "Services" label + anchor list for each service.
  - Col 3: "Contact" label + address + phone.
  - Col 4: "Built by" + Huntly link + optional Unsplash attribution.
- Single column stacked on mobile.

## Motion

Minimal. The page is read, not navigated.

- `prefers-reduced-motion: reduce` disables all motion.
- Hover transitions on links/buttons: `transition: color 120ms ease-out, background-color 120ms ease-out` only.
- **Section reveals** now included (see "Section reveal motion" above) but gated behind JS + reduced-motion check.
- `scroll-behavior: smooth` on `html` inside a `prefers-reduced-motion: no-preference` media query.
- No skeleton loaders, no page-entry fade (hero excluded from reveal).

### Scroll behavior
- `scroll-margin-top` on all `section[id]` equals sticky nav height (+ draft banner height on proposal view) so anchored sections clear the nav when scrolled to.

## Bans (project-specific reinforcements over the shared design laws)

- No icons inside boxed chips on the services section.
- No side-stripe borders on diagnosis bullets, services cards, or anywhere.
- No "trusted by" logo strips, no fabricated stat counters, no countdown timers, no chatbot bubbles.
- No `background-clip: text` gradient text anywhere.
- No emoji used as a UI element (icons must be SVG).
- Hero image and CTA button required. Image sourced from Unsplash per vertical using `hero.imageQuery`. No stock photos of people directly addressing the camera (no "smiling dentist", no "happy customer facing lens"). Aim for interior/exterior spaces, professional environments, or tools of the trade.
