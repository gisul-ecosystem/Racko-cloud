import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

// ─── Clone session SSE event types ────────────────────────────────────────────
// clone_progress — a phase of the clone replay is running on the target agent
// clone_complete — the clone replay finished (success or failure)

export type CloneEventType = 'clone_progress' | 'clone_complete';

export interface CloneSessionEvent {
  type: CloneEventType;
  machineId: string;      // target machine ID
  phase?: number;         // clone_progress: current phase (0-6)
  message?: string;       // clone_progress: human-readable description
  success?: boolean;      // clone_complete only
  error?: string;         // clone_complete only (on failure)
}

class CloneSessionEmitter extends EventEmitter {}

export const cloneSessionEmitter = new CloneSessionEmitter();

// Allow up to 200 concurrent clone sessions
cloneSessionEmitter.setMaxListeners(200);

export function emitCloneEvent(sessionId: string, event: CloneSessionEvent): void {
  const listenerCount = cloneSessionEmitter.listenerCount(sessionId);
  logger.info('[SSE][Clone] Emitting clone event', {
    sessionId,
    type: event.type,
    machineId: event.machineId,
    phase: event.phase,
    success: event.success,
    activeListeners: listenerCount,
    willBeDropped: listenerCount === 0,
    timestamp: new Date().toISOString(),
  });
  if (listenerCount === 0) {
    logger.warn('[SSE][Clone] NO LISTENERS — event will be dropped (stream not open or already closed)', {
      sessionId,
      type: event.type,
    });
  }
  cloneSessionEmitter.emit(sessionId, event);
}
