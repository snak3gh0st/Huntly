/**
 * Authoritative visual spec lives in DESIGN.md at the repo root.
 *   - OKLCH color tokens
 *   - Fraunces + Inter type scale
 *   - Section rhythm (hero → stats → why-us → services → what-changes →
 *     testimonials → contact → sales)
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
import type { LeadStudy } from './lead-study.service.js';
import type { Strategy } from './lead-strategy.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Extended content type: SiteContent + optional study/strategy       */
/* ------------------------------------------------------------------ */

type RichContent = SiteContent & {
  _study?: LeadStudy;
  _strategy?: Strategy;
};

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
  content: RichContent,
  lead: { businessName: string; category?: string | null },
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

  // Derive eyebrow from locationContext or category + businessName
  const locationCtx = content._study?.business.locationContext;
  const rawCategory = lead.category ?? '';
  // Map category slug to display string: "dental_clinic" → "Dental"
  const categoryDisplay = rawCategory
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  let eyebrow = '';
  if (locationCtx) {
    // Extract just the city from locationContext (first sentence)
    const city = locationCtx.split(/[.,]/)[0].trim();
    eyebrow = categoryDisplay ? `${categoryDisplay} &middot; ${escapeHtml(city)}` : escapeHtml(city);
  } else if (categoryDisplay) {
    eyebrow = escapeHtml(categoryDisplay);
  } else {
    eyebrow = escapeHtml(lead.businessName);
  }

  // Secondary CTA only renders when Why Us section will actually appear
  const hasWhyUs = (content._study?.business.uniqueAngles?.length ?? 0) >= 2;
  const secondaryCta = hasWhyUs
    ? `<a href="#why" class="hero-secondary-cta">${escapeHtml(content.hero.secondaryCtaLabel ?? 'See why')} &#8594;</a>`
    : '';

  const template = loadTemplate('sections/brand-hero.html');
  return substitute(template, {
    business_name:   escapeHtml(lead.businessName),
    tagline:         escapeHtml(content.brand.tagline),
    description:     escapeHtml(content.brand.description),
    cta_href:        escapeHtml(ctaHref),
    cta_label:       escapeHtml(content.hero.ctaLabel),
    secondary_cta:   secondaryCta,
    hero_bg_attrs:   bgAttrs,
    hero_img_alt:    heroImgAlt,
    hero_attribution: attribution,
    hero_eyebrow:    eyebrow,
  });
}

function renderStats(
  content: RichContent,
  lead: {
    googleRating?: number | null;
    googleReviewCount?: number | null;
  },
): string {
  if (!content.stats) return '';

  const rating = lead.googleRating;
  const reviewCount = lead.googleReviewCount;

  if (!rating && !reviewCount) return '';

  const ratingCol = (content.stats.showRating && rating)
    ? `<div class="stats-col">
        <span class="stats-numeral">${rating.toFixed(1)}</span>
        <span class="stats-caption">&#9733; Rating</span>
      </div>`
    : '';

  const reviewCol = (content.stats.showReviewCount && reviewCount)
    ? `<div class="stats-col">
        <span class="stats-numeral">${reviewCount.toLocaleString('en-US')}</span>
        <span class="stats-caption">Reviews on Google</span>
      </div>`
    : '';

  const thirdCol = content.stats.thirdMetric
    ? `<div class="stats-col">
        <span class="stats-numeral stats-numeral--text">${escapeHtml(content.stats.thirdMetric)}</span>
        <span class="stats-caption">Local presence</span>
      </div>`
    : '';

  // Only render the strip if we have at least one column
  if (!ratingCol && !reviewCol && !thirdCol) return '';

  return `<section class="stats-strip" aria-label="Rating and reviews">
  <div class="stats-inner">
    ${ratingCol}${reviewCol}${thirdCol}
  </div>
</section>`;
}

function renderWhyUs(
  content: RichContent,
  lead: { businessName: string },
): string {
  const uniqueAngles = content._study?.business.uniqueAngles ?? [];
  if (uniqueAngles.length < 2) return '';

  const items = uniqueAngles
    .map((angle, i) => {
      const num = String(i + 1).padStart(2, '0');
      const mod = i % 2 === 1 ? ' why-us-item--offset' : '';
      return `<div class="why-us-item${mod}">
  <span class="why-us-num" aria-hidden="true">${num}</span>
  <p class="why-us-text">${escapeHtml(angle)}</p>
</div>`;
    })
    .join('\n');

  return substitute(loadTemplate('sections/why-us.html'), {
    business_name: escapeHtml(lead.businessName),
    items,
  });
}

