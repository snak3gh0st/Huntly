import { describe, it, expect } from 'vitest';
import {
  renderProposalView,
  renderLiveSite,
} from '../../src/services/proposal-renderer.service.js';
import type { SiteContent } from '../../src/services/proposal-generator.service.js';

const CONTENT: SiteContent = {
  brand: { tagline: 'Premier dental care', description: 'A family clinic in Austin.' },
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
  businessName: 'Smile Family Dental',
};

const PROPOSAL = {
  token: 'abc123token',
  finalTier: 'Pro' as const,
  priceCents: 597_00,
  paymentLinkUrl: 'https://buy.stripe.com/test_xyz',
};

describe('renderProposalView', () => {
  it('includes the business name in the page title', () => {
    const html = renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('<title>Proposal for Smile Family Dental</title>');
  });

  it('renders the proposalIntro salutation', () => {
    const html = renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('Hi Dr. Silva,');
  });

  it('renders all diagnosis bullets', () => {
    const html = renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('Slow replies');
    expect(html).toContain('No booking');
  });

  it('renders pricing tier label and dollar amount', () => {
    const html = renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('Pro');
    // Price is split across currency ($) and numeral (597) spans per the design spec
    expect(html).toContain('597');
    expect(html).toContain('pricing-currency');
  });

  it('renders accept-form action with token', () => {
    const html = renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('action="/proposal/abc123token/accept"');
  });

  it('renders Stripe payment link button when paymentLinkUrl set', () => {
    const html = renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: CONTENT });
    expect(html).toContain('https://buy.stripe.com/test_xyz');
  });

  it('omits payment link block when paymentLinkUrl null', () => {
    const html = renderProposalView({
      lead: LEAD,
      proposal: { ...PROPOSAL, paymentLinkUrl: null },
      content: CONTENT,
    });
    expect(html).not.toContain('buy.stripe.com');
  });

  it('escapes HTML in AI-generated strings (XSS guard)', () => {
    const xss: SiteContent = {
      ...CONTENT,
      brand: { ...CONTENT.brand, tagline: '<script>alert(1)</script>' },
    };
    const html = renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: xss });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('omits testimonials section when array is empty', () => {
    const noTestimonials: SiteContent = { ...CONTENT, testimonials: [] };
    const html = renderProposalView({
      lead: LEAD,
      proposal: PROPOSAL,
      content: noTestimonials,
    });
    // The section heading must be absent — the template is never rendered when array is empty
    expect(html).not.toContain('What customers say');
    // The blockquote markup (class attribute, not CSS rule) must be absent
    expect(html).not.toContain('class="testimonial-item"');
  });

  it('skips null contact fields', () => {
    const sparse: SiteContent = {
      ...CONTENT,
      contact: { headline: 'Visit', address: null, phone: null, whatsapp: null, hours: 'Mon-Fri 9-5' },
    };
    const html = renderProposalView({ lead: LEAD, proposal: PROPOSAL, content: sparse });
    expect(html).toContain('Mon-Fri 9-5');
    // The address card should not appear at all
    expect(html.match(/Address/g)).toBeNull();
  });
});

describe('renderLiveSite', () => {
  it('renders the business name as page title', () => {
    const html = renderLiveSite({ lead: LEAD, content: CONTENT });
    expect(html).toContain('<title>Smile Family Dental</title>');
  });

  it('does NOT render proposalIntro, diagnosis, pricing, or accept form', () => {
    const html = renderLiveSite({ lead: LEAD, content: CONTENT });
    expect(html).not.toContain('Hi Dr. Silva,');
    expect(html).not.toContain('Slow replies');
    expect(html).not.toContain('Accept Proposal');
    expect(html).not.toContain('action=');
  });

  it('renders brand hero, services, testimonials, contact', () => {
    const html = renderLiveSite({ lead: LEAD, content: CONTENT });
    expect(html).toContain('Premier dental care');
    expect(html).toContain('Cleanings');
    expect(html).toContain('Great service');
    expect(html).toContain('123 Main St');
  });
});
