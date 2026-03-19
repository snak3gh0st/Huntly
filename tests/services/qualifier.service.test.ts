import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks — BEFORE importing the service                               */
/* ------------------------------------------------------------------ */

const mockCallAI = vi.fn<(...args: unknown[]) => Promise<string>>();
const mockIsExcluded = vi.fn<(...args: unknown[]) => Promise<boolean>>();

vi.mock('../../src/lib/ai.js', () => ({
  callAI: (...args: unknown[]) => mockCallAI(...args),
}));

vi.mock('../../src/db/index.js', () => ({
  excludedClientRepo: {
    isExcluded: (...args: unknown[]) => mockIsExcluded(...args),
  },
}));

import { qualifyLead } from '../../src/services/qualifier.service.js';
import type {
  QualificationInput,
  QualificationResult,
} from '../../src/services/qualifier.service.js';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const BASE_INPUT: QualificationInput = {
  businessName: 'Smile Dental Clinic',
  category: 'dentist',
  region: 'Belo Horizonte',
  country: 'Brazil',
  phone: '+5531999887766',
  websiteUrl: 'https://www.smileclinic.com.br',
  googleRating: 4.2,
  googleReviewCount: 87,
  hasWhatsapp: true,
  hasChatbot: false,
  hasOnlineBooking: false,
  painSignals: [
    { signal: 'slow_response', count: 5, example: 'Took 3 days to reply on WhatsApp' },
    { signal: 'hard_to_book', count: 3, example: 'Impossible to schedule online' },
  ],
  reviewSentimentSummary: 'Good dentists but very hard to reach and book appointments.',
};

const VALID_AI_RESULT: QualificationResult = {
  fitScore: 82,
  scoreReasoning:
    'High pain signals (slow_response, hard_to_book) combined with WhatsApp usage and no chatbot make this an excellent fit for SigmaAI.',
  personalizedHook:
    'Smile Dental Clinic, 5 of your Google reviewers mentioned slow response times and 3 said booking was difficult. An AI assistant on your existing WhatsApp could handle these inquiries 24/7.',
  demoScenario: {
    businessName: 'Smile Dental Clinic',
    customerMessage: 'Oi, quero marcar uma limpeza para semana que vem.',
    botReply:
      'Olá! Temos horários disponíveis na terça e quinta. Qual funciona melhor para você?',
    followUp: 'Terça de manhã.',
    botConfirm:
      'Perfeito! Agendei sua limpeza para terça às 9h. Vou enviar um lembrete na véspera. Até lá!',
  },
  disqualifyReason: null,
};

/* ------------------------------------------------------------------ */
/*  Tests: AI scoring + content generation                             */
/* ------------------------------------------------------------------ */

