import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks — must be hoisted before any import of the worker module    */
/* ------------------------------------------------------------------ */

const mockCrawlWebsite = vi.fn();
const mockFetchReviews = vi.fn();
const mockAnalyzeReviews = vi.fn();

const mockLeadRepo = {
  findById: vi.fn(),
  setEmail: vi.fn(),
  updateStatus: vi.fn(),
};

const mockEnrichmentRepo = {
  upsert: vi.fn(),
};

const mockQualifyQueueAdd = vi.fn();

// Track the processor function that Worker receives
let capturedProcessor: (job: { data: { leadId: string } }) => Promise<void>;

vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    add: ReturnType<typeof vi.fn>;
    constructor(name: string) {
      this.name = name;
      // Wire up the qualify queue mock
      if (name === 'qualify') {
        this.add = mockQualifyQueueAdd;
      } else {
        this.add = vi.fn();
      }
    }
  }
  class MockWorker {
    name: string;
    constructor(name: string, processor: (job: any) => Promise<void>) {
      this.name = name;
      capturedProcessor = processor;
    }
  }
  return { Queue: MockQueue, Worker: MockWorker };
});

vi.mock('../../src/lib/redis.js', () => ({
  redis: {},
}));

vi.mock('../../src/services/crawler.service.js', () => ({
  crawlWebsite: mockCrawlWebsite,
}));

vi.mock('../../src/services/outscraper.service.js', () => ({
  fetchReviews: mockFetchReviews,
}));

vi.mock('../../src/services/review-analyzer.service.js', () => ({
  analyzeReviews: mockAnalyzeReviews,
}));

vi.mock('../../src/db/index.js', () => ({
  leadRepo: mockLeadRepo,
  enrichmentRepo: mockEnrichmentRepo,
}));

// Dynamic import — triggers module evaluation after mocks are set up
const { pickBestEmail } = await import('../../src/workers/enrich.worker.js');
// Import Prisma to match DbNull sentinels in assertions
const { Prisma } = await import('@prisma/client');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeJob(leadId: string) {
  return { data: { leadId } };
}

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    businessName: 'Acme Dental',
    websiteUrl: 'https://acmedental.com',
    googleMapsPlaceId: 'ChIJ_abc123',
    status: 'sourced',
    ...overrides,
  };
}

function makeCrawlResult(overrides: Record<string, unknown> = {}) {
  return {
    emails: ['info@acmedental.com', 'john@acmedental.com'],
    hasWhatsapp: true,
    hasChatbot: false,
    hasOnlineBooking: true,
    techSignals: { pagesCrawled: 3 },
    ...overrides,
  };
}

function makeReviewResult(overrides: Record<string, unknown> = {}) {
  return {
    reviews: ['Great service!', 'Hard to book an appointment.'],
    rating: 4.2,
    ...overrides,
  };
}

function makeAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    sentimentSummary: 'Generally positive with booking complaints.',
    painSignals: [{ signal: 'hard_to_book', count: 3, example: 'Hard to book' }],
    positiveThemes: ['friendly staff'],
    totalAnalyzed: 2,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('enrich worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crawls website and analyzes reviews in parallel', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockCrawlWebsite.mockResolvedValue(makeCrawlResult());
    mockFetchReviews.mockResolvedValue(makeReviewResult());
    mockAnalyzeReviews.mockResolvedValue(makeAnalysis());
    mockEnrichmentRepo.upsert.mockResolvedValue({});
    mockLeadRepo.setEmail.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockQualifyQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    // Both crawl and reviews were called
    expect(mockCrawlWebsite).toHaveBeenCalledWith('https://acmedental.com');
    expect(mockFetchReviews).toHaveBeenCalledWith('ChIJ_abc123');
    expect(mockAnalyzeReviews).toHaveBeenCalledWith(['Great service!', 'Hard to book an appointment.']);
  });

  it('picks best email (prefers contact@ over generic)', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockCrawlWebsite.mockResolvedValue(
      makeCrawlResult({
        emails: ['john@acmedental.com', 'contact@acmedental.com', 'info@acmedental.com'],
      }),
    );
    mockFetchReviews.mockResolvedValue(makeReviewResult());
    mockAnalyzeReviews.mockResolvedValue(makeAnalysis());
    mockEnrichmentRepo.upsert.mockResolvedValue({});
    mockLeadRepo.setEmail.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockQualifyQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    // contact@ is preferred over john@ and info@
    expect(mockLeadRepo.setEmail).toHaveBeenCalledWith('lead-1', 'contact@acmedental.com');
  });

  it('saves enrichment data and transitions lead to enriched', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockCrawlWebsite.mockResolvedValue(makeCrawlResult());
    mockFetchReviews.mockResolvedValue(makeReviewResult());
    mockAnalyzeReviews.mockResolvedValue(makeAnalysis());
    mockEnrichmentRepo.upsert.mockResolvedValue({});
    mockLeadRepo.setEmail.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockQualifyQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    expect(mockEnrichmentRepo.upsert).toHaveBeenCalledWith('lead-1', {
      hasWhatsapp: true,
      hasChatbot: false,
      hasOnlineBooking: true,
      emailsFound: ['info@acmedental.com', 'john@acmedental.com'],
      websiteTechSignals: { pagesCrawled: 3 },
      reviewSentimentSummary: 'Generally positive with booking complaints.',
      painSignals: [{ signal: 'hard_to_book', count: 3, example: 'Hard to book' }],
    });

    expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-1', 'enriched', undefined);
  });

  it('enqueues qualify job after successful enrichment', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockCrawlWebsite.mockResolvedValue(makeCrawlResult());
    mockFetchReviews.mockResolvedValue(makeReviewResult());
    mockAnalyzeReviews.mockResolvedValue(makeAnalysis());
    mockEnrichmentRepo.upsert.mockResolvedValue({});
    mockLeadRepo.setEmail.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockQualifyQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    expect(mockQualifyQueueAdd).toHaveBeenCalledWith(
      'qualify-lead',
      { leadId: 'lead-1' },
      { jobId: 'qualify-lead-1' },
    );
  });

  it('handles crawler timeout gracefully — saves null signals', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockCrawlWebsite.mockRejectedValue(new Error('Crawl timed out'));
    mockFetchReviews.mockResolvedValue(makeReviewResult());
    mockAnalyzeReviews.mockResolvedValue(makeAnalysis());
    mockEnrichmentRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockQualifyQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    // Enrichment saved with null crawl signals
    expect(mockEnrichmentRepo.upsert).toHaveBeenCalledWith('lead-1', {
      hasWhatsapp: null,
      hasChatbot: null,
      hasOnlineBooking: null,
      emailsFound: [],
      websiteTechSignals: Prisma.DbNull,
      reviewSentimentSummary: 'Generally positive with booking complaints.',
      painSignals: [{ signal: 'hard_to_book', count: 3, example: 'Hard to book' }],
    });

    // No email set (crawl failed)
    expect(mockLeadRepo.setEmail).not.toHaveBeenCalled();

    // Error recorded but still marked enriched
    expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith(
      'lead-1',
      'enriched',
      'crawl: Crawl timed out',
    );

    // Qualify still enqueued
    expect(mockQualifyQueueAdd).toHaveBeenCalled();
  });

  it('skips review analysis if no googleMapsPlaceId', async () => {
    const lead = makeLead({ googleMapsPlaceId: null });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockCrawlWebsite.mockResolvedValue(makeCrawlResult());
    mockEnrichmentRepo.upsert.mockResolvedValue({});
    mockLeadRepo.setEmail.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockQualifyQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    expect(mockFetchReviews).not.toHaveBeenCalled();
    expect(mockAnalyzeReviews).not.toHaveBeenCalled();

    // Enrichment saved with null review data
    expect(mockEnrichmentRepo.upsert).toHaveBeenCalledWith('lead-1', {
      hasWhatsapp: true,
      hasChatbot: false,
      hasOnlineBooking: true,
      emailsFound: ['info@acmedental.com', 'john@acmedental.com'],
      websiteTechSignals: { pagesCrawled: 3 },
      reviewSentimentSummary: null,
      painSignals: Prisma.DbNull,
    });
  });

  it('skips crawl if no websiteUrl', async () => {
    const lead = makeLead({ websiteUrl: null });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockFetchReviews.mockResolvedValue(makeReviewResult());
    mockAnalyzeReviews.mockResolvedValue(makeAnalysis());
    mockEnrichmentRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockQualifyQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    expect(mockCrawlWebsite).not.toHaveBeenCalled();

    // No email set (no crawl)
    expect(mockLeadRepo.setEmail).not.toHaveBeenCalled();

    // Enrichment saved with null crawl data but valid review data
    expect(mockEnrichmentRepo.upsert).toHaveBeenCalledWith('lead-1', {
      hasWhatsapp: null,
      hasChatbot: null,
      hasOnlineBooking: null,
      emailsFound: [],
      websiteTechSignals: Prisma.DbNull,
      reviewSentimentSummary: 'Generally positive with booking complaints.',
      painSignals: [{ signal: 'hard_to_book', count: 3, example: 'Hard to book' }],
    });
  });

  it('records error in lastError on failure', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockCrawlWebsite.mockRejectedValue(new Error('Connection refused'));
    mockFetchReviews.mockRejectedValue(new Error('API rate limited'));
    mockEnrichmentRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockQualifyQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    // Both errors recorded
    expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith(
      'lead-1',
      'enriched',
      'crawl: Connection refused; reviews: API rate limited',
    );

    // Still enriched with all null data
    expect(mockEnrichmentRepo.upsert).toHaveBeenCalledWith('lead-1', {
      hasWhatsapp: null,
      hasChatbot: null,
      hasOnlineBooking: null,
      emailsFound: [],
      websiteTechSignals: Prisma.DbNull,
      reviewSentimentSummary: null,
      painSignals: Prisma.DbNull,
    });

    // Qualify still enqueued
    expect(mockQualifyQueueAdd).toHaveBeenCalled();
  });

  it('skips processing when lead is not found', async () => {
    mockLeadRepo.findById.mockResolvedValue(null);

    await capturedProcessor(makeJob('nonexistent'));

    expect(mockCrawlWebsite).not.toHaveBeenCalled();
    expect(mockFetchReviews).not.toHaveBeenCalled();
    expect(mockEnrichmentRepo.upsert).not.toHaveBeenCalled();
    expect(mockQualifyQueueAdd).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  pickBestEmail unit tests                                           */
/* ------------------------------------------------------------------ */

describe('pickBestEmail', () => {
  it('returns null for empty array', () => {
    expect(pickBestEmail([])).toBeNull();
  });

  it('prefers contact@ over generic emails', () => {
    expect(pickBestEmail(['john@example.com', 'contact@example.com'])).toBe('contact@example.com');
  });

  it('prefers info@ when no contact@', () => {
    expect(pickBestEmail(['john@example.com', 'info@example.com'])).toBe('info@example.com');
  });

  it('falls back to first email when no preferred prefix', () => {
    expect(pickBestEmail(['john@example.com', 'jane@example.com'])).toBe('john@example.com');
  });

  it('ranks contact@ above info@', () => {
    expect(pickBestEmail(['info@example.com', 'contact@example.com'])).toBe('contact@example.com');
  });
});
