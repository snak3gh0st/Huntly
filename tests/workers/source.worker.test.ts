import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks — must be hoisted before any import of the worker module    */
/* ------------------------------------------------------------------ */

const mockSearchBusinesses = vi.fn();
const mockLeadRepo = {
  existsByPlaceId: vi.fn(),
  createFromSource: vi.fn(),
};
const mockCampaignRepo = {
  findById: vi.fn(),
};
const mockEnrichQueueAdd = vi.fn();

// Track the processor function that Worker receives
let capturedProcessor: (job: { data: { campaignId: string } }) => Promise<void>;

vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    add = mockEnrichQueueAdd;
    constructor(name: string) {
      this.name = name;
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

vi.mock('../../src/services/outscraper.service.js', () => ({
  searchBusinesses: mockSearchBusinesses,
}));

vi.mock('../../src/db/index.js', () => ({
  leadRepo: mockLeadRepo,
  campaignRepo: mockCampaignRepo,
}));

// Dynamic import — triggers module evaluation after mocks are set up
await import('../../src/workers/source.worker.js');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeJob(campaignId: string) {
  return { data: { campaignId } };
}

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'camp-1',
    name: 'Test Campaign',
    status: 'active',
    vertical: 'dentists',
    regions: ['New York', 'Los Angeles'],
    ...overrides,
  };
}

