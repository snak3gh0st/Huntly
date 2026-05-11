import { customAlphabet } from 'nanoid';

const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz';
const shortId = customAlphabet(ALPHA, 6);

export function makeSlug(businessName: string): string {
  const base = businessName.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${base || 'site'}-${shortId()}`;
}

export function makeToken(): string {
  return customAlphabet(ALPHA, 24)();
}
