import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock callAI BEFORE importing the service                           */
/* ------------------------------------------------------------------ */

const mockCallAI = vi.fn<(...args: unknown[]) => Promise<string>>();

vi.mock('../../src/lib/ai.js', () => ({
  callAI: (...args: unknown[]) => mockCallAI(...args),
}));

import { analyzeReviews } from '../../src/services/review-analyzer.service.js';
import type { ReviewAnalysis } from '../../src/services/review-analyzer.service.js';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const VALID_ANALYSIS: ReviewAnalysis = {
  sentimentSummary: 'Generally positive with some complaints about wait times.',
  painSignals: [
    { signal: 'long_wait', count: 3, example: 'Waited over an hour past my appointment time' },
    { signal: 'hard_to_reach', count: 1, example: 'Could never get anyone on the phone' },
  ],
  positiveThemes: ['friendly staff', 'clean office', 'thorough care'],
  totalAnalyzed: 5,
};

const SAMPLE_REVIEWS = [
  'Great dentist, very friendly staff and clean office.',
  'Waited over an hour past my appointment time. Unacceptable.',
  'Dr. Smith is thorough and explains everything clearly.',
  'Could never get anyone on the phone to reschedule.',
  'Love this place! Always a great experience with thorough care.',
];

/* ------------------------------------------------------------------ */
/*  Tests: structured pain signal extraction                           */
/* ------------------------------------------------------------------ */

describe('analyzeReviews — structured results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns structured pain signals from reviews', async () => {
    mockCallAI.mockResolvedValue(JSON.stringify(VALID_ANALYSIS));

    const result = await analyzeReviews(SAMPLE_REVIEWS);

    expect(result.sentimentSummary).toBe(VALID_ANALYSIS.sentimentSummary);
    expect(result.painSignals).toHaveLength(2);
    expect(result.painSignals[0]!.signal).toBe('long_wait');
    expect(result.painSignals[0]!.count).toBe(3);
    expect(result.painSignals[0]!.example).toBe('Waited over an hour past my appointment time');
    expect(result.positiveThemes).toEqual(['friendly staff', 'clean office', 'thorough care']);
    expect(result.totalAnalyzed).toBe(5);
  });

  it('correctly counts totalAnalyzed', async () => {
    const analysis: ReviewAnalysis = {
      ...VALID_ANALYSIS,
      totalAnalyzed: 2,
    };
    mockCallAI.mockResolvedValue(JSON.stringify(analysis));

    const result = await analyzeReviews(['Review one.', 'Review two.']);

    expect(result.totalAnalyzed).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: empty reviews                                               */
/* ------------------------------------------------------------------ */

describe('analyzeReviews — empty reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles empty reviews gracefully without calling AI', async () => {
    const result = await analyzeReviews([]);

    expect(result).toEqual({
      sentimentSummary: '',
      painSignals: [],
      positiveThemes: [],
      totalAnalyzed: 0,
    });
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: retry on malformed response                                 */
/* ------------------------------------------------------------------ */

describe('analyzeReviews — retry logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries on malformed AI response and succeeds on second attempt', async () => {
    mockCallAI
      .mockResolvedValueOnce('this is not valid JSON at all')
      .mockResolvedValueOnce(JSON.stringify(VALID_ANALYSIS));

    const result = await analyzeReviews(SAMPLE_REVIEWS);

    expect(mockCallAI).toHaveBeenCalledTimes(2);
    expect(result.sentimentSummary).toBe(VALID_ANALYSIS.sentimentSummary);
    expect(result.painSignals).toHaveLength(2);
  });

  it('falls back to empty analysis if both attempts return bad JSON', async () => {
    mockCallAI
      .mockResolvedValueOnce('```json\nnope\n```')
      .mockResolvedValueOnce('still broken {{{');

    const result = await analyzeReviews(SAMPLE_REVIEWS);

    expect(mockCallAI).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      sentimentSummary: '',
      painSignals: [],
      positiveThemes: [],
      totalAnalyzed: 0,
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: prompt correctness                                          */
/* ------------------------------------------------------------------ */

describe('analyzeReviews — prompt construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes correct system and user prompts to callAI', async () => {
    mockCallAI.mockResolvedValue(JSON.stringify(VALID_ANALYSIS));

    await analyzeReviews(['Amazing service!', 'Terrible wait.']);

    expect(mockCallAI).toHaveBeenCalledTimes(1);

    const callArgs = mockCallAI.mock.calls[0]![0] as {
      systemPrompt: string;
      userPrompt: string;
      json: boolean;
    };

    // System prompt should mention analyzing Google reviews
    expect(callArgs.systemPrompt).toContain('analyzing Google reviews');
    // System prompt should list pain signal types
    expect(callArgs.systemPrompt).toContain('slow_response');
    expect(callArgs.systemPrompt).toContain('hard_to_reach');

    // User prompt should include review count
    expect(callArgs.userPrompt).toContain('2 reviews');
    // User prompt should include the actual review text
    expect(callArgs.userPrompt).toContain('Amazing service!');
    expect(callArgs.userPrompt).toContain('Terrible wait.');

    // Should request JSON mode
    expect(callArgs.json).toBe(true);
  });

  it('includes stricter instruction in retry prompt', async () => {
    mockCallAI
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(JSON.stringify(VALID_ANALYSIS));

    await analyzeReviews(['A review.']);

    expect(mockCallAI).toHaveBeenCalledTimes(2);

    const retryArgs = mockCallAI.mock.calls[1]![0] as {
      systemPrompt: string;
      userPrompt: string;
      json: boolean;
    };

    expect(retryArgs.systemPrompt).toContain('IMPORTANT: Return ONLY the JSON object');
    expect(retryArgs.json).toBe(true);
  });
});
