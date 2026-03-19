import crypto from 'node:crypto';

export function generateToken(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}
