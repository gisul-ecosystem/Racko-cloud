import { Router } from 'express';
import express from 'express';
import { machineManagerController } from './machine-manager.controller';
import { trackerController } from './tracker.controller';
import { agentFileUpload } from '../../middleware/agentFileUpload.middleware';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireAgentAuth } from '../../middleware/requireAgentAuth.middleware';
import { requireRoleOrPermission } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createMachineSchema,
  bulkCreateMachineSchema,
  bulkDeleteMachineSchema,
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

// GET /api/v1/machines/push-stream/:sessionId — SSE stream for push status (before requireAuth)
machineRouter.get(
  '/push-stream/:sessionId',
  (req, res) => void machineManagerController.streamPushStatus(req, res)
);

// GET /api/v1/machines/reset-stream/:sessionId — SSE stream for reset status (before requireAuth)
machineRouter.get(
  '/reset-stream/:sessionId',
  (req, res) => void machineManagerController.streamResetStatus(req, res)
);

// GET /api/v1/machines/clone-stream/:sessionId — SSE stream for clone replay status (before requireAuth)
// Uses short-lived ticket for auth (EventSource cannot send Authorization headers)
machineRouter.get(
  '/clone-stream/:sessionId',
  (req, res) => void trackerController.streamCloneStatus(req, res)
);

machineRouter.use(requireAuth);

// POST /api/v1/machines/bulk — must come before /:id to avoid collision
machineRouter.post(
  '/bulk',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  validateRequest(bulkCreateMachineSchema),
  (req, res, next) => machineManagerController.bulkCreate(req, res, next)
);

// DELETE /api/v1/machines/bulk — must come before /:id to avoid collision
machineRouter.delete(
  '/bulk',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  validateRequest(bulkDeleteMachineSchema),
  (req, res, next) => machineManagerController.bulkRemove(req, res, next)
);

// GET /api/v1/machines/push-session/:sessionId — recover push session state after refresh
machineRouter.get(
  '/push-session/:sessionId',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  (req, res, next) => machineManagerController.getPushSession(req, res, next)
);

// POST /api/v1/machines/push-agent — VM push flow (must come before /:id)
machineRouter.post(
  '/push-agent',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  validateRequest(pushAgentSchema),
  (req, res, next) => machineManagerController.pushAgent(req, res, next)
);

// POST /api/v1/machines/push-stream-ticket — issue SSE ticket for push session
machineRouter.post(
  '/push-stream-ticket',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  (req, res, next) => machineManagerController.issuePushStreamTicket(req, res, next)
);

// POST /api/v1/machines/reset — initiate VM reset on one or more machines (must come before /:id)
machineRouter.post(
  '/reset',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  (req, res, next) => machineManagerController.resetMachines(req, res, next)
);

// POST /api/v1/machines/reset-stream-ticket — issue SSE stream ticket for reset session
machineRouter.post(
  '/reset-stream-ticket',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  (req, res, next) => machineManagerController.issueResetStreamTicket(req, res, next)
);

// PATCH /api/v1/machines/tracking — enable/disable tracking on selected machines (must come before /:id)
machineRouter.patch(
  '/tracking',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  (req, res, next) => machineManagerController.setTracking(req, res, next)
);

// POST /api/v1/machines/jobs — must come before /:id
machineRouter.post(
  '/jobs',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  validateRequest(createJobSchema),
  (req, res, next) => machineManagerController.createJob(req, res, next)
);

// GET /api/v1/machines/jobs — must come before /:id
machineRouter.get(
  '/jobs',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  (req, res, next) => machineManagerController.listJobs(req, res, next)
);

// POST /api/v1/machines/jobs/:id/stream-ticket — issue SSE stream ticket
machineRouter.post(
  '/jobs/:id/stream-ticket',
  requireAuth,
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  (req, res, next) => machineManagerController.issueJobStreamTicket(req, res, next)
);

// GET /api/v1/machines/jobs/:id
machineRouter.get(
  '/jobs/:id',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  validateRequest(jobIdParamSchema),
  (req, res, next) => machineManagerController.getJob(req, res, next)
);

// POST /api/v1/machines
machineRouter.post(
  '/',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  validateRequest(createMachineSchema),
  (req, res, next) => machineManagerController.create(req, res, next)
);

// GET /api/v1/machines
machineRouter.get(
  '/',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  (req, res, next) => machineManagerController.list(req, res, next)
);

// GET /api/v1/machines/:id
machineRouter.get(
  '/:id',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  validateRequest(machineIdParamSchema),
  (req, res, next) => machineManagerController.getOne(req, res, next)
);

