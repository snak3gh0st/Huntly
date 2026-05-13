import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks — must be declared before module imports                      */
/* ------------------------------------------------------------------ */

const mockCallAIWithProvider = vi.fn<(...args: unknown[]) => Promise<string>>();

vi.mock('../../src/lib/ai.js', () => ({
  callAIWithProvider: (...args: unknown[]) => mockCallAIWithProvider(...args),
}));

import {
  DesignDirectionSchema,
  designDirection,
  SECTION_TYPES,
  type DesignDirection,
} from '../../src/services/design-direction.service.js';
import type { LeadStudy } from '../../src/services/lead-study.service.js';
import type { Strategy } from '../../src/services/lead-strategy.service.js';
import type { VisualSystem } from '../../src/services/visual-system.service.js';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                            */
/* ------------------------------------------------------------------ */

const mockStudy: LeadStudy = {
  currentSite: {
    hasWebsite: true,
    domain: 'example.com',
    extractedHeadlines: ['Welcome to Austin Family Dental'],
    extractedServices: ['Cleanings', 'Fillings', 'Crowns'],
    designAssessment: '2015-era WordPress template with stock photography and no mobile optimization.',
    weaknesses: [
      'No online booking — 8 reviewers requested it',
      'Hero is a stock image unrelated to the practice',
      'No patient testimonials visible above the fold',
    ],
    missingFeatures: ['Online booking', 'Mobile-first layout'],
    copyToneNow: 'Generic and impersonal — sounds like a national chain template, not a local practice.',
  },
  business: {
    actualServices: ['Routine Cleanings', 'Composite Fillings', 'Same-Day Crowns', 'Teeth Whitening', 'Emergency Care'],
    targetCustomers: 'Families and individuals in Austin, TX seeking a trustworthy neighborhood dentist.',
    uniqueAngles: [
      'Same-day crown technology — patients leave with a finished crown the same visit',
      'Spanish-language staff available — bilingual practice serving East Austin',
    ],
    locationContext: 'Austin, TX. East Austin neighborhood, near the Domain. Competitive dental market with many chain practices nearby.',
  },
  voice: {
    customerLanguage: [
      'Dr. Morales made me feel at home immediately',
      'I was dreading the dentist but they made it easy',
      'Finished my crown in one visit — no second appointment needed',
    ],
    keyPainPoints: [
      'Anxiety about dental procedures',
      'Difficulty booking appointments online',
    ],
    keyAspirations: [
      'Wants to find a dentist who treats them like a person, not a chart number',
      'Looking for same-day solutions to avoid taking extra time off work',
    ],
  },
};

const mockStrategy: Strategy = {
  heroAngle: 'Austin dentistry without the wait — same-day crowns, bilingual care, an East Austin practice that works on your schedule.',
  conversionOpportunities: [
    { gap: 'No online booking forces patients to call during business hours', fix: 'Prominent booking CTA visible above the fold on mobile' },
    { gap: 'Stock photography creates no connection to the actual practice', fix: 'Real interior photography of the office' },
    { gap: 'No testimonials visible — patients cannot see social proof before calling', fix: 'Pull-quote testimonials from Google review data above the services fold' },
  ],
  copyTone: 'Warm and direct. Speaks to Austin families in plain English — no clinical jargon.',
  designPriorities: [
    'Mobile-first booking flow',
    'Social proof above the fold',
    'Typography carries the personality',
  ],
  manifestoSeed: 'Dentistry that respects your time and your nerves.',
};

const mockVisualSystem: VisualSystem = {
  paletteKey: 'forestNeutral',
  fontKey: 'newsreader_outfit',
  reasoning: 'Forest green palette signals health and approachability for a family dental practice.',
};

/* ------------------------------------------------------------------ */
/*  Valid direction fixture                                            */
/* ------------------------------------------------------------------ */

const validDirection: DesignDirection = {
  sectionsInOrder: [
    { type: 'hero', rationale: 'Opens the page — always first.', designNote: '90vh, text left 60%, Newsreader display heading.', contentEmphasis: 'Same-day crown angle + book appointment CTA' },
    { type: 'about', rationale: 'Study shows no about section on current site.', designNote: 'Single narrow column, 62ch max, generous padding.', contentEmphasis: 'East Austin neighborhood practice, Dr. Morales bio' },
    { type: 'services', rationale: 'Five concrete services in Study actualServices.', designNote: 'Numbered rows 01-05, expandable details, hairline dividers.', contentEmphasis: 'Same-day crown lead service featured first' },
    { type: 'testimonials', rationale: '3 strong quotes in Study customerLanguage.', designNote: 'Pull-quote Newsreader italic at clamp(1.5rem,2vw,2.25rem).', contentEmphasis: 'One-visit crown, personal care, bilingual staff' },
    { type: 'contact', rationale: 'Conversion endpoint — always last.', designNote: 'Two-col: dl card left, maps iframe right.', contentEmphasis: 'Phone, address, East Austin location context' },
  ],
  microcopyDirection: 'Verbs tied to patient situation: "Book my cleaning today", "See same-day availability". No "Get started", no "Learn more".',
  signatureMoves: [
    'Oversized Newsreader italic "Same day." breaking across two lines against tight Outfit 700 subheading in the hero',
    'Service numbers 01-05 in display-scale forest green creating visual rhythm without any icons',
  ],
};

