import { Router } from 'express';
import express from 'express';
import { machineManagerController } from './machine-manager.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createMachineSchema,
  bulkCreateMachineSchema,
  machineIdParamSchema,
  createJobSchema,
  jobIdParamSchema,
  agentRegisterSchema,
  agentEnrollSchema,
  pushAgentSchema,
  agentIdParamSchema,
  agentJobResultSchema,
  agentHeartbeatSchema,
} from './machine-manager.validation';

const machineRouter = Router();
const agentRouter = Router();

// ─── PUBLIC machine routes (no auth — token validated internally) ─────────────

// GET /api/v1/machines/download-agent?dt=<token>
machineRouter.get(
  '/download-agent',
  (req, res, next) => machineManagerController.redeemDownloadToken(req, res, next)
);

// ─── Machine routes (authenticated) ──────────────────────────────────────────

// SSE stream — must come BEFORE requireAuth middleware.
// EventSource cannot set Authorization headers; auth uses a short-lived
// single-use ?streamToken= ticket issued by POST /jobs/:id/stream-ticket.
machineRouter.get(
  '/jobs/:id/stream',
  (req, res) => void machineManagerController.streamJobStatus(req, res)
);

machineRouter.use(requireAuth);

// POST /api/v1/machines/bulk — must come before /:id to avoid collision
machineRouter.post(
  '/bulk',
  requireRole('admin', 'super_admin'),
  validateRequest(bulkCreateMachineSchema),
  (req, res, next) => machineManagerController.bulkCreate(req, res, next)
);

// POST /api/v1/machines/push-agent — VM push flow (must come before /:id)
machineRouter.post(
  '/push-agent',
  requireRole('admin', 'super_admin'),
  validateRequest(pushAgentSchema),
  (req, res, next) => machineManagerController.pushAgent(req, res, next)
);

// POST /api/v1/machines/jobs — must come before /:id
machineRouter.post(
  '/jobs',
  requireRole('admin', 'super_admin'),
  validateRequest(createJobSchema),
  (req, res, next) => machineManagerController.createJob(req, res, next)
);

// GET /api/v1/machines/jobs — must come before /:id
machineRouter.get(
  '/jobs',
  requireRole('admin', 'super_admin'),
  (req, res, next) => machineManagerController.listJobs(req, res, next)
);

// POST /api/v1/machines/jobs/:id/stream-ticket — issue SSE stream ticket
machineRouter.post(
  '/jobs/:id/stream-ticket',
  requireAuth,
  requireRole('admin', 'super_admin'),
  (req, res, next) => machineManagerController.issueJobStreamTicket(req, res, next)
);

// GET /api/v1/machines/jobs/:id
machineRouter.get(
  '/jobs/:id',
  requireRole('admin', 'super_admin'),
  validateRequest(jobIdParamSchema),
  (req, res, next) => machineManagerController.getJob(req, res, next)
);

// POST /api/v1/machines
machineRouter.post(
  '/',
  requireRole('admin', 'super_admin'),
  validateRequest(createMachineSchema),
  (req, res, next) => machineManagerController.create(req, res, next)
);

// GET /api/v1/machines
machineRouter.get(
  '/',
  requireRole('admin', 'super_admin'),
  (req, res, next) => machineManagerController.list(req, res, next)
);

// GET /api/v1/machines/:id
machineRouter.get(
  '/:id',
  requireRole('admin', 'super_admin'),
  validateRequest(machineIdParamSchema),
  (req, res, next) => machineManagerController.getOne(req, res, next)
);

// POST /api/v1/machines/:id/download-agent/token — authenticated, issues short-lived token
machineRouter.post(
  '/:id/download-agent/token',
  requireRole('admin', 'super_admin'),
  validateRequest(machineIdParamSchema),
  (req, res, next) => machineManagerController.issueDownloadToken(req, res, next)
);

// GET /api/v1/machines/:id/download-agent — kept for internal use
machineRouter.get(
  '/:id/download-agent',
  requireRole('admin', 'super_admin'),
  validateRequest(machineIdParamSchema),
  (req, res, next) => machineManagerController.downloadAgent(req, res, next)
);

// DELETE /api/v1/machines/:id
machineRouter.delete(
  '/:id',
  requireRole('admin', 'super_admin'),
  validateRequest(machineIdParamSchema),
  (req, res, next) => machineManagerController.remove(req, res, next)
);

// ─── Agent routes (no JWT auth — uses accountToken in body) ──────────────────

// GET /api/v1/agent/install/linux?token=<accountToken> — serves shell install script (public)
agentRouter.get(
  '/install/linux',
  (req, res, next) => machineManagerController.serveLinuxInstallScript(req, res, next)
);

// GET /api/v1/agent/binary/:os — serves pre-built agent binary (public, no auth)
agentRouter.get(
  '/binary/:os',
  (req, res, next) => machineManagerController.serveBinary(req, res, next)
);

// POST /api/v1/agent/enroll — VM Template enrollment (no JWT, uses enrollmentKey)
agentRouter.post(
  '/enroll',
  validateRequest(agentEnrollSchema),
  (req, res, next) => machineManagerController.agentEnroll(req, res, next)
);

// POST /api/v1/agent/register
agentRouter.post(
  '/register',
  validateRequest(agentRegisterSchema),
  (req, res, next) => machineManagerController.agentRegister(req, res, next)
);

// GET /api/v1/agent/jobs/:agentId
agentRouter.get(
  '/jobs/:agentId',
  validateRequest(agentIdParamSchema),
  (req, res, next) => machineManagerController.agentGetJob(req, res, next)
);

// POST /api/v1/agent/jobs/:jobId/result
// Larger body limit — install logs can be verbose (MySQL, Docker etc).
// Agent truncates to 50KB before sending; this 5MB limit is a safety net.
agentRouter.post(
  '/jobs/:jobId/result',
  express.json({ limit: '5mb' }),
  validateRequest(agentJobResultSchema),
  (req, res, next) => machineManagerController.agentJobResult(req, res, next)
);

// POST /api/v1/agent/heartbeat
agentRouter.post(
  '/heartbeat',
  validateRequest(agentHeartbeatSchema),
  (req, res, next) => machineManagerController.agentHeartbeat(req, res, next)
);

// GET /api/v1/agent/software-catalog/:id
// Agent fetches full software record (install method, fileUrl, package IDs) without JWT.
// The agentId in the query param is validated against the machines collection for basic auth.
agentRouter.get(
  '/software-catalog/:id',
  (req, res, next) => machineManagerController.agentGetSoftware(req, res, next)
);

export { machineRouter, agentRouter };
