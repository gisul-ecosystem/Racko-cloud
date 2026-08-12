import { randomBytes } from 'crypto';

const TICKET_TTL_MS = 15 * 60_000; // 15 minutes — covers full reset duration including reconnects

interface ResetStreamTicket {
  sessionId: string;
  userId: string;
  expiresAt: number;
}

const tickets = new Map<string, ResetStreamTicket>();

export function issueResetStreamTicket(
  sessionId: string,
  userId: string
): { streamToken: string; expiresIn: number } {
  const streamToken = randomBytes(32).toString('hex');
  tickets.set(streamToken, { sessionId, userId, expiresAt: Date.now() + TICKET_TTL_MS });
  return { streamToken, expiresIn: TICKET_TTL_MS / 1000 };
}

export function consumeResetStreamTicket(
  streamToken: string,
  sessionId: string
): ResetStreamTicket | null {
  const ticket = tickets.get(streamToken);
  if (!ticket) return null;
  if (ticket.expiresAt < Date.now()) { tickets.delete(streamToken); return null; }
  if (ticket.sessionId !== sessionId) return null;
  // Not deleted — reusable within TTL to support reconnect on network drops.
  // Ticket expires naturally after TICKET_TTL_MS via the cleanup interval.
  return ticket;
}

// Cleanup expired tickets every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, ticket] of tickets) {
    if (ticket.expiresAt < now) tickets.delete(key);
  }
}, 60_000).unref();
