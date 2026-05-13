import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks — must be declared before module imports                      */
/* ------------------------------------------------------------------ */

const mockCallAIWithProvider = vi.fn<(...args: unknown[]) => Promise<string>>();

vi.mock('../../src/lib/ai.js', () => ({
  callAIWithProvider: (...args: unknown[]) => mockCallAIWithProvider(...args),
}));

import {
  strategize,
  StrategySchema,
  type Strategy,
} from '../../src/services/lead-strategy.service.js';
import type { GeneratorInput } from '../../src/services/proposal-generator.service.js';
import type { LeadStudy } from '../../src/services/lead-study.service.js';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                            */
/* ------------------------------------------------------------------ */

const BASE_INPUT: GeneratorInput = {
  businessName: 'HMD CPA',
  category: 'accounting',
  region: 'Dallas, TX',
  websiteUrl: 'https://hmdcpa.example',
  googleRating: 4.7,
  googleReviewCount: 95,
  hasChatbot: false,
  hasOnlineBooking: false,
  hasWhatsapp: false,
  ownerName: 'Henry M. Davis',
  painSignals: [],
  reviewSentimentSummary: 'Clients trust the work but frustrated by communication.',
};

const STUDY_FIXTURE: LeadStudy = {
  currentSite: {
    hasWebsite: true,
    domain: 'hmdcpa.example',
    extractedHeadlines: ['Tax Preparation', 'Bookkeeping Services'],
    extractedServices: ['Tax preparation', 'Bookkeeping', 'Financial advisory'],
    designAudit: {
      era: '2014-era Bootstrap template with default blue navbar.',
      hierarchy: 'No clear visual hierarchy; headings and body share similar weight and size.',
      typography: 'Arial body text; no display type; uniform sizing throughout.',
      colorPalette: 'Default Bootstrap blue + gray; no brand color.',
      layoutFailures: ['Hero lacks a headline above the fold.', 'Services listed as plain ul with no visual treatment.'],
      imageryQuality: 'Stock photos of generic office settings; no photos of Henry or actual office.',
      whitespaceUsage: 'Cramped; sections butt against each other with minimal padding.',
      mobileImpression: 'Desktop-first layout; mobile appears functional but not optimized.',
      accessibility: ['Body contrast appears below 4.5:1 on light-gray background.'],
    },
    copyAudit: {
      headline: 'Hero reads "Trusted Accounting Services" — generic, applies to any CPA.',
      ctaQuality: 'Only a footer "Contact Us" link; no primary CTA button above the fold.',
      voiceConsistency: 'Inconsistent; formal in the hero, informal in bullet points.',
      weasel_words: ['trusted accounting services', 'committed to excellence'],
      missingMessaging: ['No mention of response speed despite client pain signals.', 'No small-business specialization callout.'],
    },
    conversionAudit: {
      primaryCtaPresent: false,
      primaryCtaLocation: 'No primary CTA visible above the fold.',
      secondaryCtaPresent: false,
      trustSignals: ['Google Maps embed on contact page'],
      trustGaps: ['No Google rating displayed.', 'No testimonials section.', 'No years-in-business statement.'],
      formPresent: false,
      bookingFlow: 'Phone-only contact; no online scheduling.',
    },
    weaknesses: [
      'No online scheduling — clients must call',
      'Generic hero text with no differentiation',
      'No social proof above the fold',
    ],
    missingFeatures: ['Online booking', 'Chat widget', 'Client portal'],
    copyToneNow: 'Formal and generic; reads like a brochure from 2010.',
  },
  business: {
    actualServices: ['Tax preparation', 'Bookkeeping', 'Financial advisory'],
    targetCustomers: 'Small business owners and self-employed professionals in Dallas.',
    uniqueAngles: ['Long-term client relationships', 'Deep small-business tax expertise'],
    locationContext: 'Dallas, TX — large SMB market.',
  },
  voice: {
    customerLanguage: ['Henry really knows his stuff', 'never had to worry about taxes again'],
    keyPainPoints: ['Slow to return calls', 'Hard to reach during tax season'],
    keyAspirations: ['Want a CPA who responds quickly', 'Need reliable year-round advice'],
  },
};

const VALID_STRATEGY: Strategy = {
  heroAngle: 'Dallas small business owners get fast, year-round tax and bookkeeping support from a CPA who actually picks up the phone.',
  conversionOpportunities: [
    { gap: 'No online scheduling — clients must call to book', fix: 'Calendly integration with same-day booking confirmation' },
    { gap: 'Generic hero text offers no reason to choose HMD over competitors', fix: 'Specific headline anchored in pain signal: response speed' },
    { gap: 'No social proof above the fold', fix: 'Star rating strip and two curated client quotes in the first viewport' },
  ],
  copyTone: 'Direct and reassuring, echoing customer language: "Henry really knows his stuff." Avoid corporate-speak; write like a trusted advisor.',
  designPriorities: [
    'Prominent CTA for scheduling in the hero section',
    'Social proof strip with Google rating and review count',
    'Services grid with clear descriptions of each offering',
  ],
  manifestoSeed: 'Your books done right, your calls returned — Dallas accounting that respects your time.',
};

