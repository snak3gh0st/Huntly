import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMessagesCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: mockMessagesCreate } };
  }),
}));

vi.mock('../../src/config.js', () => ({
  env: { ANTHROPIC_API_KEY: 'test-anthropic-key' },
}));

import { callAIWithProvider } from '../../src/lib/ai.js';

describe('callAIWithProvider — anthropic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Anthropic Messages API with system and user prompts', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"ok":true}' }],
    });

    const result = await callAIWithProvider('anthropic', {
      systemPrompt: 'You are a helper.',
      userPrompt: 'Say hi.',
      json: true,
    });

    expect(result).toBe('{"ok":true}');
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        system: 'You are a helper.',
        messages: [{ role: 'user', content: expect.stringContaining('Say hi.') }],
      }),
    );
  });

  it('throws when content is empty in JSON mode', async () => {
    mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: '' }] });

    await expect(
      callAIWithProvider('anthropic', {
        systemPrompt: 's',
        userPrompt: 'u',
        json: true,
      }),
    ).rejects.toThrow(/empty response/i);
  });
});
