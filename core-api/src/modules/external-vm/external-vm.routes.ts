import { Router } from 'express';
import { externalVMController } from './external-vm.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createExternalVMSchema,
  bulkCreateExternalVMSchema,
  externalVMIdParamSchema,
} from './external-vm.validation';

const router = Router();

// All external VM routes require an authenticated admin.
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

// GET /api/v1/external-vms — list my external VMs
router.get(
  '/',
  requireRole('admin', 'super_admin'),
  (req, res, next) => externalVMController.list(req, res, next)
);

// GET /api/v1/external-vms/:id/console — Guacamole session URL
router.get(
  '/:id/console',
  requireRole('admin', 'super_admin'),
  validateRequest(externalVMIdParamSchema),
  (req, res, next) => externalVMController.openConsole(req, res, next)
);

// GET /api/v1/external-vms/:id — single external VM
router.get(
  '/:id',
  requireRole('admin', 'super_admin'),
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
