import { Router } from 'express';
import { externalVMController } from './external-vm.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createExternalVMSchema,
  bulkCreateExternalVMSchema,
  externalVMIdParamSchema,
  userIdParamSchema,
  assignExternalVMsSchema,
  bulkAssignExternalPairsSchema,
} from './external-vm.validation';

const router = Router();

router.use(requireAuth);

// POST /api/v1/external-vms/bulk — bulk add (defined before /:id collisions)
router.post(
  '/bulk',
  requireRole('admin', 'super_admin'),
  validateRequest(bulkCreateExternalVMSchema),
  (req, res, next) => externalVMController.bulkCreate(req, res, next)
);

// POST /api/v1/external-vms — add single external VM
router.post(
  '/',
  requireRole('admin', 'super_admin'),
  validateRequest(createExternalVMSchema),
  (req, res, next) => externalVMController.create(req, res, next)
);

// ─── Assignment routes (admin only) ────────────────────────────────────────────

router.get(
  '/assign/available',
  requireRole('admin', 'super_admin'),
  (req, res, next) => externalVMController.getAvailable(req, res, next)
);

router.get(
  '/assign/counts',
  requireRole('admin', 'super_admin'),
  (req, res, next) => externalVMController.getAssignedCounts(req, res, next)
);

router.get(
  '/assign/user/:userId',
  requireRole('admin', 'super_admin'),
  validateRequest(userIdParamSchema),
  (req, res, next) => externalVMController.getAssignedForUser(req, res, next)
);

router.post(
  '/assign',
  requireRole('admin', 'super_admin'),
  validateRequest(assignExternalVMsSchema),
  (req, res, next) => externalVMController.assign(req, res, next)
);

router.post(
  '/assign/bulk',
  requireRole('admin', 'super_admin'),
  validateRequest(bulkAssignExternalPairsSchema),
  (req, res, next) => externalVMController.bulkAssignOneToOne(req, res, next)
);

router.delete(
  '/assign/:id',
  requireRole('admin', 'super_admin'),
  validateRequest(externalVMIdParamSchema),
  (req, res, next) => externalVMController.unassign(req, res, next)
);

// GET /api/v1/external-vms/my-assigned — user sees assigned servers
router.get(
  '/my-assigned',
  requireRole('user'),
  (req, res, next) => externalVMController.getMyAssigned(req, res, next)
);

// GET /api/v1/external-vms — list my external VMs (admin)
router.get(
  '/',
  requireRole('admin', 'super_admin'),
  (req, res, next) => externalVMController.list(req, res, next)
);

// GET /api/v1/external-vms/:id/console — Guacamole session URL
router.get(
  '/:id/console',
  requireRole('admin', 'super_admin', 'user'),
  validateRequest(externalVMIdParamSchema),
  (req, res, next) => externalVMController.openConsole(req, res, next)
);

// GET /api/v1/external-vms/:id — single external VM
router.get(
  '/:id',
  requireRole('admin', 'super_admin', 'user'),
  validateRequest(externalVMIdParamSchema),
  (req, res, next) => externalVMController.getOne(req, res, next)
);

// DELETE /api/v1/external-vms/:id — delete external VM
router.delete(
  '/:id',
  requireRole('admin', 'super_admin'),
  validateRequest(externalVMIdParamSchema),
  (req, res, next) => externalVMController.remove(req, res, next)
);

export default router;
