import { randomBytes } from 'crypto';
import type { UserRole } from '../../types';

/** Time allowed to open an SSE connection with the ticket (not max build duration). */
const STREAM_TICKET_TTL_MS = 120_000;

interface StreamTicket {
  templateId: string;
  userId: string;
  role: UserRole;
  expiresAt: number;
}

const tickets = new Map<string, StreamTicket>();

export function issueStreamTicket(
  templateId: string,
  userId: string,
  role: UserRole
): { streamToken: string; expiresIn: number } {
  const streamToken = randomBytes(32).toString('hex');
  tickets.set(streamToken, {
    templateId,
    userId,
    role,
    expiresAt: Date.now() + STREAM_TICKET_TTL_MS,
  });
  return { streamToken, expiresIn: STREAM_TICKET_TTL_MS / 1000 };
}

/** Validates and consumes a single-use ticket scoped to one template stream. */
export function consumeStreamTicket(streamToken: string, templateId: string): StreamTicket | null {
  const ticket = tickets.get(streamToken);
  if (!ticket) return null;
  if (ticket.expiresAt < Date.now()) {
    tickets.delete(streamToken);
    return null;
  }
  if (ticket.templateId !== templateId) return null;

  tickets.delete(streamToken);
  return ticket;
}

// Evict expired tickets periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, ticket] of tickets) {
    if (ticket.expiresAt < now) tickets.delete(key);
  }
}, 60_000).unref();