/* ------------------------------------------------------------------ */
/*  Schema tests                                                        */
/* ------------------------------------------------------------------ */

describe('StrategySchema', () => {
  it('accepts a well-formed strategy payload', () => {
    const result = StrategySchema.safeParse(VALID_STRATEGY);
    expect(result.success).toBe(true);
  });

  it('rejects fewer than 3 conversionOpportunities', () => {
    const bad = {
      ...VALID_STRATEGY,
      conversionOpportunities: VALID_STRATEGY.conversionOpportunities.slice(0, 2),
    };
    expect(StrategySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects more than 5 conversionOpportunities', () => {
    const extra = VALID_STRATEGY.conversionOpportunities[0]!;
    const bad = {
      ...VALID_STRATEGY,
      conversionOpportunities: Array(6).fill(extra),
    };
    expect(StrategySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects fewer than 3 designPriorities', () => {
    const bad = {
      ...VALID_STRATEGY,
      designPriorities: ['only one', 'only two'],
    };
    expect(StrategySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects heroAngle exceeding 220 chars', () => {
    const bad = {
      ...VALID_STRATEGY,
      heroAngle: 'x'.repeat(221),
    };
    expect(StrategySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty heroAngle', () => {
    const bad = { ...VALID_STRATEGY, heroAngle: '' };
    expect(StrategySchema.safeParse(bad).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  strategize function tests                                           */
/* ------------------------------------------------------------------ */

describe('strategize', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls Anthropic via callAIWithProvider with json mode', async () => {
    mockCallAIWithProvider.mockResolvedValue(JSON.stringify(VALID_STRATEGY));

    await strategize(BASE_INPUT, STUDY_FIXTURE);

    expect(mockCallAIWithProvider).toHaveBeenCalledTimes(1);
    const [provider, opts] = mockCallAIWithProvider.mock.calls[0]!;
    expect(provider).toBe('anthropic');
    expect((opts as { json: boolean }).json).toBe(true);
  });

  it('passes the study JSON into the user prompt', async () => {
    mockCallAIWithProvider.mockResolvedValue(JSON.stringify(VALID_STRATEGY));

    await strategize(BASE_INPUT, STUDY_FIXTURE);

    const [, opts] = mockCallAIWithProvider.mock.calls[0]!;
    const userPrompt = (opts as { userPrompt: string }).userPrompt;
    // Study output should appear in the prompt
    expect(userPrompt).toContain('LEAD STUDY');
    expect(userPrompt).toContain('hmdcpa.example');
    expect(userPrompt).toContain('Long-term client relationships');
  });

  it('returns validated Strategy on success', async () => {
    mockCallAIWithProvider.mockResolvedValue(JSON.stringify(VALID_STRATEGY));

    const result = await strategize(BASE_INPUT, STUDY_FIXTURE);

    expect(result.heroAngle).toBeTruthy();
    expect(result.conversionOpportunities.length).toBeGreaterThanOrEqual(3);
    expect(result.manifestoSeed).toBeTruthy();
  });

  it('retries once when first response is invalid JSON', async () => {
    mockCallAIWithProvider
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(JSON.stringify(VALID_STRATEGY));

    const result = await strategize(BASE_INPUT, STUDY_FIXTURE);

    expect(result.heroAngle).toBeTruthy();
    expect(mockCallAIWithProvider).toHaveBeenCalledTimes(2);

    const [, secondOpts] = mockCallAIWithProvider.mock.calls[1]!;
    expect((secondOpts as { systemPrompt: string }).systemPrompt).toMatch(/previous response failed validation/i);
  });

  it('retries once when first response fails schema validation', async () => {
    const badStrategy = {
      ...VALID_STRATEGY,
      conversionOpportunities: VALID_STRATEGY.conversionOpportunities.slice(0, 1), // < 3
    };
    mockCallAIWithProvider
      .mockResolvedValueOnce(JSON.stringify(badStrategy))
      .mockResolvedValueOnce(JSON.stringify(VALID_STRATEGY));

    const result = await strategize(BASE_INPUT, STUDY_FIXTURE);
    expect(result.conversionOpportunities.length).toBeGreaterThanOrEqual(3);
    expect(mockCallAIWithProvider).toHaveBeenCalledTimes(2);
  });

  it('throws after two validation failures', async () => {
    mockCallAIWithProvider
      .mockResolvedValueOnce('bad 1')
      .mockResolvedValueOnce('bad 2');

    await expect(strategize(BASE_INPUT, STUDY_FIXTURE)).rejects.toThrow(/failed validation twice/i);
    expect(mockCallAIWithProvider).toHaveBeenCalledTimes(2);
  });
});
