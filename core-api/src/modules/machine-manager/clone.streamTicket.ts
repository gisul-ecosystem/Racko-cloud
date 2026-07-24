import crypto from 'crypto';

interface CloneStreamTicketEntry {
  sessionId: string;
  expiresAt: number;
}

// In-memory single-use ticket store — 30-second TTL
const store = new Map<string, CloneStreamTicketEntry>();
const TTL_MS = 30 * 1000;

export function createCloneStreamTicket(sessionId: string): string {
  const ticket = crypto.randomBytes(32).toString('hex');
  store.set(ticket, { sessionId, expiresAt: Date.now() + TTL_MS });
  setTimeout(() => store.delete(ticket), TTL_MS + 1000);
  return ticket;
}

export function consumeCloneStreamTicket(ticket: string): CloneStreamTicketEntry | null {
  const entry = store.get(ticket);
  if (!entry) return null;
  store.delete(ticket); // single-use
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}
