/**
 * Escape a string for safe insertion into HTML text or attribute context.
 * Ampersand MUST be escaped first; otherwise it would double-escape entities.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
