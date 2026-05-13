import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Unsplash so tests never make real HTTP calls.
// The mock returns null (no image) — renderer falls back to CSS-only hero.
vi.mock('../../src/lib/unsplash.js', () => ({
  fetchUnsplash: vi.fn().mockResolvedValue(null),
  VERTICAL_FALLBACK_QUERY: {},
}));

import {
  renderProposalView,
  renderLiveSite,
} from '../../src/services/proposal-renderer.service.js';
import type { SiteContent } from '../../src/services/proposal-generator.service.js';
import type { LeadStudy } from '../../src/services/lead-study.service.js';
import type { Strategy } from '../../src/services/lead-strategy.service.js';

const STUDY: LeadStudy = {
  currentSite: {
    hasWebsite: true,
    domain: 'smilefamilydental.example',
    extractedHeadlines: ['Welcome to our clinic'],
    extractedServices: ['Cleanings', 'Whitening'],
    designAssessment: 'Outdated 2012-era template with no mobile support.',
    weaknesses: [
      'No online booking widget',
      'Phone number not in header',
      'Desktop-only layout',
    ],
    missingFeatures: ['Online booking', 'Live chat'],
    copyToneNow: 'Generic and formal; reads like a brochure from 2010.',
  },
  business: {
    actualServices: ['Cleanings', 'Annual checkups', 'Whitening', 'Emergency care'],
    targetCustomers: 'Families in Austin seeking affordable, friendly dental care.',
    uniqueAngles: [
      'Same-day emergency appointments available',
      'Bilingual staff (English and Spanish)',
      'No-surprise pricing with upfront estimates',
    ],
    locationContext: 'Austin, Texas — growing South Congress neighborhood.',
  },
  voice: {
    customerLanguage: ['"They fit me in same day"', '"Very gentle with my kids"'],
    keyPainPoints: ['Long wait times at other clinics', 'Unclear pricing'],
    keyAspirations: ['Quick appointments', 'Transparent costs'],
  },
};

const STRATEGY: Strategy = {
  heroAngle: "Austin's only dental clinic that guarantees same-day slots for urgent care.",
  conversionOpportunities: [
    { gap: 'No online booking — patients must call during business hours', fix: 'Online booking widget available 24/7 from any device' },
    { gap: 'Phone number buried in the footer', fix: 'Click-to-call in the nav and hero, visible on every scroll position' },
    { gap: 'English-only site excludes 30% of the neighborhood', fix: 'Bilingual copy and a Spanish-language toggle' },
  ],
  copyTone: 'Warm and direct — like a trusted neighbor who happens to be a dentist.',
  designPriorities: ['Mobile-first layout', 'Clear hierarchy on service pages', 'Fast LCP'],
  manifestoSeed: 'Because your smile should never wait.',
};

const CONTENT: SiteContent & { _study?: LeadStudy; _strategy?: Strategy } = {
  brand: { tagline: 'Premier dental care', description: 'A family clinic in Austin.' },
  hero: {
    imageQuery: 'modern dental office Austin',
    ctaLabel:   'Book Appointment',
    ctaAction:  'call',
    secondaryCtaLabel: 'See why we\'re different',
  },
  stats: {
    showRating: true,
    showReviewCount: true,
    thirdMetric: '12 years in Austin',
  },
  services: [
    { icon: 'phone', title: 'Cleanings', description: 'Routine cleanings that keep your smile bright.' },
    { icon: 'calendar', title: 'Checkups', description: 'Annual checkups with digital X-rays included.' },
    { icon: 'star', title: 'Whitening', description: 'In-office whitening with same-day results.' },
    { icon: 'shield', title: 'Emergency', description: 'Same-day urgent care for dental emergencies.' },
  ],
  testimonials: [{ quote: 'Great service & staff', attribution: 'Sarah on Google' }],
  contact: {
    headline: 'Visit us',
    address: '123 Main St',
    phone: '+15551234567',
    whatsapp: null,
    hours: 'Mon-Fri 9-5',
  },
  proposalIntro: { salutation: 'Hi Dr. Silva,', pitch: 'Here is the draft.' },
  diagnosis: {
    bullets: [
      { icon: 'clock', label: 'Slow replies', evidence: '12 reviews mention waiting.' },
      { icon: 'message', label: 'No booking', evidence: '5 reviewers asked.' },
    ],
  },
  pricingPitch: {
    headline: 'One payment, full website',
    valueBullets: ['12 mo hosting', 'Same-day deployment'],
  },
  cta: { primaryLabel: 'Accept Proposal', reassurance: '30-day support' },
  _study: STUDY,
  _strategy: STRATEGY,
};