/* ------------------------------------------------------------------ */
/*  Schema validation tests                                            */
/* ------------------------------------------------------------------ */

describe('DesignDirectionSchema', () => {
  it('validates a minimal valid direction', () => {
    const result = DesignDirectionSchema.safeParse(validDirection);
    expect(result.success).toBe(true);
  });

  it('rejects direction with fewer than 5 sections', () => {
    const tooFew = {
      ...validDirection,
      sectionsInOrder: validDirection.sectionsInOrder.slice(0, 4),
    };
    const result = DesignDirectionSchema.safeParse(tooFew);
    expect(result.success).toBe(false);
  });

  it('rejects direction with more than 10 sections', () => {
    const tooMany = {
      ...validDirection,
      // 11 items — exceeds max(10)
      sectionsInOrder: [
        ...validDirection.sectionsInOrder,
        ...validDirection.sectionsInOrder,
        { type: 'faq', rationale: 'r', designNote: 'd', contentEmphasis: 'c' },
      ],
    };
    const result = DesignDirectionSchema.safeParse(tooMany);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid section type', () => {
    const bad = {
      ...validDirection,
      sectionsInOrder: [
        { type: 'team', rationale: 'x', designNote: 'y', contentEmphasis: 'z' },
        ...validDirection.sectionsInOrder.slice(1),
      ],
    };
    const result = DesignDirectionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects fewer than 2 signature moves', () => {
    const bad = { ...validDirection, signatureMoves: ['Only one move'] };
    const result = DesignDirectionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects more than 4 signature moves', () => {
    const bad = { ...validDirection, signatureMoves: ['a', 'b', 'c', 'd', 'e'] };
    const result = DesignDirectionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  SECTION_TYPES constant                                             */
/* ------------------------------------------------------------------ */

describe('SECTION_TYPES', () => {
  it('contains all expected section types', () => {
    expect(SECTION_TYPES).toContain('hero');
    expect(SECTION_TYPES).toContain('about');
    expect(SECTION_TYPES).toContain('services');
    expect(SECTION_TYPES).toContain('why-us');
    expect(SECTION_TYPES).toContain('what-changes');
    expect(SECTION_TYPES).toContain('process');
    expect(SECTION_TYPES).toContain('testimonials');
    expect(SECTION_TYPES).toContain('hours-locations');
    expect(SECTION_TYPES).toContain('faq');
    expect(SECTION_TYPES).toContain('cta-banner');
    expect(SECTION_TYPES).toContain('contact');
  });

  it('does not include team (not yet implemented)', () => {
    expect(SECTION_TYPES).not.toContain('team');
  });
});

/* ------------------------------------------------------------------ */
/*  designDirection() — retry behavior                                */
/* ------------------------------------------------------------------ */

describe('designDirection()', () => {
  beforeEach(() => {
    mockCallAIWithProvider.mockReset();
  });

  it('returns validated DesignDirection on first attempt', async () => {
    mockCallAIWithProvider.mockResolvedValueOnce(JSON.stringify(validDirection));
    const result = await designDirection(mockStudy, mockStrategy, mockVisualSystem);
    expect(result.sectionsInOrder).toHaveLength(5);
    expect(result.sectionsInOrder[0].type).toBe('hero');
    expect(result.signatureMoves).toHaveLength(2);
    expect(mockCallAIWithProvider).toHaveBeenCalledTimes(1);
  });

  it('retries once on validation failure then returns valid result', async () => {
    const invalid = JSON.stringify({ sectionsInOrder: [] }); // fails min(5)
    mockCallAIWithProvider
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(JSON.stringify(validDirection));

    const result = await designDirection(mockStudy, mockStrategy, mockVisualSystem);
    expect(result.sectionsInOrder).toHaveLength(5);
    expect(mockCallAIWithProvider).toHaveBeenCalledTimes(2);
  });

  it('throws after two validation failures', async () => {
    const invalid = JSON.stringify({ sectionsInOrder: [] });
    mockCallAIWithProvider
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(invalid);

    await expect(designDirection(mockStudy, mockStrategy, mockVisualSystem))
      .rejects.toThrow('Design direction failed validation twice');
  });

  it('passes study, strategy, and visual system to the AI call', async () => {
    mockCallAIWithProvider.mockResolvedValueOnce(JSON.stringify(validDirection));
    await designDirection(mockStudy, mockStrategy, mockVisualSystem);
    const [_provider, opts] = mockCallAIWithProvider.mock.calls[0] as [string, { systemPrompt: string; userPrompt: string }];
    // System prompt should mention the section types
    expect(opts.systemPrompt).toContain('hero');
    expect(opts.systemPrompt).toContain('process');
    // User prompt should include study and strategy data
    expect(opts.userPrompt).toContain('Austin Family Dental');
    expect(opts.userPrompt).toContain('forestNeutral');
  });
});