function makeOutscraperResult(overrides: Record<string, unknown> = {}) {
  return {
    businessName: 'Acme Dental',
    category: 'Dentist',
    address: '123 Main St',
    phone: '+15551234567',
    websiteUrl: 'https://acmedental.com',
    googleMapsPlaceId: 'ChIJ_abc123',
    googleRating: 4.5,
    googleReviewCount: 120,
    raw: { place_id: 'ChIJ_abc123', name: 'Acme Dental' },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('source worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates queries from campaign vertical x regions', async () => {
    const campaign = makeCampaign();
    mockCampaignRepo.findById.mockResolvedValue(campaign);
    mockSearchBusinesses.mockResolvedValue([]);

    await capturedProcessor(makeJob('camp-1'));

    expect(mockSearchBusinesses).toHaveBeenCalledTimes(2);
    expect(mockSearchBusinesses).toHaveBeenCalledWith('dentists in New York');
    expect(mockSearchBusinesses).toHaveBeenCalledWith('dentists in Los Angeles');
  });

  it('creates leads and enqueues enrich jobs for each result', async () => {
    const campaign = makeCampaign({ regions: ['New York'] });
    mockCampaignRepo.findById.mockResolvedValue(campaign);

    const result1 = makeOutscraperResult({ googleMapsPlaceId: 'place-1', businessName: 'Biz 1' });
    const result2 = makeOutscraperResult({ googleMapsPlaceId: 'place-2', businessName: 'Biz 2' });
    mockSearchBusinesses.mockResolvedValue([result1, result2]);
    mockLeadRepo.existsByPlaceId.mockResolvedValue(false);
    mockLeadRepo.createFromSource
      .mockResolvedValueOnce({ id: 'lead-1' })
      .mockResolvedValueOnce({ id: 'lead-2' });

    await capturedProcessor(makeJob('camp-1'));

    expect(mockLeadRepo.createFromSource).toHaveBeenCalledTimes(2);
    expect(mockLeadRepo.createFromSource).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'camp-1',
        businessName: 'Biz 1',
        googleMapsPlaceId: 'place-1',
        region: 'New York',
      }),
    );

    expect(mockEnrichQueueAdd).toHaveBeenCalledTimes(2);
    expect(mockEnrichQueueAdd).toHaveBeenCalledWith(
      'enrich-lead',
      { leadId: 'lead-1' },
      { jobId: 'enrich-lead-1' },
    );
    expect(mockEnrichQueueAdd).toHaveBeenCalledWith(
      'enrich-lead',
      { leadId: 'lead-2' },
      { jobId: 'enrich-lead-2' },
    );
  });

  it('skips leads with existing place_id (dedup)', async () => {
    const campaign = makeCampaign({ regions: ['New York'] });
    mockCampaignRepo.findById.mockResolvedValue(campaign);

    const existingResult = makeOutscraperResult({ googleMapsPlaceId: 'existing-place' });
    const newResult = makeOutscraperResult({ googleMapsPlaceId: 'new-place', businessName: 'New Biz' });
    mockSearchBusinesses.mockResolvedValue([existingResult, newResult]);

    mockLeadRepo.existsByPlaceId
      .mockResolvedValueOnce(true)   // existing-place — already in DB
      .mockResolvedValueOnce(false); // new-place — not in DB
    mockLeadRepo.createFromSource.mockResolvedValue({ id: 'lead-new' });

    await capturedProcessor(makeJob('camp-1'));

    expect(mockLeadRepo.existsByPlaceId).toHaveBeenCalledWith('existing-place');
    expect(mockLeadRepo.existsByPlaceId).toHaveBeenCalledWith('new-place');
    expect(mockLeadRepo.createFromSource).toHaveBeenCalledTimes(1);
    expect(mockLeadRepo.createFromSource).toHaveBeenCalledWith(
      expect.objectContaining({ businessName: 'New Biz' }),
    );
  });

  it('handles Outscraper failure gracefully (continues to next region)', async () => {
    const campaign = makeCampaign({ regions: ['Failing Region', 'Good Region'] });
    mockCampaignRepo.findById.mockResolvedValue(campaign);

    mockSearchBusinesses
      .mockRejectedValueOnce(new Error('API rate limited'))
      .mockResolvedValueOnce([makeOutscraperResult()]);

    mockLeadRepo.existsByPlaceId.mockResolvedValue(false);
    mockLeadRepo.createFromSource.mockResolvedValue({ id: 'lead-1' });

    // Should NOT throw — gracefully continues
    await capturedProcessor(makeJob('camp-1'));

    expect(mockSearchBusinesses).toHaveBeenCalledTimes(2);
    // Second region still processed
    expect(mockLeadRepo.createFromSource).toHaveBeenCalledTimes(1);
  });

  it('skips inactive campaigns', async () => {
    mockCampaignRepo.findById.mockResolvedValue(makeCampaign({ status: 'paused' }));

    await capturedProcessor(makeJob('camp-1'));

    expect(mockSearchBusinesses).not.toHaveBeenCalled();
    expect(mockLeadRepo.createFromSource).not.toHaveBeenCalled();
  });

  it('skips when campaign is not found', async () => {
    mockCampaignRepo.findById.mockResolvedValue(null);

    await capturedProcessor(makeJob('nonexistent'));

    expect(mockSearchBusinesses).not.toHaveBeenCalled();
  });

  it('handles lead creation failure gracefully (continues to next result)', async () => {
    const campaign = makeCampaign({ regions: ['New York'] });
    mockCampaignRepo.findById.mockResolvedValue(campaign);

    const result1 = makeOutscraperResult({ googleMapsPlaceId: 'place-1', businessName: 'Failing Biz' });
    const result2 = makeOutscraperResult({ googleMapsPlaceId: 'place-2', businessName: 'Good Biz' });
    mockSearchBusinesses.mockResolvedValue([result1, result2]);
    mockLeadRepo.existsByPlaceId.mockResolvedValue(false);
    mockLeadRepo.createFromSource
      .mockRejectedValueOnce(new Error('DB constraint violation'))
      .mockResolvedValueOnce({ id: 'lead-2' });

    await capturedProcessor(makeJob('camp-1'));

    expect(mockLeadRepo.createFromSource).toHaveBeenCalledTimes(2);
    // Enrich only enqueued for the successful one
    expect(mockEnrichQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockEnrichQueueAdd).toHaveBeenCalledWith(
      'enrich-lead',
      { leadId: 'lead-2' },
      { jobId: 'enrich-lead-2' },
    );
  });

  it('passes all source data fields to leadRepo.createFromSource', async () => {
    const campaign = makeCampaign({ regions: ['Miami'] });
    mockCampaignRepo.findById.mockResolvedValue(campaign);

    const result = makeOutscraperResult({
      businessName: 'Full Data Biz',
      category: 'Orthodontist',
      address: '789 Palm Blvd',
      phone: '+13051234567',
      websiteUrl: 'https://fulldatabiz.com',
      googleMapsPlaceId: 'ChIJ_full',
      googleRating: 4.8,
      googleReviewCount: 250,
      raw: { place_id: 'ChIJ_full', name: 'Full Data Biz', extra: true },
    });
    mockSearchBusinesses.mockResolvedValue([result]);
    mockLeadRepo.existsByPlaceId.mockResolvedValue(false);
    mockLeadRepo.createFromSource.mockResolvedValue({ id: 'lead-full' });

    await capturedProcessor(makeJob('camp-1'));

    expect(mockLeadRepo.createFromSource).toHaveBeenCalledWith({
      campaignId: 'camp-1',
      businessName: 'Full Data Biz',
      category: 'Orthodontist',
      address: '789 Palm Blvd',
      region: 'Miami',
      phone: '+13051234567',
      websiteUrl: 'https://fulldatabiz.com',
      googleMapsPlaceId: 'ChIJ_full',
      googleRating: 4.8,
      googleReviewCount: 250,
      sourceData: { place_id: 'ChIJ_full', name: 'Full Data Biz', extra: true },
    });
  });
});
