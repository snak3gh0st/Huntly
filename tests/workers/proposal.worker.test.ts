import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStudyLead = vi.fn();
const mockStrategize = vi.fn();
const mockGenerateSiteContent = vi.fn();
const mockPickVisualSystem = vi.fn();
const mockGenerateHeroImage = vi.fn().mockResolvedValue(null);
const mockBuildHeroImagePrompt = vi.fn().mockReturnValue('test prompt');
const mockCritiquePass = vi.fn();
const mockProposalUpdate = vi.fn();
const mockProposalFindById = vi.fn();

vi.mock('../../src/services/lead-study.service.js', () => ({
  studyLead: (...a: unknown[]) => mockStudyLead(...a),
}));

vi.mock('../../src/services/lead-strategy.service.js', () => ({
  strategize: (...a: unknown[]) => mockStrategize(...a),
}));

vi.mock('../../src/services/proposal-generator.service.js', () => ({
  generateSiteContent: (...a: unknown[]) => mockGenerateSiteContent(...a),
}));

vi.mock('../../src/services/visual-system.service.js', () => ({
  pickVisualSystem: (...a: unknown[]) => mockPickVisualSystem(...a),
}));

vi.mock('../../src/lib/dalle.js', () => ({
  generateHeroImage: (...a: unknown[]) => mockGenerateHeroImage(...a),
  buildHeroImagePrompt: (...a: unknown[]) => mockBuildHeroImagePrompt(...a),
}));

vi.mock('../../src/services/critique-pass.service.js', () => ({
  critiquePass: (...a: unknown[]) => mockCritiquePass(...a),
}));

vi.mock('../../src/db/index.js', () => ({
  proposalRepo: {
    findById: (...a: unknown[]) => mockProposalFindById(...a),
    update: (...a: unknown[]) => mockProposalUpdate(...a),
  },
}));

import { runProposalJob } from '../../src/workers/proposal.worker.js';

const VALID_STUDY = {
  currentSite: {
    hasWebsite: true,
    domain: 'smile.example',
    extractedHeadlines: [],
    extractedServices: [],
    designAssessment: 'Old Bootstrap template.',
    weaknesses: ['No booking', 'No social proof', 'Generic copy'],
    missingFeatures: ['Booking', 'Chat'],
    copyToneNow: 'Generic.',
  },
  business: {
    actualServices: ['Cleanings', 'Checkups'],
    targetCustomers: 'Austin families.',
    uniqueAngles: ['Same-day care', 'Family-friendly'],
    locationContext: 'Austin, TX.',
  },
  voice: {
    customerLanguage: [],
    keyPainPoints: [],
    keyAspirations: [],
  },
};

const VALID_STRATEGY = {
  heroAngle: 'Austin dental care with same-day appointments.',
  conversionOpportunities: [
    { gap: 'No online booking', fix: 'Add Calendly widget' },
    { gap: 'No social proof', fix: 'Star rating strip' },
    { gap: 'Generic copy', fix: 'Austin-specific headline' },
  ],
  copyTone: 'Warm and direct.',
  designPriorities: ['Hero CTA', 'Social proof strip', 'Services grid'],
  manifestoSeed: 'Dental care that fits your schedule.',
};

