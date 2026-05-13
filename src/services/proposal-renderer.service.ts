/**
 * Authoritative visual spec lives in DESIGN.md at the repo root.
 *   - OKLCH color tokens
 *   - Fraunces + Inter type scale
 *   - Section rhythm (hero → stats → services → testimonials → contact → sales)
 *   - Component specs (diagnosis bullets, service cards, pull quotes, contact grid, etc.)
 *
 * Before editing this file or any template under src/templates/proposal/:
 *   - Invoke the `impeccable` skill (anti-slop, design discipline)
 *   - Invoke the `design-taste-frontend` and `ui-ux-pro-max` skills
 *   - Re-read DESIGN.md and PRODUCT.md anti-references
 *
 * This rule is mandated in CLAUDE.md at the repo root.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../lib/escape-html.js';
import { priceForTier, type Tier } from '../lib/pricing-tiers.js';
import { fetchUnsplash, VERTICAL_FALLBACK_QUERY, type UnsplashPhoto } from '../lib/unsplash.js';
import type { SiteContent, IconName } from './proposal-generator.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Template loading + caching                                         */
/* ------------------------------------------------------------------ */

const templateCache = new Map<string, string>();

function loadTemplate(relativePath: string): string {
  if (templateCache.has(relativePath)) return templateCache.get(relativePath)!;
  const html = readFileSync(
    resolve(__dirname, `../templates/proposal/${relativePath}`),
    'utf-8',
  );
  templateCache.set(relativePath, html);
  return html;
}

function substitute(template: string, fields: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(fields)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Safety guard for payment link URLs                                 */
/* ------------------------------------------------------------------ */

/** Only render a payment-link when the URL is plainly http(s) — blocks `javascript:` etc. */
function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

/* ------------------------------------------------------------------ */
/*  Icon SVGs (inline, keyed by IconName)                              */
/*  Dimensions omitted — CSS drives sizing per context                 */
/* ------------------------------------------------------------------ */

const ICON_SVG: Record<IconName, string> = {
  phone:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  globe:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  message:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  clock:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  star:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  shield:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  zap:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  mail:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
  mapPin:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
};

/* ------------------------------------------------------------------ */
/*  CTA href resolution                                                 */
/* ------------------------------------------------------------------ */

function resolveCtaHref(
  ctaAction: 'call' | 'email' | 'scroll-to-form',
  lead: { phone?: string | null; email?: string | null },
): string {
  if (ctaAction === 'call' && lead.phone) return `tel:${lead.phone}`;
  if (ctaAction === 'email' && lead.email) return `mailto:${lead.email}`;
  return '#accept-form';
}

/* ------------------------------------------------------------------ */
/*  Section renderers                                                   */
/* ------------------------------------------------------------------ */

function renderBrandHero(
  content: SiteContent,
  lead: { businessName: string },
  photo: UnsplashPhoto | null,
  ctaHref: string,
): string {
  const hasImage = photo !== null;

  const heroImgAlt = hasImage
    ? escapeHtml(photo.alt)
    : escapeHtml(lead.businessName);

  const attribution = hasImage
    ? `<a href="${escapeHtml(photo.attributionUrl)}" target="_blank" rel="noopener noreferrer" class="hero-attribution">${escapeHtml(photo.attribution)}</a>`
    : '';

  // Build the bg div's attributes in one place to avoid duplicate class attributes
  let bgAttrs = `class="hero-bg${hasImage ? '' : ' hero-no-image'}"`;
  if (hasImage) {
    bgAttrs += ` style="background-image: url('${escapeHtml(photo.url)}')"`;
  }

  const template = loadTemplate('sections/brand-hero.html');
  return substitute(template, {
    business_name:    escapeHtml(lead.businessName),
    tagline:          escapeHtml(content.brand.tagline),
    description:      escapeHtml(content.brand.description),
    cta_href:         escapeHtml(ctaHref),
    cta_label:        escapeHtml(content.hero.ctaLabel),
    hero_bg_attrs:    bgAttrs,
    hero_img_alt:     heroImgAlt,
    hero_attribution: attribution,
  });
}

function renderStats(
  content: SiteContent,
  lead: {
    googleRating?: number | null;
    googleReviewCount?: number | null;
  },
): string {
  if (!content.stats) return '';

  const rating = lead.googleRating;
  const reviewCount = lead.googleReviewCount;

  if (!rating && !reviewCount) return '';

  const parts: string[] = [];
  if (content.stats.showRating && rating) {
    parts.push(`${rating.toFixed(1)} stars`);
  }
  if (content.stats.showReviewCount && reviewCount) {
    parts.push(`${reviewCount.toLocaleString('en-US')} reviews on Google`);
  }

  if (parts.length === 0) return '';

  const ratingText = parts.join(' &middot; ');
  return substitute(loadTemplate('sections/stats-strip.html'), {
    rating_text: ratingText,
  });
}

function renderServices(content: SiteContent): string {
  const items = content.services
    .map((s) => `
<div class="service-card">
  <div class="service-icon-wrap" aria-hidden="true">${ICON_SVG[s.icon]}</div>
  <h3 class="service-title">${escapeHtml(s.title)}</h3>
  <p class="service-desc">${escapeHtml(s.description)}</p>
</div>`)
    .join('\n');
  return substitute(loadTemplate('sections/services.html'), { items });
}

function renderTestimonials(
  content: SiteContent,
  lead: { businessName: string },
): string {
  if (content.testimonials.length === 0) return '';
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.businessName)}`;
  const items = content.testimonials
    .map((t) => `