// POST /api/v1/machines/:id/download-agent/token — authenticated, issues short-lived token
machineRouter.post(
  '/:id/download-agent/token',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  validateRequest(machineIdParamSchema),
  (req, res, next) => machineManagerController.issueDownloadToken(req, res, next)
);

// GET /api/v1/machines/:id/download-agent — kept for internal use
machineRouter.get(
  '/:id/download-agent',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  validateRequest(machineIdParamSchema),
  (req, res, next) => machineManagerController.downloadAgent(req, res, next)
);

// DELETE /api/v1/machines/:id
machineRouter.delete(
  '/:id',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  validateRequest(machineIdParamSchema),
  (req, res, next) => machineManagerController.remove(req, res, next)
);

// POST /api/v1/machines/:id/exec — run a PowerShell command on the machine via WebSocket
machineRouter.post(
  '/:id/exec',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  validateRequest(machineIdParamSchema),
  (req, res, next) => machineManagerController.execCommand(req, res, next)
);

// ─── Tracker / Clone routes (authenticated admin) ─────────────────────────────

// GET /api/v1/machines/:id/activity — full change log for a machine
machineRouter.get(
  '/:id/activity',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  (req, res, next) => trackerController.getActivityLog(req, res, next)
);

// POST /api/v1/machines/:id/clone-to/:targetId — trigger clone replay on target machine
machineRouter.post(
  '/:id/clone-to/:targetId',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  (req, res, next) => trackerController.cloneTo(req, res, next)
);

// POST /api/v1/machines/clone-stream-ticket — issue SSE stream ticket (must be before /:id)
machineRouter.post(
  '/clone-stream-ticket',
  requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'),
  (req, res, next) => trackerController.issueCloneStreamTicket(req, res, next)
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

// GET /api/v1/agent/reset-script — serves the VM reset PowerShell script (public, no auth)
// Agent downloads and runs this with -File flag at reset time.
// Script lives in agent/scripts/reset.ps1 — update it without rebuilding the agent.
agentRouter.get(
  '/reset-script',
  (req, res, next) => machineManagerController.serveResetScript(req, res, next)
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

// POST /api/v1/agent/reset-result — agent reports reset outcome via HTTP (authoritative path)
// Works even when the WebSocket was dropped during a long reset.
// Auth: X-Agent-ID header (same as other agent routes — no JWT required).
agentRouter.post(
  '/reset-result',
  requireAgentAuth,
  (req, res, next) => machineManagerController.agentResetResult(req, res, next)
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

// ─── Tracker agent routes (authenticated by X-Agent-ID header) ────────────────

// POST /api/v1/agent/baseline — agent posts baseline snapshot (chunked, 2MB per chunk)
// Large body limit: baseline file list can be thousands of entries.
agentRouter.post(
  '/baseline',
  requireAgentAuth,
  express.json({ limit: '10mb' }),
  (req, res, next) => trackerController.saveBaseline(req, res, next)
);

// POST /api/v1/agent/activity — agent posts a single activity event (small payload)
agentRouter.post(
  '/activity',
  requireAgentAuth,
  express.json({ limit: '2mb' }),
  (req, res, next) => trackerController.appendActivity(req, res, next)
);

// GET /api/v1/agent/upload-url — agent requests a presigned S3 PUT URL for direct upload
// Returns a time-limited URL so the agent PUTs the file directly to SeaweedFS,
// bypassing nginx entirely — supports files of any size.
agentRouter.get(
  '/upload-url',
  requireAgentAuth,
  (req, res, next) => trackerController.getUploadUrl(req, res, next)
);

// POST /api/v1/agent/file-upload — kept for backward compatibility (small files)
// No body size limit here — SeaweedFS handles large files via streaming multipart.
// For large files, prefer the presigned URL flow via GET /api/v1/agent/upload-url.
agentRouter.post(
  '/file-upload',
  requireAgentAuth,
  agentFileUpload.single('file'),
  (req, res, next) => trackerController.uploadFile(req, res, next)
);

// GET /api/v1/agent/file-download?ref=<storageRef> — agent downloads a file during clone
agentRouter.get(
  '/file-download',
  requireAgentAuth,
  (req, res, next) => trackerController.downloadFile(req, res, next)
);

// GET /api/v1/agent/clone-manifest — target agent fetches source activity log
agentRouter.get(
  '/clone-manifest',
  requireAgentAuth,
  (req, res, next) => trackerController.getCloneManifest(req, res, next)
);

// POST /api/v1/agent/clone-install — target agent requests a software install job
agentRouter.post(
  '/clone-install',
  requireAgentAuth,
  (req, res, next) => trackerController.cloneInstall(req, res, next)
);

export { machineRouter, agentRouter };
