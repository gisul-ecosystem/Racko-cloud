import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

// ─── Push session SSE event types ─────────────────────────────────────────────
// push_result  — WinRM/SSH completed (success or failure) for one VM
// agent_connected — agent sent first heartbeat / connected via WS
// done — all VMs have a terminal status (push_result received for all)

export type PushEventType = 'push_result' | 'agent_connected' | 'done';

export interface PushSessionEvent {
  type: PushEventType;
  machineId: string;
  success?: boolean;      // push_result only
  error?: string;         // push_result only (on failure)
  machineName?: string;   // agent_connected only
}

class PushSessionEmitter extends EventEmitter {}

export const pushSessionEmitter = new PushSessionEmitter();

// One SSE listener per active push session — allow up to 200 concurrent sessions
pushSessionEmitter.setMaxListeners(200);

export function emitPushEvent(sessionId: string, event: PushSessionEvent): void {
  const listenerCount = pushSessionEmitter.listenerCount(sessionId);
  logger.info('[SSE][Push] Emitting push event', {
    sessionId,
    type: event.type,
    machineId: event.machineId,
    success: event.success,
    activeListeners: listenerCount,
    willBeDropped: listenerCount === 0,
    timestamp: new Date().toISOString(),
  });
  if (listenerCount === 0) {
    logger.warn('[SSE][Push] NO LISTENERS on session — event will be LOST (SSE stream not yet open or already closed)', {
      sessionId,
      type: event.type,
      machineId: event.machineId,
    });
  }
  pushSessionEmitter.emit(sessionId, event);
}