const LEAD = {
  businessName:      'Smile Family Dental',
  phone:             '+15551234567',
  email:             'info@smilefamilydental.example',
  googleRating:      4.8,
  googleReviewCount: 247,
  category:          'dental_clinic',
};

const PROPOSAL = {
  token: 'abc123token',
  finalTier: 'Pro' as const,
  priceCents: 597_00,
  paymentLinkUrl: 'https://buy.stripe.com/test_xyz',
};

describe('renderProposalView', () => {
  it('includes the business name in the page title', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('<title>Proposal for Smile Family Dental</title>');
  });

  it('renders the draft-preview banner with the business name', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('Draft preview');
    expect(html).toContain('Built for Smile Family Dental');
    expect(html).not.toContain('Hi Dr. Silva,');  // old preamble must be gone
  });

  it('renders sticky nav with all 4 links and CTA', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('class="site-nav"');
    expect(html).toContain('site-nav-cta');
    expect(html).toContain('href="#why"');
    expect(html).toContain('href="#services"');
    expect(html).toContain('href="#reviews"');
    expect(html).toContain('href="#contact"');
    expect(html).toContain('Book Appointment');
  });

  it('renders hamburger button for mobile menu', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('site-nav-hamburger');
    expect(html).toContain('mobile-menu');
    expect(html).toContain('aria-expanded="false"');
  });

  it('renders hero with business name as massive display heading', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('class="hero-name"');
    expect(html).toContain('Smile Family Dental');
    expect(html).toContain('class="hero-cta"');
    expect(html).toContain('class="hero-secondary-cta"');
    expect(html).toContain('See why we');
  });

  it('renders hero eyebrow derived from category and location', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    // Category "dental_clinic" + locationContext "Austin, Texas"
    expect(html).toContain('Austin');
  });

  it('renders hero ornament rule between eyebrow and headline', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('class="hero-rule"');
  });

  it('renders stats strip with 3-column grid layout', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('class="stats-strip"');
    expect(html).toContain('stats-numeral');
    expect(html).toContain('4.8');
    expect(html).toContain('247');
    expect(html).toContain('12 years in Austin');
  });

  it('omits stats strip when content.stats is null', async () => {
    const noStats: SiteContent = { ...CONTENT, stats: null };
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: noStats });
    expect(html).not.toContain('class="stats-strip"');
  });

  it('renders why-us section when _study.business.uniqueAngles has 2+ items', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    // id="why" is the unique identifier only present when section is rendered
    expect(html).toContain('id="why"');
    expect(html).toContain('why-us-inner');
    expect(html).toContain('Same-day emergency appointments available');
    expect(html).toContain('Bilingual staff');
  });

  it('omits why-us section when no _study present', async () => {
    const noStudy = { ...CONTENT, _study: undefined };
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: noStudy });
    // The section id="why" only appears when the section is rendered (CSS class is always in the stylesheet)
    expect(html).not.toContain('id="why"');
  });

  it('omits secondary hero CTA and why nav link when _study absent', async () => {
    const noStudy = { ...CONTENT, _study: undefined };
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: noStudy });
    // class="hero-secondary-cta" appears in the stylesheet; check the anchor tag itself
    expect(html).not.toContain('<a href="#why" class="hero-secondary-cta"');
    expect(html).not.toContain('href="#why"');
  });

  it('renders secondary hero CTA and why nav link when _study has 2+ uniqueAngles', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('<a href="#why" class="hero-secondary-cta"');
    expect(html).toContain('href="#why"');
  });

  it('renders services as featured + supporting layout', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('service-featured');
    expect(html).toContain('service-featured-title');
    expect(html).toContain('service-supporting-list');
    expect(html).toContain('service-row');
    // All 4 services should appear
    expect(html).toContain('Cleanings');
    expect(html).toContain('Checkups');
    expect(html).toContain('Whitening');
    expect(html).toContain('Emergency');
  });

  it('renders services with expandable details', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('service-details-body');
  });

  it('renders what-changes section when _strategy has 2+ conversion opportunities', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    // id="what-changes" is the unique identifier only present when section is rendered
    expect(html).toContain('id="what-changes"');
    expect(html).toContain('What changes when we ship this');
    expect(html).toContain('change-rows');
    expect(html).toContain('No online booking');
    expect(html).toContain('Online booking widget available');
  });

  it('omits what-changes section when no _strategy present', async () => {
    const noStrategy = { ...CONTENT, _strategy: undefined };
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: noStrategy });
    // Section id="what-changes" only appears in DOM when rendered (CSS class is always in stylesheet)
    expect(html).not.toContain('id="what-changes"');
  });

  it('renders testimonials with large pull quote layout', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('testimonial-curly-quote');
    expect(html).toContain('testimonial-quote-text');
    expect(html).toContain('Great service');
  });

  it('renders all diagnosis bullets with numbered style', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('diagnosis-num');
    expect(html).toContain('Slow replies');
    expect(html).toContain('No booking');
    // Old icon-based diagnosis is gone — no diagnosis-icon class
    expect(html).not.toContain('class="diagnosis-icon"');
  });

  it('renders pricing tier label and dollar amount', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('Pro');
    // Price is split across currency ($) and numeral (597) spans per the design spec
    expect(html).toContain('597');
    expect(html).toContain('pricing-currency');
  });

  it('renders sales section with diamond glyph and pricing block', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('class="sales-section"');
    expect(html).toContain('id="accept-form"');
    expect(html).toContain('sales-caption-mark');
    // Pricing is a flat block with a hairline rule, not a nested card (DESIGN.md: "Single block, no card")
    expect(html).toContain('sales-pricing-block');
  });

  it('renders accept-form action with token', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('action="/proposal/abc123token/accept"');
  });

  it('renders Stripe payment link button when paymentLinkUrl set', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('https://buy.stripe.com/test_xyz');
  });

  it('omits payment link block when paymentLinkUrl null', async () => {
    const html = await renderProposalView({
      lead: LEAD,
      proposal: { ...PROPOSAL, paymentLinkUrl: null },
      content: CONTENT,
    });
    expect(html).not.toContain('buy.stripe.com');
  });

  it('escapes HTML in AI-generated strings (XSS guard)', async () => {
    const xss: SiteContent = {
      ...CONTENT,
      brand: { ...CONTENT.brand, tagline: '<script>alert(1)</script>' },
    };
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: xss });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes HTML in _study uniqueAngles (XSS guard for new sections)', async () => {
    const xssStudy: LeadStudy = {
      ...STUDY,
      business: {
        ...STUDY.business,
        uniqueAngles: ['<img src=x onerror=alert(1)>', 'Safe angle'],
      },
    };
    const html = await renderProposalView({
      lead: LEAD,
      proposal: PROPOSAL,
      content: { ...CONTENT, _study: xssStudy },
    });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('omits testimonials section when array is empty', async () => {
    const noTestimonials: SiteContent = { ...CONTENT, testimonials: [] };
    const html = await renderProposalView({
      lead: LEAD,
      proposal: PROPOSAL,
      content: noTestimonials,
    });
    // The section heading must be absent — the template is never rendered when array is empty
    expect(html).not.toContain('What our clients say');
    // The testimonial blockquote markup must be absent
    expect(html).not.toContain('<blockquote class="testimonial-quote">');
  });

  it('skips null contact fields', async () => {
    const sparse: SiteContent = {
      ...CONTENT,
      contact: { headline: 'Visit', address: null, phone: null, whatsapp: null, hours: 'Mon-Fri 9-5' },
    };
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: sparse });
    expect(html).toContain('Mon-Fri 9-5');
    // The address term should not appear at all (no map embed, no Address dt)
    expect(html.match(/\bAddress\b/g)).toBeNull();
  });

  it('resolves CTA href to tel: when ctaAction is call and phone present', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    // ctaAction=call, phone=+15551234567 → tel:+15551234567
    expect(html).toContain('tel:+15551234567');
  });

  it('falls back to #accept-form when ctaAction is call but no phone', async () => {
    const html = await renderProposalView({
      lead: { ...LEAD, phone: null },
      proposal: PROPOSAL,
      content: CONTENT,
    });
    expect(html).toContain('#accept-form');
  });

  it('renders hero with CSS-only fallback when Unsplash returns null', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    // fetchUnsplash mock returns null — hero should have hero-no-image class
    expect(html).toContain('hero-no-image');
    // No background-image inline style
    expect(html).not.toContain('background-image');
  });

  it('renders multi-column footer with services list', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('footer-inner');
    expect(html).toContain('footer-col--brand');
    expect(html).toContain('footer-list');
    // Service links in footer
    expect(html).toContain('footer-name');
    expect(html).toContain('footer-tagline');
    // Huntly attribution
    expect(html).toContain('huntly.app');
  });

  it('renders inline script for scrollspy and mobile menu', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('IntersectionObserver');
    expect(html).toContain('js-reveal-enabled');
    expect(html).toContain('openMenu');
    expect(html).toContain('prefers-reduced-motion');
  });
});

