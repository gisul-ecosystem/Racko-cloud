import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

// ─── Push session SSE event types ─────────────────────────────────────────────
// push_result       — WinRM/SSH completed (success or failure) for one VM
// agent_connected   — agent sent first heartbeat / connected via WS
// racko_app_installed — racko-app GUI setup completed (success or failure) via exec
// done              — all VMs have a terminal status (push_result received for all)

export type PushEventType = 'push_result' | 'agent_connected' | 'racko_app_installed' | 'done';

export interface PushSessionEvent {
  type: PushEventType;
  machineId: string;
  success?: boolean;           // push_result / racko_app_installed only
  error?: string;              // push_result / racko_app_installed only (on failure)
  machineName?: string;        // agent_connected only
}

class PushSessionEmitter extends EventEmitter {}

export const pushSessionEmitter = new PushSessionEmitter();

// One SSE listener per active push session — allow up to 200 concurrent sessions
pushSessionEmitter.setMaxListeners(200);

export function emitPushEvent(sessionId: string, event: PushSessionEvent): void {
  logger.info('[SSE][Push] Emitting push event', {
    sessionId,
    type: event.type,
    machineId: event.machineId,
    success: event.success,
  });
  pushSessionEmitter.emit(sessionId, event);
}
