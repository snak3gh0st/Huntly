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

const CONTENT: SiteContent = {
  brand: { tagline: 'Premier dental care', description: 'A family clinic in Austin.' },
  hero: {
    imageQuery: 'modern dental office Austin',
    ctaLabel:   'Book Appointment',
    ctaAction:  'call',
  },
  stats: { showRating: true, showReviewCount: true },
  services: [
    { icon: 'phone', title: 'Cleanings', description: 'Routine cleanings.' },
    { icon: 'calendar', title: 'Checkups', description: 'Annual checkups.' },
    { icon: 'star', title: 'Whitening', description: 'In-office whitening.' },
    { icon: 'shield', title: 'Emergency', description: 'Same-day urgent care.' },
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

  it('renders sticky nav with CTA', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('class="site-nav"');
    expect(html).toContain('site-nav-cta');
    expect(html).toContain('Book Appointment');
  });

  it('renders hero with tagline and CTA button', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('Premier dental care');
    expect(html).toContain('class="hero-cta"');
  });

  it('renders stats strip when rating and review count are present', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('class="stats-strip"');
    expect(html).toContain('4.8');
    expect(html).toContain('247');
  });

  it('omits stats strip when content.stats is null', async () => {
    const noStats: SiteContent = { ...CONTENT, stats: null };
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: noStats });
    expect(html).not.toContain('class="stats-strip"');
  });

  it('renders all diagnosis bullets', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('Slow replies');
    expect(html).toContain('No booking');
  });

  it('renders pricing tier label and dollar amount', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('Pro');
    // Price is split across currency ($) and numeral (597) spans per the design spec
    expect(html).toContain('597');
    expect(html).toContain('pricing-currency');
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

  it('omits testimonials section when array is empty', async () => {
    const noTestimonials: SiteContent = { ...CONTENT, testimonials: [] };
    const html = await renderProposalView({
      lead: LEAD,
      proposal: PROPOSAL,
      content: noTestimonials,
    });
    // The section heading must be absent — the template is never rendered when array is empty
    expect(html).not.toContain('What our clients say');
    // The testimonial blockquote markup must be absent (the CSS class definition
    // lives in the <style> block but we check for the actual rendered element)
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

  it('wraps sales chrome in sales-section', async () => {
    const html = await renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('class="sales-section"');
    expect(html).toContain('id="accept-form"');
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

  it('renders brand hero, services, testimonials, contact', async () => {
    const html = await renderLiveSite({ lead: LEAD, content: CONTENT });
    expect(html).toContain('Premier dental care');
    expect(html).toContain('Cleanings');
    expect(html).toContain('Great service');
    expect(html).toContain('123 Main St');
  });

  it('renders sticky nav', async () => {
    const html = await renderLiveSite({ lead: LEAD, content: CONTENT });
    expect(html).toContain('class="site-nav"');
  });
});
