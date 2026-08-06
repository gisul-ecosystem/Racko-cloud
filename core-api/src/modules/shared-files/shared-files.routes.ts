import { Router } from 'express';
import { sharedFilesController } from './shared-files.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireAgentAuth } from '../../middleware/requireAgentAuth.middleware';
import { requireRoleOrPermission } from '../../middleware/requirePermission.middleware';
import { agentFileUpload } from '../../middleware/agentFileUpload.middleware';

// ─── Agent routes (X-Agent-ID auth) ──────────────────────────────────────────
export const agentSharedFilesRouter = Router();

// POST /api/v1/agent/shared-files — upload file from GUI app
agentSharedFilesRouter.post(
  '/',
  requireAgentAuth,
  agentFileUpload.single('file'),
  (req, res, next) => sharedFilesController.agentUpload(req, res, next),
);

// GET /api/v1/agent/shared-files/inbox — files shared with this machine
agentSharedFilesRouter.get(
  '/inbox',
  requireAgentAuth,
  (req, res, next) => sharedFilesController.agentListInbox(req, res, next),
);

// GET /api/v1/agent/shared-files/outbox — files uploaded by this machine
agentSharedFilesRouter.get(
  '/outbox',
  requireAgentAuth,
  (req, res, next) => sharedFilesController.agentListOutbox(req, res, next),
);

// GET /api/v1/agent/machines-for-app — other VMs for the GUI app's VM selector
agentSharedFilesRouter.get(
  '/machines-for-app',
  requireAgentAuth,
  (req, res, next) => sharedFilesController.agentListMachines(req, res, next),
);

// GET /api/v1/agent/shared-files/:id/download
agentSharedFilesRouter.get(
  '/:id/download',
  requireAgentAuth,
  (req, res, next) => sharedFilesController.agentDownload(req, res, next),
);

// PATCH /api/v1/agent/shared-files/:id — update permission / target VMs
agentSharedFilesRouter.patch(
  '/:id',
  requireAgentAuth,
  (req, res, next) => sharedFilesController.agentUpdate(req, res, next),
);

// DELETE /api/v1/agent/shared-files/:id
agentSharedFilesRouter.delete(
  '/:id',
  requireAgentAuth,
  (req, res, next) => sharedFilesController.agentDelete(req, res, next),
);

// ─── Admin portal routes (JWT auth) ──────────────────────────────────────────
export const adminSharedFilesRouter = Router();

adminSharedFilesRouter.use(requireAuth);
adminSharedFilesRouter.use(requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'));

// GET /api/v1/shared-files
adminSharedFilesRouter.get(
  '/',
  (req, res, next) => sharedFilesController.adminList(req, res, next),
);

// GET /api/v1/shared-files/:id/download
adminSharedFilesRouter.get(
  '/:id/download',
  (req, res, next) => sharedFilesController.adminDownload(req, res, next),
);

// DELETE /api/v1/shared-files/:id
adminSharedFilesRouter.delete(
  '/:id',
  (req, res, next) => sharedFilesController.adminDelete(req, res, next),
);
