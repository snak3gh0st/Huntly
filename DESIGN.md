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

**Container:** single-column reading flow, max-width `min(640px, calc(100% - 3rem))`, horizontally centered. No nested cards. No sidebars on the lead-facing pages.

**Vertical rhythm** (not uniform — deliberately varied to create rhythm):

```
hero          → diagnosis    : 4rem
diagnosis     → brand        : 5rem
brand         → services     : 4rem
services      → testimonials : 5rem
testimonials  → contact      : 4rem
contact       → pricing      : 6rem  (reset before the close)
pricing       → cta-form     : 2.5rem
cta-form      → footer       : 6rem
```

Within sections, paragraph rhythm is `0.75em` between paragraphs, `1.5em` before a fresh heading.

**Alignment:** body text flush-left, ragged right. Section captions (the all-caps small label above an h2) may sit aligned with the body or hang into the gutter (left-aligned at -2rem on wide viewports).

## Components

### Hero
- Eyebrow: small caps Inter 500 in `--ink-quiet`, set to ~1rem below the display heading.
- Display heading: Fraunces 600, business name. Optical size matters — load opsz≥48 axis.
- Tagline: body+1 (1.25rem), `--ink-muted`, 1.5rem below the display.
- Description: body, `--ink`, capped at 62ch.

### Diagnosis bullets
- NOT cards. Inline blocks separated by a thin top border (`1px solid --border`).
- Icon: 18px stroke icon in `--accent`, sits flush-left of the label.
- Label: Inter 600.
- Evidence: Inter 400 in `--ink-muted`, indented under the label by the icon width.
- Stack with 1.25rem vertical gap. First item has no top border.

### Services
- 2-column grid on viewports ≥640px (single column below).
- No cards. Type-only blocks.
- Service title: Inter 600, body+1 (1.125rem). Optional small icon inline at title baseline (16px, currentColor, no accent).
- Service description: body, `--ink-muted`. Max 200 chars.
- Grid gap: 2rem column, 2.5rem row.

### Testimonials
- Pull-quote treatment. Fraunces 600, italic, body+1 (1.25rem). Curly quotes via `&ldquo;…&rdquo;`.
- Attribution: Inter 500 small caps, `--ink-quiet`, leading em-dash typeset as `—`.
- Stack with 2rem gap. No cards, no boxed backgrounds.

### Contact
- Definition-list pattern. `<dl>` with `<dt>` (caption style — small caps, `--ink-quiet`) and `<dd>` (body, `--ink`).
- 2-column grid on viewports ≥640px (label column auto, value column 1fr) — but rendered as a single visual rhythm, not boxed.

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

### Footer
- One line. Inter 400 small in `--ink-quiet`. "Site by Huntly" with link to huntly.app.
- Centered or flush-left (matches the body alignment).

## Motion

Minimal. The page is read, not navigated.

- `prefers-reduced-motion: reduce` disables all motion.
- Hover transitions on links/buttons: `transition: color 120ms ease-out, background-color 120ms ease-out` only. No transform, no shadow.
- The page must paint within one frame after navigation. No fade-in. No skeleton.

## Bans (project-specific reinforcements over the shared design laws)

- No icons inside boxed chips on the services section.
- No side-stripe borders on diagnosis bullets, services cards, or anywhere.
- No "trusted by" logo strips, no fabricated stat counters, no countdown timers, no chatbot bubbles.
- No `background-clip: text` gradient text anywhere.
- No emoji used as a UI element (icons must be SVG).
- No images of people or businesses (we have no photo budget per lead).
