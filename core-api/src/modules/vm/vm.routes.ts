import { Router } from 'express';
import { vmController } from './vm.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createVMSchema,
  vmIdParamSchema,
  jobIdParamSchema,
  templateIdParamSchema,
  vmListQuerySchema,
  vmConsoleSchema,
} from './vm.validation';

const router = Router();

// All VM routes require authentication
router.use(requireAuth);

// ─── Template routes ──────────────────────────────────────────────────────────

// GET /api/v1/vms/templates
router.get(
  '/templates',
  requireRole('admin', 'super_admin'),
  (req, res, next) => vmController.getTemplates(req, res, next)
);

// GET /api/v1/vms/templates/:templateId
router.get(
  '/templates/:templateId',
  requireRole('admin', 'super_admin'),
  validateRequest(templateIdParamSchema),
  (req, res, next) => vmController.getTemplateDetails(req, res, next)
);

// ─── Super admin only routes ──────────────────────────────────────────────────
// These must be defined BEFORE /:vmId routes to avoid param conflicts

// GET /api/v1/vms/admin/all
router.get(
  '/admin/all',
  requireRole('super_admin'),
  validateRequest(vmListQuerySchema),
  (req, res, next) => vmController.getAllVMsAdmin(req, res, next)
);

// GET /api/v1/vms/admin/alerts — handled in proxmox routes (see proxmox.routes.ts)
// GET /api/v1/vms/admin/alerts/history — handled in proxmox routes

// ─── Job routes ───────────────────────────────────────────────────────────────

// GET /api/v1/vms/jobs — list all jobs for this admin
router.get(
  '/jobs',
  requireRole('admin', 'super_admin'),
  (req, res, next) => vmController.listJobs(req, res, next)
);

// GET /api/v1/vms/jobs/:jobId
router.get(
  '/jobs/:jobId',
  requireRole('admin', 'super_admin'),
  validateRequest(jobIdParamSchema),
  (req, res, next) => vmController.getJobStatus(req, res, next)
);

// ─── VM collection routes ─────────────────────────────────────────────────────

// POST /api/v1/vms — create VM(s)
router.post(
  '/',
  requireRole('admin', 'super_admin'),
  validateRequest(createVMSchema),
  (req, res, next) => vmController.createVM(req, res, next)
);

// GET /api/v1/vms — list my VMs
router.get(
  '/',
  requireRole('admin', 'super_admin'),
  validateRequest(vmListQuerySchema),
  (req, res, next) => vmController.getMyVMs(req, res, next)
);

// ─── VM instance routes ───────────────────────────────────────────────────────

// GET /api/v1/vms/:vmId
router.get(
  '/:vmId',
  requireRole('admin', 'super_admin'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => vmController.getVMDetails(req, res, next)
);

// GET /api/v1/vms/:vmId/status
router.get(
  '/:vmId/status',
  requireRole('admin', 'super_admin'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => vmController.getVMStatus(req, res, next)
);

// GET /api/v1/vms/:vmId/events
router.get(
  '/:vmId/events',
  requireRole('admin', 'super_admin'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => vmController.getVMEvents(req, res, next)
);

// GET /api/v1/vms/:vmId/console
router.get(
  '/:vmId/console',
  requireRole('admin', 'super_admin'),
  validateRequest(vmConsoleSchema),
  (req, res, next) => vmController.openConsole(req, res, next)
);

// DELETE /api/v1/vms/:vmId
router.delete(
  '/:vmId',
  requireRole('admin', 'super_admin'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => vmController.deleteVM(req, res, next)
);

// POST /api/v1/vms/:vmId/start
router.post(
  '/:vmId/start',
  requireRole('admin', 'super_admin'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => vmController.startVM(req, res, next)
);

// POST /api/v1/vms/:vmId/stop
router.post(
  '/:vmId/stop',
  requireRole('admin', 'super_admin'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => vmController.stopVM(req, res, next)
);

// POST /api/v1/vms/:vmId/force-stop
router.post(
  '/:vmId/force-stop',
  requireRole('admin', 'super_admin'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => vmController.forceStopVM(req, res, next)
);

// POST /api/v1/vms/:vmId/restart
router.post(
  '/:vmId/restart',
  requireRole('admin', 'super_admin'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => vmController.restartVM(req, res, next)
);

// POST /api/v1/vms/:vmId/reset
router.post(
  '/:vmId/reset',
  requireRole('admin', 'super_admin'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => vmController.resetVM(req, res, next)
);

export default router;
