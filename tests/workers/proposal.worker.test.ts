import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateSiteContent = vi.fn();
const mockProposalUpdate = vi.fn();
const mockProposalFindById = vi.fn();

vi.mock('../../src/services/proposal-generator.service.js', () => ({
  generateSiteContent: (...a: unknown[]) => mockGenerateSiteContent(...a),
}));

vi.mock('../../src/db/index.js', () => ({
  proposalRepo: {
    findById: (...a: unknown[]) => mockProposalFindById(...a),
    update: (...a: unknown[]) => mockProposalUpdate(...a),
  },
}));

import { runProposalJob } from '../../src/workers/proposal.worker.js';

const VALID_CONTENT = {
  brand: { tagline: 't', description: 'd' },
  services: [
    { icon: 'phone', title: 'a', description: 'a' },
    { icon: 'star', title: 'b', description: 'b' },
    { icon: 'shield', title: 'c', description: 'c' },
    { icon: 'zap', title: 'd', description: 'd' },
  ],
  testimonials: [],
  contact: { headline: 'c', address: null, phone: null, whatsapp: null, hours: null },
  proposalIntro: { salutation: 'Hi', pitch: 'p' },
  diagnosis: { bullets: [
    { icon: 'clock', label: 'l', evidence: 'e' },
    { icon: 'message', label: 'l2', evidence: 'e2' },
  ]},
  pricingPitch: { headline: 'h', valueBullets: ['a', 'b'] },
  cta: { primaryLabel: 'Accept', reassurance: 'r' },
};

const PROPOSAL_WITH_LEAD = {
  id: 'prop-1',
  leadId: 'lead-1',
  status: 'generating',
  lead: {
    businessName: 'Smile Dental',
    category: 'dental_clinic',
    region: 'Austin, TX',
    websiteUrl: 'https://example.com',
    googleRating: 4.5,
    googleReviewCount: 120,
    enrichment: {
      hasChatbot: false,
      hasOnlineBooking: false,
      hasWhatsapp: false,
      painSignals: [],
      reviewSentimentSummary: '',
      ownerName: 'Dr. Silva',
    },
    qualification: { personalizedHook: 'hook text' },
  },
};

describe('runProposalJob', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates content and updates proposal to draft on success', async () => {
    mockProposalFindById.mockResolvedValue(PROPOSAL_WITH_LEAD);
    mockGenerateSiteContent.mockResolvedValue(VALID_CONTENT);

    await runProposalJob({ proposalId: 'prop-1' });

    expect(mockProposalUpdate).toHaveBeenCalledWith(
      'prop-1',
      expect.objectContaining({
        status: 'draft',
        content: VALID_CONTENT,
        suggestedTier: 'Pro',  // 120 reviews
      }),
    );
  });

  it('marks proposal failed when generator throws', async () => {
    mockProposalFindById.mockResolvedValue(PROPOSAL_WITH_LEAD);
    mockGenerateSiteContent.mockRejectedValue(new Error('Anthropic timeout'));

    await runProposalJob({ proposalId: 'prop-1' });

    expect(mockProposalUpdate).toHaveBeenCalledWith(
      'prop-1',
      expect.objectContaining({
        status: 'failed',
        generationError: expect.stringContaining('Anthropic timeout'),
      }),
    );
  });

  it('is a no-op when proposal is not found', async () => {
    mockProposalFindById.mockResolvedValue(null);

    await runProposalJob({ proposalId: 'gone' });

    expect(mockGenerateSiteContent).not.toHaveBeenCalled();
    expect(mockProposalUpdate).not.toHaveBeenCalled();
  });

  it('passes operator notes from job data into the generator input', async () => {
    mockProposalFindById.mockResolvedValue(PROPOSAL_WITH_LEAD);
    mockGenerateSiteContent.mockResolvedValue(VALID_CONTENT);

    await runProposalJob({ proposalId: 'prop-1', operatorNotes: 'Hire dentist soon' });

    expect(mockGenerateSiteContent).toHaveBeenCalledWith(
      expect.objectContaining({ operatorNotes: 'Hire dentist soon' }),
    );
  });
});