<article class="testimonial-item">
  <div class="testimonial-stars" aria-label="5 stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
  <blockquote class="testimonial-quote">&ldquo;${escapeHtml(t.quote)}&rdquo;</blockquote>
  <footer>
    <p class="testimonial-attribution">&#8212;&nbsp;${escapeHtml(t.attribution)}</p>
    <a href="${escapeHtml(googleMapsUrl)}" target="_blank" rel="noopener noreferrer" class="testimonial-google-link">Read more on Google &#8594;</a>
  </footer>
</article>`)
    .join('\n');
  return substitute(loadTemplate('sections/testimonials.html'), { items });
}

function renderContact(
  content: SiteContent,
  lead: { businessName: string },
): string {
  const pairs: Array<[string, string]> = [];
  if (content.contact.address)  pairs.push(['Address',  content.contact.address]);
  if (content.contact.phone)    pairs.push(['Phone',    content.contact.phone]);
  if (content.contact.whatsapp) pairs.push(['WhatsApp', content.contact.whatsapp]);
  if (content.contact.hours)    pairs.push(['Hours',    content.contact.hours]);

  if (pairs.length === 0) return '';

  const items = pairs
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt>\n<dd>${escapeHtml(value)}</dd>`)
    .join('\n');

  // Google Maps iframe if address is known
  let mapEmbed = '';
  if (content.contact.address) {
    const mapQuery = encodeURIComponent(`${content.contact.address} ${lead.businessName}`);
    mapEmbed = `<div class="contact-map"><iframe src="https://www.google.com/maps?q=${mapQuery}&output=embed" loading="lazy" title="Location map for ${escapeHtml(lead.businessName)}"></iframe></div>`;
  }

  return substitute(loadTemplate('sections/contact.html'), {
    headline: escapeHtml(content.contact.headline),
    items,
    map_embed: mapEmbed,
  });
}

function renderDiagnosis(content: SiteContent): string {
  const bullets = content.diagnosis.bullets
    .map((b) => `
<li class="diagnosis-item">
  <span class="diagnosis-icon">${ICON_SVG[b.icon]}</span>
  <div>
    <p class="diagnosis-label">${escapeHtml(b.label)}</p>
    <p class="diagnosis-evidence">${escapeHtml(b.evidence)}</p>
  </div>
</li>`)
    .join('\n');
  return substitute(loadTemplate('sections/diagnosis.html'), { bullets });
}

function splitPrice(cents: number): { currency: string; numeral: string } {
  const dollars = Math.round(cents / 100);
  return { currency: '$', numeral: dollars.toLocaleString('en-US') };
}

/** Legacy helper kept for the payment-link label (non-display context). */
function formatUsd(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString('en-US')}`;
}

function renderPricing(
  content: SiteContent,
  proposal: { finalTier: Tier | null; priceCents: number | null },
): string {
  const tier = proposal.finalTier ?? 'Starter';
  const cents = proposal.priceCents ?? priceForTier(tier);
  const { numeral } = splitPrice(cents);
  const valueBullets = content.pricingPitch.valueBullets
    .map((b) => `<li class="pricing-bullet"><span class="pricing-bullet-glyph" aria-hidden="true">&#9632;</span><span>${escapeHtml(b)}</span></li>`)
    .join('\n');

  return substitute(loadTemplate('sections/pricing.html'), {
    tier_label: escapeHtml(tier),
    headline: escapeHtml(content.pricingPitch.headline),
    price_numeral: numeral,
    value_bullets: valueBullets,
  });
}