const VALID_CONTENT = {
  brand: { tagline: 't', description: 'd' },
  hero: { imageQuery: 'dental office Austin', ctaLabel: 'Book Now', ctaAction: 'call' },
  stats: null,
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

const VALID_VISUAL_SYSTEM = {
  paletteKey: 'warmNeutral',
  fontKey: 'fraunces_inter',
  reasoning: 'Warm tones suit a dental clinic.',
};

const VALID_CRITIQUE = {
  overallScore: 8,
  issues: [],
  applyFix: [],
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

  function setupHappyPath() {
    mockProposalFindById.mockResolvedValue(PROPOSAL_WITH_LEAD);
    mockStudyLead.mockResolvedValue(VALID_STUDY);
    mockStrategize.mockResolvedValue(VALID_STRATEGY);
    mockPickVisualSystem.mockResolvedValue(VALID_VISUAL_SYSTEM);
    mockGenerateHeroImage.mockResolvedValue(null);
    mockGenerateSiteContent.mockResolvedValue(VALID_CONTENT);
    mockCritiquePass.mockResolvedValue({ critique: VALID_CRITIQUE, appliedContent: VALID_CONTENT });
  }

  it('calls all pipeline layers in order and stores all outputs', async () => {
    setupHappyPath();

    await runProposalJob({ proposalId: 'prop-1' });

    // All layers were called
    expect(mockStudyLead).toHaveBeenCalledTimes(1);
    expect(mockStrategize).toHaveBeenCalledTimes(1);
    expect(mockPickVisualSystem).toHaveBeenCalledTimes(1);
    expect(mockGenerateSiteContent).toHaveBeenCalledTimes(1);
    expect(mockCritiquePass).toHaveBeenCalledTimes(1);

    // Layer 2 receives Layer 1 output
    expect(mockStrategize).toHaveBeenCalledWith(expect.anything(), VALID_STUDY);

    // Layer 3 receives Layer 1 + Layer 2 outputs
    expect(mockGenerateSiteContent).toHaveBeenCalledWith(
      expect.anything(), VALID_STUDY, VALID_STRATEGY,
    );

    // Critique receives generated content + study + strategy
    expect(mockCritiquePass).toHaveBeenCalledWith(VALID_CONTENT, VALID_STUDY, VALID_STRATEGY);
  });

  it('stores all layers including _critique and _visualSystem in proposal.content', async () => {
    setupHappyPath();

    await runProposalJob({ proposalId: 'prop-1' });

    expect(mockProposalUpdate).toHaveBeenCalledWith(
      'prop-1',
      expect.objectContaining({
        status: 'draft',
        content: expect.objectContaining({
          _study: VALID_STUDY,
          _strategy: VALID_STRATEGY,
          _visualSystem: VALID_VISUAL_SYSTEM,
          _critique: VALID_CRITIQUE,
        }),
        suggestedTier: 'Pro',  // 120 reviews
      }),
    );
  });

  it('marks proposal failed when studyLead throws', async () => {
    mockProposalFindById.mockResolvedValue(PROPOSAL_WITH_LEAD);
    mockStudyLead.mockRejectedValue(new Error('Crawl timeout'));

    await runProposalJob({ proposalId: 'prop-1' });

    expect(mockStrategize).not.toHaveBeenCalled();
    expect(mockGenerateSiteContent).not.toHaveBeenCalled();
    expect(mockProposalUpdate).toHaveBeenCalledWith(
      'prop-1',
      expect.objectContaining({
        status: 'failed',
        generationError: expect.stringContaining('Crawl timeout'),
      }),
    );
  });

  it('marks proposal failed when strategize throws', async () => {
    mockProposalFindById.mockResolvedValue(PROPOSAL_WITH_LEAD);
    mockStudyLead.mockResolvedValue(VALID_STUDY);
    mockStrategize.mockRejectedValue(new Error('Strategy AI timeout'));

    await runProposalJob({ proposalId: 'prop-1' });

    expect(mockGenerateSiteContent).not.toHaveBeenCalled();
    expect(mockProposalUpdate).toHaveBeenCalledWith(
      'prop-1',
      expect.objectContaining({
        status: 'failed',
        generationError: expect.stringContaining('Strategy AI timeout'),
      }),
    );
  });

  it('marks proposal failed when generateSiteContent throws', async () => {
    mockProposalFindById.mockResolvedValue(PROPOSAL_WITH_LEAD);
    mockStudyLead.mockResolvedValue(VALID_STUDY);
    mockStrategize.mockResolvedValue(VALID_STRATEGY);
    mockPickVisualSystem.mockResolvedValue(VALID_VISUAL_SYSTEM);
    mockGenerateHeroImage.mockResolvedValue(null);
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

    expect(mockStudyLead).not.toHaveBeenCalled();
    expect(mockStrategize).not.toHaveBeenCalled();
    expect(mockGenerateSiteContent).not.toHaveBeenCalled();
    expect(mockProposalUpdate).not.toHaveBeenCalled();
  });

  it('passes operator notes from job data into the generator input (Layer 1)', async () => {
    setupHappyPath();

    await runProposalJob({ proposalId: 'prop-1', operatorNotes: 'Hire dentist soon' });

    expect(mockStudyLead).toHaveBeenCalledWith(
      expect.objectContaining({ operatorNotes: 'Hire dentist soon' }),
    );
  });
});
