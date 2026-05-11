import { describe, it, expect } from 'vitest';
import { SiteContentSchema } from '../../src/services/proposal-generator.service.js';

const VALID_CONTENT = {
  brand: { tagline: 'Premier dental care', description: 'A family-run clinic.' },
  services: [
    { icon: 'phone', title: 'Cleanings', description: 'Routine cleanings.' },
    { icon: 'calendar', title: 'Checkups', description: 'Annual checkups.' },
    { icon: 'star', title: 'Whitening', description: 'In-office whitening.' },
    { icon: 'shield', title: 'Emergency', description: 'Same-day care.' },
  ],
  testimonials: [{ quote: 'Great service!', attribution: 'Sarah on Google' }],
  contact: {
    headline: 'Visit us',
    address: '123 Main St',
    phone: '+15551234567',
    whatsapp: null,
    hours: 'Mon-Fri 9-5',
  },
  proposalIntro: {
    salutation: 'Hi Dr. Silva,',
    pitch: "Here's the site we'd build.",
  },
  diagnosis: {
    bullets: [
      { icon: 'clock', label: 'Slow replies', evidence: '12 reviews mention waiting.' },
      { icon: 'message', label: 'No online booking', evidence: '5 reviewers asked.' },
    ],
  },
  pricingPitch: {
    headline: 'One payment, full website',
    valueBullets: ['12 mo hosting', 'Same-day deployment'],
  },
  cta: { primaryLabel: 'Accept Proposal', reassurance: '30-day support' },
};

describe('SiteContentSchema', () => {
  it('accepts a well-formed payload', () => {
    const result = SiteContentSchema.safeParse(VALID_CONTENT);
    expect(result.success).toBe(true);
  });

  it('rejects fewer than 4 services', () => {
    const bad = { ...VALID_CONTENT, services: VALID_CONTENT.services.slice(0, 3) };
    expect(SiteContentSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects more than 8 services', () => {
    const extra = VALID_CONTENT.services[0]!;
    const bad = { ...VALID_CONTENT, services: Array(9).fill(extra) };
    expect(SiteContentSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown icon values', () => {
    const bad = {
      ...VALID_CONTENT,
      services: [
        { icon: 'spaceship', title: 'X', description: 'Y' },
        ...VALID_CONTENT.services.slice(1),
      ],
    };
    expect(SiteContentSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects diagnosis bullets fewer than 2', () => {
    const bad = {
      ...VALID_CONTENT,
      diagnosis: { bullets: [VALID_CONTENT.diagnosis.bullets[0]!] },
    };
    expect(SiteContentSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects pricingPitch with fewer than 2 valueBullets', () => {
    const bad = {
      ...VALID_CONTENT,
      pricingPitch: { ...VALID_CONTENT.pricingPitch, valueBullets: ['only one'] },
    };
    expect(SiteContentSchema.safeParse(bad).success).toBe(false);
  });

  it('allows testimonials array to be empty', () => {
    const ok = { ...VALID_CONTENT, testimonials: [] };
    expect(SiteContentSchema.safeParse(ok).success).toBe(true);
  });

  it('allows nullable contact fields', () => {
    const ok = {
      ...VALID_CONTENT,
      contact: { headline: 'Contact us', address: null, phone: null, whatsapp: null, hours: null },
    };
    expect(SiteContentSchema.safeParse(ok).success).toBe(true);
  });
});
