import { Router } from 'express';
import { proxmoxController } from './proxmox.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { nodeNameParamSchema, vmQuerySchema } from './proxmox.validation';

// WEBSOCKET_SLOT: real-time node status updates via WebSocket/SSE

const router = Router();

// All proxmox routes require: valid JWT + super_admin role
// requireAuth runs first — always
router.use(requireAuth);
router.use(requireRole('super_admin'));

// GET /api/v1/proxmox/overview
// Quick summary: node count, VM count, resource totals
// Lightweight — for dashboard header/stats cards
router.get('/overview', (req, res, next) => {
  proxmoxController.getClusterOverview(req, res, next);
});

// GET /api/v1/proxmox/cluster
// Everything: nodes + storage + VMs + overview
// For full dashboard page load
router.get('/cluster', (req, res, next) => {
  proxmoxController.getFullClusterData(req, res, next);
});

// GET /api/v1/proxmox/nodes
// All nodes with their resource usage
router.get('/nodes', (req, res, next) => {
  proxmoxController.getNodes(req, res, next);
});

// GET /api/v1/proxmox/nodes/:nodeName
// Detailed view of a specific node
// nodeName validated: alphanumeric + hyphens, max 63 chars
router.get('/nodes/:nodeName', validateRequest(nodeNameParamSchema), (req, res, next) => {
  proxmoxController.getNodeDetails(req, res, next);
});

// GET /api/v1/proxmox/storage
// All storage pools across all nodes
router.get('/storage', (req, res, next) => {
  proxmoxController.getAllStorage(req, res, next);
});

// GET /api/v1/proxmox/vms
// All VMs and containers across all nodes
// Optional query params (Zod validated): ?node= ?status= ?type=
router.get('/vms', validateRequest(vmQuerySchema), (req, res, next) => {
  proxmoxController.getAllVMs(req, res, next);
});

export default router;
