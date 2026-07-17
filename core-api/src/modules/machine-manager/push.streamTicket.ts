import { randomBytes } from 'crypto';

const TICKET_TTL_MS = 120_000; // 2 minutes — enough to open the SSE stream

interface PushStreamTicket {
  sessionId: string;
  userId: string;
  expiresAt: number;
}

const tickets = new Map<string, PushStreamTicket>();

export function issuePushStreamTicket(
  sessionId: string,
  userId: string
): { streamToken: string; expiresIn: number } {
  const streamToken = randomBytes(32).toString('hex');
  tickets.set(streamToken, { sessionId, userId, expiresAt: Date.now() + TICKET_TTL_MS });
  return { streamToken, expiresIn: TICKET_TTL_MS / 1000 };
}

export function consumePushStreamTicket(
  streamToken: string,
  sessionId: string
): PushStreamTicket | null {
  const ticket = tickets.get(streamToken);
  if (!ticket) return null;
  if (ticket.expiresAt < Date.now()) { tickets.delete(streamToken); return null; }
  if (ticket.sessionId !== sessionId) return null;
  tickets.delete(streamToken); // single-use
  return ticket;
}

// Cleanup expired tickets every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, ticket] of tickets) {
    if (ticket.expiresAt < now) tickets.delete(key);
  }
}, 60_000).unref();
