import crypto from 'crypto';

export function generatePassword(length = 16) {
  const base = crypto.randomBytes(Math.max(length, 12)).toString('base64url');
  return `Rk!${base.slice(0, Math.max(length - 3, 8))}9a`;
}
