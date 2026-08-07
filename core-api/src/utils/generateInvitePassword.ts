import crypto from 'crypto';

/**
 * Cryptographically random temporary password for staff / operator invites.
 * Always satisfies common complexity rules (upper, lower, digit, special).
 */
export function generateInvitePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;
  const size = Math.max(12, Math.min(64, length));

  const pick = (charset: string): string => charset[crypto.randomInt(charset.length)]!;
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: size - required.length }, () => pick(all));
  const combined = [...required, ...rest];

  for (let i = combined.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [combined[i], combined[j]] = [combined[j]!, combined[i]!];
  }

  return combined.join('');
}
