import { randomBytes } from 'crypto';

const STREAM_TICKET_TTL_MS = 120_000;

interface JobStreamTicket {
  jobId: string;
  userId: string;
  expiresAt: number;
}

const tickets = new Map<string, JobStreamTicket>();

export function issueJobStreamTicket(
  jobId: string,
  userId: string
): { streamToken: string; expiresIn: number } {
  const streamToken = randomBytes(32).toString('hex');
  tickets.set(streamToken, { jobId, userId, expiresAt: Date.now() + STREAM_TICKET_TTL_MS });
  return { streamToken, expiresIn: STREAM_TICKET_TTL_MS / 1000 };
}

export function consumeJobStreamTicket(streamToken: string, jobId: string): JobStreamTicket | null {
  const ticket = tickets.get(streamToken);
  if (!ticket) return null;
  if (ticket.expiresAt < Date.now()) { tickets.delete(streamToken); return null; }
  if (ticket.jobId !== jobId) return null;
  tickets.delete(streamToken);
  return ticket;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, ticket] of tickets) {
    if (ticket.expiresAt < now) tickets.delete(key);
  }
}, 60_000).unref();
