import { EventEmitter } from 'events';
import type { AdminVmTemplateBuildStep } from './adminVmTemplate.model';
import { logger } from '../../utils/logger';

export interface TemplateBuildEvent {
  buildStep: AdminVmTemplateBuildStep;
  status: 'creating' | 'ready' | 'failed';
  errorMessage?: string;
}

/**
 * In-process event bus for template build progress.
 * Keyed by templateId (MongoDB ObjectId string).
 * The service emits events; the SSE controller subscribes and forwards to the client.
 */
class TemplateBuildEmitter extends EventEmitter {}

export const templateBuildEmitter = new TemplateBuildEmitter();

// Prevent memory leak warning — one SSE listener per in-flight template, max ~50 concurrent
templateBuildEmitter.setMaxListeners(100);

export function emitTemplateBuildEvent(templateId: string, event: TemplateBuildEvent): void {
  const listenerCount = templateBuildEmitter.listenerCount(templateId);
  logger.info('[SSE][Emitter] Emitting build event', {
    templateId,
    buildStep: event.buildStep,
    status: event.status,
    listenerCount,
  });
  templateBuildEmitter.emit(templateId, event);
}
