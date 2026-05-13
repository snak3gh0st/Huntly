import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks — must be declared before module imports                      */
/* ------------------------------------------------------------------ */

const mockCallAnthropicVision = vi.fn<(...args: unknown[]) => Promise<string>>();
const mockCrawlWebsite = vi.fn();
const mockCaptureScreenshot = vi.fn().mockResolvedValue(null);

vi.mock('../../src/lib/ai.js', () => ({
  callAnthropicVision: (...args: unknown[]) => mockCallAnthropicVision(...args),
}));

vi.mock('../../src/services/crawler.service.js', () => ({
  crawlWebsite: (...args: unknown[]) => mockCrawlWebsite(...args),
}));

vi.mock('../../src/lib/screenshot.js', () => ({
  captureScreenshot: (...args: unknown[]) => mockCaptureScreenshot(...args),
}));

import {
  studyLead,
  LeadStudySchema,
  type LeadStudy,
} from '../../src/services/lead-study.service.js';
import type { GeneratorInput } from '../../src/services/proposal-generator.service.js';

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
  painSignals: [
    { signal: 'slow_response', count: 8, example: 'Never returns calls promptly.' },
  ],
  reviewSentimentSummary: 'Clients trust the work but are frustrated by communication.',
  personalizedHook: 'Henry, 8 reviewers mention slow responses...',
};

const VALID_CRAWL_RESULT = {
  emails: ['contact@hmdcpa.example'],
  hasWhatsapp: false,
  hasChatbot: false,
  hasOnlineBooking: false,
  techSignals: { pagesCrawled: 3 },
  homepageText: 'HMD CPA provides tax preparation, bookkeeping, and financial advisory services in Dallas.',
  headings: ['Tax Preparation', 'Bookkeeping Services', 'About HMD CPA'],
  pageLinks: ['Services', 'About', 'Contact'],
};

const VALID_STUDY: LeadStudy = {
  currentSite: {
    hasWebsite: true,
    domain: 'hmdcpa.example',
    extractedHeadlines: ['Tax Preparation', 'Bookkeeping Services'],
    extractedServices: ['Tax preparation', 'Bookkeeping', 'Financial advisory'],
    designAssessment: 'Dated Bootstrap template with minimal visual hierarchy and no clear conversion path.',
    weaknesses: [
      'No online scheduling — clients must call to book appointments',
      'Generic hero text that could apply to any CPA firm',
      'No social proof section above the fold',
    ],
    missingFeatures: ['Online booking', 'Chat widget', 'Client portal link'],
    copyToneNow: 'Formal and generic; reads like a brochure from 2010.',
  },
  business: {
    actualServices: ['Tax preparation', 'Bookkeeping', 'Financial advisory'],
    targetCustomers: 'Small business owners and self-employed professionals in the Dallas area.',
    uniqueAngles: ['Long-term client relationships', 'Deep expertise in small business tax law'],
    locationContext: 'Dallas, TX — large SMB market with high competition among CPA firms.',
  },
  voice: {
    customerLanguage: ['Henry really knows his stuff', 'never had to worry about taxes again'],
    keyPainPoints: ['Slow to return calls', 'Hard to reach during tax season'],
    keyAspirations: ['Want a CPA who responds quickly', 'Need reliable advice year-round'],
  },
};

/* ------------------------------------------------------------------ */
/*  Schema tests                                                        */
/* ------------------------------------------------------------------ */