function renderCtaForm(
  content: SiteContent,
  proposal: { token: string; paymentLinkUrl: string | null; finalTier: Tier | null; priceCents: number | null },
): string {
  const tier = proposal.finalTier ?? 'Starter';
  const cents = proposal.priceCents ?? priceForTier(tier);
  const paymentLinkButton = isSafeHttpUrl(proposal.paymentLinkUrl)
    ? `<a href="${escapeHtml(proposal.paymentLinkUrl)}" target="_blank" rel="noopener" class="payment-link">Pay ${formatUsd(cents)} via secure checkout</a>`
    : '';

  return substitute(loadTemplate('sections/cta-form.html'), {
    primary_label: escapeHtml(content.cta.primaryLabel),
    reassurance: escapeHtml(content.cta.reassurance),
    token: escapeHtml(proposal.token),
    payment_link_button: paymentLinkButton,
  });
}

function renderSalesSection(
  content: SiteContent,
  lead: { businessName: string },
  proposal: { token: string; finalTier: Tier | null; priceCents: number | null; paymentLinkUrl: string | null },
): string {
  const diagnosis = renderDiagnosis(content);
  const pricing = renderPricing(content, proposal);
  const ctaForm = renderCtaForm(content, proposal);

  return `
<section class="sales-section" id="accept-form">
  <div class="sales-inner">
    <p class="sales-caption">Draft preview</p>
    <h2 class="sales-heading">Want to publish this site for ${escapeHtml(lead.businessName)}?</h2>
    ${diagnosis}
    ${pricing}
    ${ctaForm}
  </div>
</section>`;
}

function renderFooter(): string {
  return loadTemplate('sections/site-footer.html');
}

/* ------------------------------------------------------------------ */
/*  Public renderers                                                    */
/* ------------------------------------------------------------------ */

export async function renderProposalView(args: {
  lead: {
    businessName: string;
    phone?: string | null;
    email?: string | null;
    googleRating?: number | null;
    googleReviewCount?: number | null;
    category?: string | null;
  };
  proposal: {
    token: string;
    finalTier: Tier | null;
    priceCents: number | null;
    paymentLinkUrl: string | null;
  };
  content: SiteContent;
}): Promise<string> {
  const ctaHref = resolveCtaHref(args.content.hero.ctaAction, {
    phone: args.lead.phone,
    email: args.lead.email,
  });

  // Fetch Unsplash image (non-blocking: null = CSS-only hero)
  const photo = await fetchUnsplash(
    args.content.hero.imageQuery,
    args.lead.category ?? undefined,
  );

  // Order: site mockup (hero → contact) reads first as the lead's actual
  // new website. Then the sales section with diagnosis + pricing + form.
  // The `proposalIntro` field exists in the schema (AI fills it) but is
  // intentionally not rendered — the draft-banner handles that framing.
  return substitute(loadTemplate('proposal-shell.html'), {
    business_name:  escapeHtml(args.lead.businessName),
    cta_href:       escapeHtml(ctaHref),
    cta_label:      escapeHtml(args.content.hero.ctaLabel),
    brand_hero:     renderBrandHero(args.content, args.lead, photo, ctaHref),
    stats:          renderStats(args.content, args.lead),
    services:       renderServices(args.content),
    testimonials:   renderTestimonials(args.content, args.lead),
    contact:        renderContact(args.content, args.lead),
    sales_section:  renderSalesSection(args.content, args.lead, args.proposal),
    site_footer:    renderFooter(),
  });
}

export async function renderLiveSite(args: {
  lead: {
    businessName: string;
    phone?: string | null;
    email?: string | null;
    googleRating?: number | null;
    googleReviewCount?: number | null;
    category?: string | null;
  };
  content: SiteContent;
}): Promise<string> {
  const ctaHref = resolveCtaHref(args.content.hero.ctaAction, {
    phone: args.lead.phone,
    email: args.lead.email,
  });

  const photo = await fetchUnsplash(
    args.content.hero.imageQuery,
    args.lead.category ?? undefined,
  );

  return substitute(loadTemplate('site-shell.html'), {
    business_name: escapeHtml(args.lead.businessName),
    cta_href:      escapeHtml(ctaHref),
    cta_label:     escapeHtml(args.content.hero.ctaLabel),
    brand_hero:    renderBrandHero(args.content, args.lead, photo, ctaHref),
    stats:         renderStats(args.content, args.lead),
    services:      renderServices(args.content),
    testimonials:  renderTestimonials(args.content, args.lead),
    contact:       renderContact(args.content, args.lead),
    site_footer:   renderFooter(),
  });
}
