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
import type { LeadStudy } from '../../src/services/lead-study.service.js';
import type { Strategy } from '../../src/services/lead-strategy.service.js';

const VALID_CONTENT = {
  brand: { tagline: 'Premier dental care', description: 'A family-run clinic.' },
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

  it('accepts hero with valid ctaAction values', () => {
    for (const ctaAction of ['call', 'email', 'scroll-to-form'] as const) {
      const ok = { ...VALID_CONTENT, hero: { ...VALID_CONTENT.hero, ctaAction } };
      expect(SiteContentSchema.safeParse(ok).success).toBe(true);
    }
  });

  it('rejects hero with invalid ctaAction', () => {
    const bad = { ...VALID_CONTENT, hero: { ...VALID_CONTENT.hero, ctaAction: 'sms' } };
    expect(SiteContentSchema.safeParse(bad).success).toBe(false);
  });

  it('allows stats to be null', () => {
    const ok = { ...VALID_CONTENT, stats: null };
    expect(SiteContentSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects payload missing hero field', () => {
    const { hero: _hero, ...bad } = VALID_CONTENT;
    expect(SiteContentSchema.safeParse(bad).success).toBe(false);
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

const STUDY_FIXTURE: LeadStudy = {
  currentSite: {
    hasWebsite: true,
    domain: 'smilefamilydental.example',
    extractedHeadlines: ['Family Dental Care in Austin'],
    extractedServices: ['Cleanings', 'Checkups', 'Whitening', 'Emergency care'],
    designAssessment: 'Dated 2015-era Bootstrap template with stock photography.',
    weaknesses: [
      'No online booking — 5 reviewers asked for it',
      'Generic hero text with no Austin-specific differentiation',
      'No social proof visible above the fold',
    ],
    missingFeatures: ['Online booking', 'Chat widget', 'Patient portal'],
    copyToneNow: 'Formal and overly broad; could apply to any dental clinic.',
  },
  business: {
    actualServices: ['Cleanings', 'Annual checkups', 'Whitening', 'Emergency care', 'Sedation dentistry'],
    targetCustomers: 'Families and adults in Austin looking for a full-service dental provider.',
    uniqueAngles: ['Same-day emergency appointments', 'Family-friendly environment'],
    locationContext: 'Austin, TX — competitive dental market with high consumer expectations.',
  },
  voice: {
    customerLanguage: ['Dr. Silva really puts you at ease', 'best dental experience I have had'],
    keyPainPoints: ['Hard to get appointments', 'Phone goes to voicemail'],
    keyAspirations: ['Want to book online', 'Need same-day care'],
  },
};

const STRATEGY_FIXTURE: Strategy = {
  heroAngle: 'Austin families get same-day dental care and online booking at Smile Family Dental.',
  conversionOpportunities: [
    { gap: 'No online booking — 5 reviewers asked for it', fix: 'Calendly/Zocdoc widget in hero and contact sections' },
    { gap: 'No social proof above the fold', fix: 'Star rating strip with review count directly under the hero' },
    { gap: 'Generic hero text with no Austin differentiation', fix: 'Headline anchored in same-day emergency and Austin family focus' },
  ],
  copyTone: 'Warm but direct, echoing patient language: "Dr. Silva really puts you at ease." No clinical jargon.',
  designPriorities: [
    'Hero CTA for online booking above the fold',
    'Social proof strip with Google rating',
    'Services grid with clear specialty callouts',
  ],
  manifestoSeed: 'Austin dental care that fits your schedule, not the other way around.',
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

  it('includes study + strategy section when both are provided', () => {
    const sys = buildSystemPrompt(STUDY_FIXTURE, STRATEGY_FIXTURE);
    expect(sys).toContain('STUDY AND STRATEGY PROVIDED');
    expect(sys).toContain(STUDY_FIXTURE.currentSite.designAssessment);
    expect(sys).toContain(STRATEGY_FIXTURE.heroAngle);
    expect(sys).toContain(STRATEGY_FIXTURE.manifestoSeed);
  });

  it('includes rule 18 referencing Study + Strategy foundation', () => {
    const sys = buildSystemPrompt(STUDY_FIXTURE, STRATEGY_FIXTURE);
    expect(sys).toMatch(/STUDY \+ STRATEGY ARE THE FOUNDATION/i);
  });

  it('does not include study section when no study provided', () => {
    const sys = buildSystemPrompt();
    expect(sys).not.toContain('STUDY AND STRATEGY PROVIDED');
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

  it('includes study JSON in user prompt when study is provided', () => {
    const u = buildUserPrompt(BASE_INPUT, STUDY_FIXTURE);
    expect(u).toContain('STUDY (Layer 1');
    expect(u).toContain('smilefamilydental.example');
    expect(u).toContain('Same-day emergency appointments');
  });

  it('includes strategy JSON in user prompt when strategy is provided', () => {
    const u = buildUserPrompt(BASE_INPUT, STUDY_FIXTURE, STRATEGY_FIXTURE);
    expect(u).toContain('STRATEGY (Layer 2');
    expect(u).toContain(STRATEGY_FIXTURE.heroAngle);
    expect(u).toContain(STRATEGY_FIXTURE.manifestoSeed);
  });

  it('omits study/strategy sections when not provided', () => {
    const u = buildUserPrompt(BASE_INPUT);
    expect(u).not.toContain('STUDY (Layer 1');
    expect(u).not.toContain('STRATEGY (Layer 2');
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

  it('passes study + strategy into system and user prompts when provided', async () => {
    mockCallAIWithProvider.mockResolvedValue(JSON.stringify(VALID_CONTENT));
    await generateSiteContent(BASE_INPUT, STUDY_FIXTURE, STRATEGY_FIXTURE);

    const [, opts] = mockCallAIWithProvider.mock.calls[0]!;
    const { systemPrompt, userPrompt } = opts as { systemPrompt: string; userPrompt: string };
    expect(systemPrompt).toContain('STUDY AND STRATEGY PROVIDED');
    expect(userPrompt).toContain('STUDY (Layer 1');
    expect(userPrompt).toContain('STRATEGY (Layer 2');
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