function renderServices(content: RichContent): string {
  const services = content.services;
  if (services.length === 0) return '';

  const featured = services[0];
  const featuredHtml = `<div class="service-featured">
  <div class="service-icon-wrap" aria-hidden="true">${ICON_SVG[featured.icon]}</div>
  <h3 class="service-featured-title">${escapeHtml(featured.title)}</h3>
  <details class="service-details">
    <summary class="service-summary">About this service</summary>
    <p class="service-details-body">${escapeHtml(featured.description)}</p>
  </details>
</div>`;

  const supporting = services.slice(1)
    .map((s, i) => {
      const num = String(i + 2).padStart(2, '0');
      return `<div class="service-row">
  <span class="service-row-num" aria-hidden="true">${num}</span>
  <div class="service-row-body">
    <p class="service-row-title">${escapeHtml(s.title)}</p>
    <details class="service-details">
      <summary class="service-summary">About this service</summary>
      <p class="service-details-body">${escapeHtml(s.description)}</p>
    </details>
  </div>
</div>`;
    })
    .join('\n');

  return substitute(loadTemplate('sections/services.html'), {
    featured_item:    featuredHtml,
    supporting_items: supporting,
  });
}

function renderWhatChanges(content: RichContent): string {
  const opps = content._strategy?.conversionOpportunities ?? [];
  if (opps.length < 2) return '';

  const rows = opps
    .map((opp) => `<div class="change-row">
  <div class="change-gap">
    <span class="change-gap-label" aria-hidden="true">Today</span>
    <p class="change-gap-text">${escapeHtml(opp.gap)}</p>
  </div>
  <div class="change-arrow" aria-hidden="true">&#8594;</div>
  <div class="change-fix">
    <span class="change-fix-label" aria-hidden="true">New site</span>
    <p class="change-fix-text">${escapeHtml(opp.fix)}</p>
  </div>
</div>`)
    .join('\n');

  return substitute(loadTemplate('sections/what-changes.html'), { rows });
}

function renderTestimonials(
  content: RichContent,
  lead: { businessName: string },
): string {
  if (content.testimonials.length === 0) return '';
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.businessName)}`;
  const items = content.testimonials
    .map((t) => `
<article class="testimonial-item">
  <div class="testimonial-stars" aria-label="5 stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
  <blockquote class="testimonial-quote">
    <span class="testimonial-curly-quote" aria-hidden="true">&ldquo;</span>
    <span class="testimonial-quote-text">${escapeHtml(t.quote)}&rdquo;</span>
  </blockquote>
  <footer>
    <p class="testimonial-attribution">${escapeHtml(t.attribution)}</p>
    <a href="${escapeHtml(googleMapsUrl)}" target="_blank" rel="noopener noreferrer" class="testimonial-google-link">Read more on Google &#8594;</a>
  </footer>
</article>`)
    .join('\n');
  return substitute(loadTemplate('sections/testimonials.html'), { items });
}

function renderContact(
  content: RichContent,
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

function renderDiagnosis(content: RichContent): string {
  const bullets = content.diagnosis.bullets
    .map((b, i) => {
      const num = String(i + 1).padStart(2, '0');
      return `
<li class="diagnosis-item">
  <span class="diagnosis-num" aria-hidden="true">${num}</span>
  <div>
    <p class="diagnosis-label">${escapeHtml(b.label)}</p>
    <p class="diagnosis-evidence">${escapeHtml(b.evidence)}</p>
  </div>
</li>`;
    })
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
  content: RichContent,
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
  content: RichContent,
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
  content: RichContent,
  lead: { businessName: string },
  proposal: { token: string; finalTier: Tier | null; priceCents: number | null; paymentLinkUrl: string | null },
): string {
  const diagnosis = renderDiagnosis(content);
  const pricing = renderPricing(content, proposal);
  const ctaForm = renderCtaForm(content, proposal);

  return `
<section class="sales-section" id="accept-form">
  <div class="sales-inner">
    <p class="sales-caption"><span class="sales-caption-mark" aria-hidden="true">&#9670;</span> Draft preview</p>
    <h2 class="sales-heading">Want to publish this site for ${escapeHtml(lead.businessName)}?</h2>
    ${diagnosis}
    <div class="sales-pricing-card">
      ${pricing}
    </div>
    ${ctaForm}
  </div>
