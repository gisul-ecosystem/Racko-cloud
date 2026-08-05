import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

// ─── Reset session SSE event types ────────────────────────────────────────────
// reset_progress — a phase of the reset script has started on the agent
// reset_complete — the reset script finished (success or failure)

export type ResetEventType = 'reset_progress' | 'reset_complete';

export interface ResetSessionEvent {
  type: ResetEventType;
  machineId: string;
  machineName?: string;
  phase?: number;       // reset_progress: current phase number (1-14)
  message?: string;     // reset_progress: human-readable phase description
  success?: boolean;    // reset_complete only
  error?: string;       // reset_complete only (on failure)
}

class ResetSessionEmitter extends EventEmitter {}

export const resetSessionEmitter = new ResetSessionEmitter();

// Allow up to 200 concurrent reset sessions
resetSessionEmitter.setMaxListeners(200);

export function emitResetEvent(sessionId: string, event: ResetSessionEvent): void {
  const listenerCount = resetSessionEmitter.listenerCount(sessionId);
  logger.info('[SSE][Reset] Emitting reset event', {
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
    logger.warn('[SSE][Reset] NO LISTENERS — event will be dropped (stream not open or already closed)', {
      sessionId,
      type: event.type,
    });
  }
  resetSessionEmitter.emit(sessionId, event);
}
