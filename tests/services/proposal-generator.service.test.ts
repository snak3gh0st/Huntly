import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCallAIWithProvider = vi.fn<(...args: unknown[]) => Promise<string>>();

vi.mock('../../src/lib/ai.js', () => ({
  callAIWithProvider: (...args: unknown[]) => mockCallAIWithProvider(...args),
}));

// IMPORTANT: re-import buildPrompt/generateSiteContent below the mock
import {
  buildSystemPrompt,
  buildUserPrompt,
  generateSiteContent,
  type GeneratorInput,
} from '../../src/services/proposal-generator.service.js';

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

const BASE_INPUT: GeneratorInput = {
  businessName: 'Smile Family Dental',
  category: 'dental_clinic',
  region: 'Austin, TX',
  websiteUrl: 'https://smilefamilydental.example',
  googleRating: 4.6,
  googleReviewCount: 180,
  hasChatbot: false,
  hasOnlineBooking: false,
  hasWhatsapp: false,
  ownerName: 'Dr. Silva',
  painSignals: [
    { signal: 'slow_phone', count: 12, example: 'Took 4 days to return my call.' },
  ],
  reviewSentimentSummary: 'Patients love the staff but struggle to reach the office.',
  personalizedHook: 'Dr. Silva, 12 of your reviewers mention phone delays...',
  operatorNotes: 'Owner mentioned hiring an associate dentist',
};

describe('buildSystemPrompt', () => {
  it('mentions one-time pricing and forbids "per month" phrasing', () => {
    const sys = buildSystemPrompt();
    expect(sys).toMatch(/one-time/i);
    expect(sys).toMatch(/per month|subscription|monthly billing/i);
    expect(sys).toMatch(/JSON/);
  });

  it('lists every icon name in the allowed-icons section', () => {
    const sys = buildSystemPrompt();
    for (const icon of ['phone', 'calendar', 'globe', 'message', 'clock', 'star']) {
      expect(sys).toContain(icon);
    }
  });
});

describe('buildUserPrompt', () => {
  it('includes business name, category, region, review count', () => {
    const u = buildUserPrompt(BASE_INPUT);
    expect(u).toContain('Smile Family Dental');
    expect(u).toContain('dental_clinic');
    expect(u).toContain('Austin, TX');
    expect(u).toContain('180 reviews');
  });

  it('passes through pain signals with examples', () => {
    const u = buildUserPrompt(BASE_INPUT);
    expect(u).toContain('slow_phone');
    expect(u).toContain('Took 4 days to return my call.');
  });

  it('includes operator notes when present', () => {
    const u = buildUserPrompt(BASE_INPUT);
    expect(u).toContain('Owner mentioned hiring an associate dentist');
  });

  it('omits operator-notes line when notes empty', () => {
    const u = buildUserPrompt({ ...BASE_INPUT, operatorNotes: undefined });
    expect(u).not.toMatch(/Operator notes:/);
  });
});

describe('generateSiteContent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls Anthropic via callAIWithProvider with json mode', async () => {
    mockCallAIWithProvider.mockResolvedValue(JSON.stringify(VALID_CONTENT));
    await generateSiteContent(BASE_INPUT);

    expect(mockCallAIWithProvider).toHaveBeenCalledTimes(1);
    const [provider, opts] = mockCallAIWithProvider.mock.calls[0]!;
    expect(provider).toBe('anthropic');
    expect(opts).toEqual(
      expect.objectContaining({ json: true }),
    );
  });

  it('returns the validated SiteContent', async () => {
    mockCallAIWithProvider.mockResolvedValue(JSON.stringify(VALID_CONTENT));
    const result = await generateSiteContent(BASE_INPUT);
    expect(result.brand.tagline).toBe('Premier dental care');
  });
});

describe('generateSiteContent — retry on validation failure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retries once when the first response is invalid JSON', async () => {
    mockCallAIWithProvider
      .mockResolvedValueOnce('definitely not json')
      .mockResolvedValueOnce(JSON.stringify(VALID_CONTENT));

    const result = await generateSiteContent(BASE_INPUT);

    expect(result.brand.tagline).toBe('Premier dental care');
    expect(mockCallAIWithProvider).toHaveBeenCalledTimes(2);

    const secondCall = mockCallAIWithProvider.mock.calls[1]![1] as {
      systemPrompt: string;
    };
    expect(secondCall.systemPrompt).toMatch(/previous response failed validation/i);
  });

  it('retries once when first response fails schema validation', async () => {
    const partialBad = { ...VALID_CONTENT, services: [] };  // < 4 services
    mockCallAIWithProvider
      .mockResolvedValueOnce(JSON.stringify(partialBad))
      .mockResolvedValueOnce(JSON.stringify(VALID_CONTENT));

    const result = await generateSiteContent(BASE_INPUT);
    expect(result.services).toHaveLength(4);
    expect(mockCallAIWithProvider).toHaveBeenCalledTimes(2);
  });

  it('throws after two validation failures', async () => {
    mockCallAIWithProvider
      .mockResolvedValueOnce('bad 1')
      .mockResolvedValueOnce('bad 2');

    await expect(generateSiteContent(BASE_INPUT)).rejects.toThrow(
      /failed validation twice/i,
    );
    expect(mockCallAIWithProvider).toHaveBeenCalledTimes(2);
  });
});