describe('LeadStudySchema', () => {
  it('accepts a well-formed study payload', () => {
    const result = LeadStudySchema.safeParse(VALID_STUDY);
    expect(result.success).toBe(true);
  });

  it('rejects fewer than 3 weaknesses', () => {
    const bad = {
      ...VALID_STUDY,
      currentSite: { ...VALID_STUDY.currentSite, weaknesses: ['only one', 'only two'] },
    };
    expect(LeadStudySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects fewer than 2 missingFeatures', () => {
    const bad = {
      ...VALID_STUDY,
      currentSite: { ...VALID_STUDY.currentSite, missingFeatures: ['just one'] },
    };
    expect(LeadStudySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects fewer than 2 actualServices', () => {
    const bad = {
      ...VALID_STUDY,
      business: { ...VALID_STUDY.business, actualServices: ['only one'] },
    };
    expect(LeadStudySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects fewer than 2 uniqueAngles', () => {
    const bad = {
      ...VALID_STUDY,
      business: { ...VALID_STUDY.business, uniqueAngles: ['just one'] },
    };
    expect(LeadStudySchema.safeParse(bad).success).toBe(false);
  });

  it('allows nullable domain', () => {
    const ok = {
      ...VALID_STUDY,
      currentSite: { ...VALID_STUDY.currentSite, domain: null },
    };
    expect(LeadStudySchema.safeParse(ok).success).toBe(true);
  });

  it('allows empty voice arrays', () => {
    const ok = {
      ...VALID_STUDY,
      voice: { customerLanguage: [], keyPainPoints: [], keyAspirations: [] },
    };
    expect(LeadStudySchema.safeParse(ok).success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  studyLead function tests                                            */
/* ------------------------------------------------------------------ */

describe('studyLead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls crawlWebsite when websiteUrl is set and feeds result to AI', async () => {
    mockCrawlWebsite.mockResolvedValue(VALID_CRAWL_RESULT);
    mockCallAnthropicVision.mockResolvedValue(JSON.stringify(VALID_STUDY));

    await studyLead(BASE_INPUT);

    expect(mockCrawlWebsite).toHaveBeenCalledWith(BASE_INPUT.websiteUrl);
    expect(mockCallAnthropicVision).toHaveBeenCalledTimes(1);
    const [opts] = mockCallAnthropicVision.mock.calls[0]!;
    expect((opts as { json: boolean }).json).toBe(true);
    // The user prompt should include crawled content
    expect((opts as { userPrompt: string }).userPrompt).toContain('CRAWLED WEBSITE CONTENT');
  });

  it('does not call crawlWebsite when no websiteUrl provided', async () => {
    const inputNoUrl = { ...BASE_INPUT, websiteUrl: undefined };
    mockCallAnthropicVision.mockResolvedValue(JSON.stringify(VALID_STUDY));

    await studyLead(inputNoUrl);

    expect(mockCrawlWebsite).not.toHaveBeenCalled();
  });

  it('sets hasWebsite=false path in prompt when crawler fails', async () => {
    mockCrawlWebsite.mockRejectedValue(new Error('Connection timeout'));
    mockCallAnthropicVision.mockResolvedValue(JSON.stringify(VALID_STUDY));

    await studyLead(BASE_INPUT);

    // crawlWebsite was attempted but failed
    expect(mockCrawlWebsite).toHaveBeenCalled();
    // AI was still called — with "no website content available" message
    expect(mockCallAnthropicVision).toHaveBeenCalledTimes(1);
    const [opts] = mockCallAnthropicVision.mock.calls[0]!;
    expect((opts as { userPrompt: string }).userPrompt).toContain('No website content available');
  });

  it('returns validated LeadStudy on success', async () => {
    mockCrawlWebsite.mockResolvedValue(VALID_CRAWL_RESULT);
    mockCallAnthropicVision.mockResolvedValue(JSON.stringify(VALID_STUDY));

    const result = await studyLead(BASE_INPUT);

    expect(result.currentSite.hasWebsite).toBe(true);
    expect(result.business.actualServices).toContain('Tax preparation');
  });

  it('retries once when first response is invalid JSON', async () => {
    mockCrawlWebsite.mockResolvedValue(VALID_CRAWL_RESULT);
    mockCallAnthropicVision
      .mockResolvedValueOnce('not json at all')
      .mockResolvedValueOnce(JSON.stringify(VALID_STUDY));

    const result = await studyLead(BASE_INPUT);

    expect(result.business.targetCustomers).toBeTruthy();
    expect(mockCallAnthropicVision).toHaveBeenCalledTimes(2);
    // Second call should include the validation error
    const [secondOpts] = mockCallAnthropicVision.mock.calls[1]!;
    expect((secondOpts as { systemPrompt: string }).systemPrompt).toMatch(/previous response failed validation/i);
  });

  it('retries once when first response fails schema validation', async () => {
    const badStudy = {
      ...VALID_STUDY,
      currentSite: { ...VALID_STUDY.currentSite, weaknesses: ['only one'] }, // < 3
    };
    mockCrawlWebsite.mockResolvedValue(VALID_CRAWL_RESULT);
    mockCallAnthropicVision
      .mockResolvedValueOnce(JSON.stringify(badStudy))
      .mockResolvedValueOnce(JSON.stringify(VALID_STUDY));

    const result = await studyLead(BASE_INPUT);
    expect(result.currentSite.weaknesses.length).toBeGreaterThanOrEqual(3);
    expect(mockCallAnthropicVision).toHaveBeenCalledTimes(2);
  });

  it('throws after two validation failures', async () => {
    mockCrawlWebsite.mockResolvedValue(VALID_CRAWL_RESULT);
    mockCallAnthropicVision
      .mockResolvedValueOnce('bad 1')
      .mockResolvedValueOnce('bad 2');

    await expect(studyLead(BASE_INPUT)).rejects.toThrow(/failed validation twice/i);
    expect(mockCallAnthropicVision).toHaveBeenCalledTimes(2);
  });
});