describe('renderLiveSite', () => {
  it('renders the business name as page title', async () => {
    const html = await renderLiveSite({ lead: LEAD, content: CONTENT });
    expect(html).toContain('<title>Smile Family Dental</title>');
  });

  it('does NOT render proposalIntro, diagnosis, pricing, or accept form', async () => {
    const html = await renderLiveSite({ lead: LEAD, content: CONTENT });
    expect(html).not.toContain('Hi Dr. Silva,');
    expect(html).not.toContain('Slow replies');
    expect(html).not.toContain('Accept Proposal');
    expect(html).not.toContain('action=');
  });

  it('does NOT render draft banner or sales section', async () => {
    const html = await renderLiveSite({ lead: LEAD, content: CONTENT });
    expect(html).not.toContain('draft-banner');
    expect(html).not.toContain('sales-section');
  });

  it('renders brand hero, why-us, services, testimonials, contact', async () => {
    const html = await renderLiveSite({ lead: LEAD, content: CONTENT });
    expect(html).toContain('class="hero-name"');
    expect(html).toContain('Smile Family Dental');
    expect(html).toContain('why-us-inner');
    expect(html).toContain('Cleanings');
    expect(html).toContain('Great service');
    expect(html).toContain('123 Main St');
  });

  it('renders sticky nav with all 4 links', async () => {
    const html = await renderLiveSite({ lead: LEAD, content: CONTENT });
    expect(html).toContain('class="site-nav"');
    expect(html).toContain('href="#why"');
    expect(html).toContain('href="#services"');
  });

  it('renders inline script for interactive features', async () => {
    const html = await renderLiveSite({ lead: LEAD, content: CONTENT });
    expect(html).toContain('IntersectionObserver');
    expect(html).toContain('mobile-menu');
  });

  it('renders multi-column footer', async () => {
    const html = await renderLiveSite({ lead: LEAD, content: CONTENT });
    expect(html).toContain('footer-inner');
    expect(html).toContain('huntly.app');
  });
});
