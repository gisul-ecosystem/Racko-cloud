/**
 * TrackerController — handles all agent-facing and admin-facing endpoints
 * for baseline, activity, file upload/download, and clone replay.
 */

import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Readable } from 'stream';
import * as trackerService from './tracker.service';
import { ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import type { AuthenticatedRequest } from '../../types';
import { cloneSessionEmitter } from './clone.events';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

export class TrackerController {

  // ─── Agent: Baseline ───────────────────────────────────────────────────────

  /**
   * POST /api/v1/agent/baseline
   * Agent posts the full baseline snapshot on first registration.
   * Authenticated by X-Agent-ID header (agent identity, not JWT).
   */
  async saveBaseline(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      if (!agentId) {
        throw new ValidationError('X-Agent-ID header is required.');
      }
      await trackerService.saveBaseline(agentId, req.body as Record<string, unknown>);
      success(res, 'Baseline saved.', undefined, 201);
    } catch (err) {
      next(err);
    }
  }

  // ─── Agent: Activity ───────────────────────────────────────────────────────

  /**
   * POST /api/v1/agent/activity
   * Agent posts a single activity event (file write, registry change, etc.)
   * Authenticated by X-Agent-ID header.
   */
  async appendActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      if (!agentId) {
        throw new ValidationError('X-Agent-ID header is required.');
      }

      const { type, payload, timestamp } = req.body as {
        type: string;
        payload: unknown;
        timestamp: string;
      };

      if (!type || !payload) {
        throw new ValidationError('type and payload are required.');
      }

      await trackerService.appendActivity(
        agentId,
        type as import('../../models/machineActivity.model').ActivityType,
        payload as import('../../models/machineActivity.model').ActivityPayload,
        timestamp ? new Date(timestamp) : new Date()
      );

      res.status(201).json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  // ─── Agent: File upload ────────────────────────────────────────────────────

  /**
   * GET /api/v1/agent/upload-url?sha256=<hash>&filename=<name>&mimeType=<type>
   * Returns a presigned S3 PUT URL so the agent can upload directly to SeaweedFS.
   * The agent PUTs the file directly to this URL, bypassing nginx entirely.
   * Authenticated by X-Agent-ID header.
   */
  async getUploadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      if (!agentId) {
        throw new ValidationError('X-Agent-ID header is required.');
      }

      const { sha256, filename, mimeType } = req.query as {
        sha256?: string;
        filename?: string;
        mimeType?: string;
      };

      if (!sha256 || !filename) {
        throw new ValidationError('sha256 and filename query parameters are required.');
      }

      const result = await trackerService.getPresignedUploadUrl(
        agentId,
        sha256,
        filename,
        mimeType ?? 'application/octet-stream'
      );

      success(res, 'Presigned upload URL generated.', result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/agent/file-upload  (multipart/form-data)
   * Agent streams a file to the server; server proxies it to SeaweedFS.
   * Returns the storageRef (fid) for the uploaded file.
   * Authenticated by X-Agent-ID header.
   *
   * Fields:
   *   agentId   — agent UUID (also in header, belt-and-suspenders)
   *   filePath  — original path on the VM
   *   file      — the file binary (form file field)
   */
  async uploadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      if (!agentId) {
        throw new ValidationError('X-Agent-ID header is required.');
      }

      // multer has already parsed the multipart and put the file in req.file
      const file = req.file;
      if (!file) {
        throw new ValidationError('No file received in upload.');
      }

      const filePath = (req.body as Record<string, string>)['filePath'] ?? file.originalname;
      const mimeType = file.mimetype || 'application/octet-stream';
      const sha256   = (req.body as Record<string, string>)['sha256'];

      // Convert the multer buffer to a Readable stream for the service layer
      const stream = Readable.from(file.buffer);

      const result = await trackerService.uploadFile(agentId, filePath, stream, mimeType, sha256);

      logger.info('[TrackerController] File uploaded', {
        agentId,
        filePath,
        storageRef: result.storageRef,
        sizeBytes:  result.sizeBytes,
      });

      success(res, 'File uploaded.', { storageRef: result.storageRef, sizeBytes: result.sizeBytes }, 201);
    } catch (err) {
      next(err);
    }
  }

  // ─── Agent: File download ──────────────────────────────────────────────────

  /**
   * GET /api/v1/agent/file-download?ref=<storageRef>
   * Used by the target agent during clone replay to fetch a file from SeaweedFS.
   * Authenticated by X-Agent-ID header.
   * Streams the file directly — no buffering in core-api.
   */
  async downloadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      if (!agentId) {
        throw new ValidationError('X-Agent-ID header is required.');
      }

      const storageRef = req.query['ref'] as string;
      if (!storageRef) {
        throw new ValidationError('ref query parameter is required.');
      }

      const { stream, contentType, contentLength } = await trackerService.downloadFile(
        storageRef,
        agentId
      );

      res.setHeader('Content-Type', contentType);
      if (contentLength !== null) {
        res.setHeader('Content-Length', contentLength);
      }

      // Pipe the SeaweedFS response stream directly to the HTTP response.
      // No full file buffering — works for files of any size.
      (stream as NodeJS.ReadableStream).pipe(res);

    } catch (err) {
      next(err);
    }
  }

  // ─── Agent: Clone manifest ─────────────────────────────────────────────────

  /**
   * GET /api/v1/agent/clone-manifest?sessionId=<id>&sourceMachineId=<id>
   * Target agent fetches the activity log manifest for the source machine.
   * Authenticated by X-Agent-ID header.
   */
  async getCloneManifest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      if (!agentId) {
        throw new ValidationError('X-Agent-ID header is required.');
      }

      const sessionId       = req.query['sessionId'] as string;
      const sourceMachineId = req.query['sourceMachineId'] as string;

      if (!sessionId || !sourceMachineId) {
        throw new ValidationError('sessionId and sourceMachineId are required.');
      }

      const manifest = await trackerService.getCloneManifest(sourceMachineId, sessionId, agentId);
      success(res, 'Clone manifest retrieved.', manifest as Record<string, unknown>);
    } catch (err) {
      next(err);
    }
  }

  // ─── Agent: Clone install ──────────────────────────────────────────────────

  /**
   * POST /api/v1/agent/clone-install
   * Target agent requests a software install job during clone replay.
   * Authenticated by X-Agent-ID header.
   */
  async cloneInstall(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = req.headers['x-agent-id'] as string;
      if (!agentId) {
        throw new ValidationError('X-Agent-ID header is required.');
      }

      const { softwareCatalogId } = req.body as { softwareCatalogId: string };
      if (!softwareCatalogId) {
        throw new ValidationError('softwareCatalogId is required.');
      }

      await trackerService.createCloneInstallJob(agentId, softwareCatalogId);
      res.status(201).json({ success: true, message: 'Install job queued.' });
    } catch (err) {
      next(err);
    }
  }

  // ─── Admin: Activity log ───────────────────────────────────────────────────

  /**
   * GET /api/v1/machines/:id/activity
   * Returns the full change log for a machine (requires JWT auth + ownership).
   */
  async getActivityLog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId   = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const machineId = new mongoose.Types.ObjectId(req.params['id'] as string);

      const activities = await trackerService.getActivityLog(machineId, adminId);
      success(res, 'Activity log retrieved.', { activities, total: activities.length });
    } catch (err) {
      next(err);
    }
  }

  // ─── Admin: Clone to another machine ──────────────────────────────────────

  /**
   * POST /api/v1/machines/:id/clone-to/:targetId
   * Triggers a clone replay from machine :id onto machine :targetId.
   * Both machines must be owned by the requesting admin.
   * Target machine's agent must be online.
   */
  async cloneTo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId         = new mongoose.Types.ObjectId((req as AuthenticatedRequest).user.userId);
      const sourceMachineId = new mongoose.Types.ObjectId(req.params['id'] as string);
      const targetMachineId = new mongoose.Types.ObjectId(req.params['targetId'] as string);

      const { v4: uuidv4 } = await import('uuid');
      const sessionId = uuidv4();

      const result = await trackerService.triggerCloneReplay(
        sourceMachineId,
        targetMachineId,
        adminId,
        sessionId
      );

      if (!result.accepted) {
        res.status(409).json({ success: false, message: result.reason ?? 'Clone could not be started.' });
        return;
      }

      success(res, 'Clone replay started.', { sessionId }, 202);
    } catch (err) {
      next(err);
    }
  }

  // ─── Admin: Clone stream ticket ────────────────────────────────────────────

  /**
   * POST /api/v1/machines/clone-stream-ticket
   * Issues a short-lived SSE stream ticket for a clone session.
   * Frontend polls this then opens the SSE stream using the ticket.
   */
  async issueCloneStreamTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.body as { sessionId: string };
      if (!sessionId) {
        throw new ValidationError('sessionId is required.');
      }
      const { createCloneStreamTicket } = await import('./clone.streamTicket');
      const ticket = createCloneStreamTicket(sessionId);
      success(res, 'Clone stream ticket issued.', { streamTicket: ticket, expiresInSeconds: 30 });
    } catch (err) {
      next(err);
    }
  }

  // ─── Admin: Clone SSE stream ───────────────────────────────────────────────

  /**
   * GET /api/v1/machines/clone-stream/:sessionId?ticket=<ticket>
   * SSE stream that relays clone_progress and clone_complete events from the
   * target agent back to the frontend.
   * Uses a short-lived single-use ticket so EventSource (no custom headers) can auth.
   */
  async streamCloneStatus(req: Request, res: Response): Promise<void> {
    const sessionId = req.params['sessionId'] as string;
    const ticket    = req.query['ticket'] as string;

    const { consumeCloneStreamTicket } = await import('./clone.streamTicket');
    const entry = consumeCloneStreamTicket(ticket);
    if (!entry || entry.sessionId !== sessionId) {
      res.status(401).json({ success: false, message: 'Invalid or expired stream ticket.' });
      return;
    }

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data: unknown): void => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const onEvent = (event: unknown): void => {
      send(event);
      const e = event as { type?: string; success?: boolean };
      if (e.type === 'clone_complete') {
        cloneSessionEmitter.off(sessionId, onEvent);
        res.end();
      }
    };

    cloneSessionEmitter.on(sessionId, onEvent);

    // Auto-cleanup if client disconnects
    req.on('close', () => {
      cloneSessionEmitter.off(sessionId, onEvent);
    });

    // Safety timeout — 30 minutes max for a clone session
    setTimeout(() => {
      cloneSessionEmitter.off(sessionId, onEvent);
      if (!res.writableEnded) res.end();
    }, 30 * 60 * 1000);
  }
}

export const trackerController = new TrackerController();
