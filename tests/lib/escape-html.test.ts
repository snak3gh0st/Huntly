import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../src/lib/escape-html.js';

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapes double and single quotes', () => {
    expect(escapeHtml(`"hi" 'there'`)).toBe('&quot;hi&quot; &#39;there&#39;');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes ampersand before other entities (correct order)', () => {
    expect(escapeHtml('a&<b')).toBe('a&amp;&lt;b');
  });
});