describe('qualifyLead — AI scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsExcluded.mockResolvedValue(false);
  });

  it('returns fit score, reasoning, hook, and demo scenario from AI response', async () => {
    mockCallAI.mockResolvedValue(JSON.stringify(VALID_AI_RESULT));

    const result = await qualifyLead(BASE_INPUT);

    expect(result.fitScore).toBe(82);
    expect(result.scoreReasoning).toBe(VALID_AI_RESULT.scoreReasoning);
    expect(result.personalizedHook).toBe(VALID_AI_RESULT.personalizedHook);
    expect(result.demoScenario.businessName).toBe('Smile Dental Clinic');
    expect(result.demoScenario.customerMessage).toContain('limpeza');
    expect(result.demoScenario.botReply).toBeTruthy();
    expect(result.demoScenario.followUp).toBeTruthy();
    expect(result.demoScenario.botConfirm).toBeTruthy();
    expect(result.disqualifyReason).toBeNull();
  });

  it('scores high for businesses with pain signals + WhatsApp + no chatbot', async () => {
    mockCallAI.mockResolvedValue(JSON.stringify(VALID_AI_RESULT));

    await qualifyLead(BASE_INPUT);

    expect(mockCallAI).toHaveBeenCalledTimes(1);

    const callArgs = mockCallAI.mock.calls[0]![0] as {
      systemPrompt: string;
      userPrompt: string;
      json: boolean;
    };

    // Verify AI prompt includes enrichment signals for scoring
    expect(callArgs.userPrompt).toContain('Has WhatsApp: true');
    expect(callArgs.userPrompt).toContain('Has Chatbot: false');
    expect(callArgs.userPrompt).toContain('slow_response (5x');
    expect(callArgs.userPrompt).toContain('hard_to_book (3x');
    expect(callArgs.userPrompt).toContain('Took 3 days to reply on WhatsApp');
    expect(callArgs.json).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: exclusion check                                             */
/* ------------------------------------------------------------------ */

describe('qualifyLead — exclusion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disqualifies leads matching excluded_clients without calling AI', async () => {
    mockIsExcluded.mockResolvedValue(true);

    const result = await qualifyLead(BASE_INPUT);

    expect(result.fitScore).toBe(0);
    expect(result.disqualifyReason).toBe('excluded_client');
    expect(result.scoreReasoning).toContain('Excluded');
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it('passes phone and domain to exclusion check', async () => {
    mockIsExcluded.mockResolvedValue(false);
    mockCallAI.mockResolvedValue(JSON.stringify(VALID_AI_RESULT));

    await qualifyLead(BASE_INPUT);

    expect(mockIsExcluded).toHaveBeenCalledWith(
      '+5531999887766',
      'www.smileclinic.com.br',
    );
  });

  it('passes undefined phone and domain when not provided', async () => {
    mockIsExcluded.mockResolvedValue(false);
    mockCallAI.mockResolvedValue(JSON.stringify(VALID_AI_RESULT));

    const input: QualificationInput = {
      ...BASE_INPUT,
      phone: undefined,
      websiteUrl: undefined,
    };

    await qualifyLead(input);

    expect(mockIsExcluded).toHaveBeenCalledWith(undefined, undefined);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: fitScore bounding                                           */
/* ------------------------------------------------------------------ */

describe('qualifyLead — score bounding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsExcluded.mockResolvedValue(false);
  });

  it('caps fitScore at 100 when AI returns > 100', async () => {
    const overResult = { ...VALID_AI_RESULT, fitScore: 150 };
    mockCallAI.mockResolvedValue(JSON.stringify(overResult));

    const result = await qualifyLead(BASE_INPUT);

    expect(result.fitScore).toBe(100);
  });

  it('floors fitScore at 0 when AI returns negative', async () => {
    const underResult = { ...VALID_AI_RESULT, fitScore: -10 };
    mockCallAI.mockResolvedValue(JSON.stringify(underResult));

    const result = await qualifyLead(BASE_INPUT);

    expect(result.fitScore).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: malformed AI response fallback                              */
/* ------------------------------------------------------------------ */

describe('qualifyLead — fallback on bad AI response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsExcluded.mockResolvedValue(false);
  });

  it('falls back to fitScore 30 on malformed AI response', async () => {
    mockCallAI.mockResolvedValue('this is not valid JSON at all');

    const result = await qualifyLead(BASE_INPUT);

    expect(result.fitScore).toBe(30);
    expect(result.scoreReasoning).toContain('manual review');
    expect(result.disqualifyReason).toBeNull();
    expect(result.demoScenario.businessName).toBe('Smile Dental Clinic');
  });

  it('falls back on partial / broken JSON', async () => {
    mockCallAI.mockResolvedValue('{"fitScore": 85, "scoreReasoning": "great"');

    const result = await qualifyLead(BASE_INPUT);

    expect(result.fitScore).toBe(30);
    expect(result.scoreReasoning).toContain('manual review');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: prompt correctness                                          */
/* ------------------------------------------------------------------ */

describe('qualifyLead — prompt construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsExcluded.mockResolvedValue(false);
  });

  it('passes correct business details in user prompt', async () => {
    mockCallAI.mockResolvedValue(JSON.stringify(VALID_AI_RESULT));

    await qualifyLead(BASE_INPUT);

    const callArgs = mockCallAI.mock.calls[0]![0] as {
      systemPrompt: string;
      userPrompt: string;
      json: boolean;
    };

    expect(callArgs.userPrompt).toContain('Business: Smile Dental Clinic');
    expect(callArgs.userPrompt).toContain('Category: dentist');
    expect(callArgs.userPrompt).toContain('Location: Belo Horizonte, Brazil');
    expect(callArgs.userPrompt).toContain('Google Rating: 4.2 (87 reviews)');
    expect(callArgs.userPrompt).toContain('Has Online Booking: false');
    expect(callArgs.userPrompt).toContain(
      'Review Sentiment: Good dentists but very hard to reach',
    );
  });

  it('handles missing optional fields gracefully', async () => {
    mockCallAI.mockResolvedValue(JSON.stringify(VALID_AI_RESULT));

    const minimalInput: QualificationInput = {
      businessName: 'Test Biz',
      category: 'salon',
      region: 'Lisboa',
      hasWhatsapp: null,
      hasChatbot: null,
      hasOnlineBooking: null,
      painSignals: [],
      reviewSentimentSummary: '',
    };

    await qualifyLead(minimalInput);

    const callArgs = mockCallAI.mock.calls[0]![0] as {
      systemPrompt: string;
      userPrompt: string;
      json: boolean;
    };

    expect(callArgs.userPrompt).toContain('Business: Test Biz');
    expect(callArgs.userPrompt).toContain('Location: Lisboa');
    expect(callArgs.userPrompt).not.toContain(', undefined');
    expect(callArgs.userPrompt).toContain('Google Rating: N/A (0 reviews)');
    expect(callArgs.userPrompt).toContain('Has WhatsApp: unknown');
    expect(callArgs.userPrompt).toContain('Review Sentiment: No reviews analyzed');
    expect(callArgs.userPrompt).toContain('Pain Signals: None detected');
  });

  it('system prompt mentions scoring criteria', async () => {
    mockCallAI.mockResolvedValue(JSON.stringify(VALID_AI_RESULT));

    await qualifyLead(BASE_INPUT);

    const callArgs = mockCallAI.mock.calls[0]![0] as {
      systemPrompt: string;
      userPrompt: string;
      json: boolean;
    };

    expect(callArgs.systemPrompt).toContain('fit_score');
    expect(callArgs.systemPrompt).toContain('pain signals');
    expect(callArgs.systemPrompt).toContain('personalized_hook');
    expect(callArgs.systemPrompt).toContain('demo_scenario');
    expect(callArgs.systemPrompt).toContain('SigmaAI');
  });
});