</section>`;
}

function renderFooter(
  content: RichContent,
  lead: { businessName: string },
  photo: UnsplashPhoto | null,
): string {
  const servicesLinks = content.services
    .map((s) => `<li><a href="#services">${escapeHtml(s.title)}</a></li>`)
    .join('\n');

  const contactSummary: string[] = [];
  if (content.contact.address) contactSummary.push(escapeHtml(content.contact.address));
  if (content.contact.phone)   contactSummary.push(escapeHtml(content.contact.phone));

  const attribution = photo
    ? `<li>Photos via <a href="${escapeHtml(photo.attributionUrl)}" target="_blank" rel="noopener">Unsplash</a></li>`
    : '';

  const tagline = content.brand.tagline ? `<p class="footer-tagline">${escapeHtml(content.brand.tagline)}</p>` : '';

  return `<footer class="page-footer">
  <div class="footer-inner">
    <div class="footer-col footer-col--brand">
      <p class="footer-name">${escapeHtml(lead.businessName)}</p>
      ${tagline}
    </div>
    <div class="footer-col">
      <p class="footer-col-label">Services</p>
      <ul class="footer-list">${servicesLinks}</ul>
    </div>
    <div class="footer-col">
      <p class="footer-col-label">Contact</p>
      <ul class="footer-list">
        ${contactSummary.map((c) => `<li>${c}</li>`).join('\n')}
        ${attribution}
      </ul>
    </div>
    <div class="footer-col">
      <p class="footer-col-label">Built by</p>
      <ul class="footer-list">
        <li><a href="https://huntly.app" target="_blank" rel="noopener">Huntly Sites</a></li>
      </ul>
    </div>
  </div>
</footer>`;
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
  content: SiteContent & { _study?: LeadStudy; _strategy?: Strategy };
}): Promise<string> {
  const content: RichContent = args.content;

  const ctaHref = resolveCtaHref(args.content.hero.ctaAction, {
    phone: args.lead.phone,
    email: args.lead.email,
  });

  // Fetch Unsplash image (non-blocking: null = CSS-only hero)
  const photo = await fetchUnsplash(
    args.content.hero.imageQuery,
    args.lead.category ?? undefined,
  );

  // Whether Why Us section will render — drives nav link and secondary CTA
  const hasWhyUsProposal = (content._study?.business.uniqueAngles?.length ?? 0) >= 2;
  const whyNavLink = hasWhyUsProposal ? '<li><a href="#why">Why us</a></li>' : '';

  // Order: site mockup (hero → stats → why-us → services → what-changes →
  // testimonials → contact) reads first as the lead's actual new website.
  // Then the sales section with diagnosis + pricing + form.
  return substitute(loadTemplate('proposal-shell.html'), {
    business_name:  escapeHtml(args.lead.businessName),
    cta_href:       escapeHtml(ctaHref),
    cta_label:      escapeHtml(args.content.hero.ctaLabel),
    brand_hero:     renderBrandHero(content, args.lead, photo, ctaHref),
    stats:          renderStats(content, args.lead),
    why_nav_link:   whyNavLink,
    why_us:         renderWhyUs(content, args.lead),
    services:       renderServices(content),
    what_changes:   renderWhatChanges(content),
    testimonials:   renderTestimonials(content, args.lead),
    contact:        renderContact(content, args.lead),
    sales_section:  renderSalesSection(content, args.lead, args.proposal),
    site_footer:    renderFooter(content, args.lead, photo),
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
  content: SiteContent & { _study?: LeadStudy; _strategy?: Strategy };
}): Promise<string> {
  const content: RichContent = args.content;

  const ctaHref = resolveCtaHref(args.content.hero.ctaAction, {
    phone: args.lead.phone,
    email: args.lead.email,
  });

  const photo = await fetchUnsplash(
    args.content.hero.imageQuery,
    args.lead.category ?? undefined,
  );

  // Whether Why Us section will render — drives nav link and secondary CTA
  const hasWhyUsSite = (content._study?.business.uniqueAngles?.length ?? 0) >= 2;
  const whyNavLinkSite = hasWhyUsSite ? '<li><a href="#why">Why us</a></li>' : '';

  return substitute(loadTemplate('site-shell.html'), {
    business_name: escapeHtml(args.lead.businessName),
    cta_href:      escapeHtml(ctaHref),
    cta_label:     escapeHtml(args.content.hero.ctaLabel),
    brand_hero:    renderBrandHero(content, args.lead, photo, ctaHref),
    stats:         renderStats(content, args.lead),
    why_nav_link:  whyNavLinkSite,
    why_us:        renderWhyUs(content, args.lead),
    services:      renderServices(content),
    what_changes:  renderWhatChanges(content),
    testimonials:  renderTestimonials(content, args.lead),
    contact:       renderContact(content, args.lead),
    site_footer:   renderFooter(content, args.lead, photo),
  });
}
