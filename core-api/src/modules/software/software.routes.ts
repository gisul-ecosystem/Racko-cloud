import { Router } from 'express';
import { softwareController } from './software.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { createSoftwareSchema, updateSoftwareSchema, softwareIdParamSchema } from './software.validation';

const router = Router();

router.use(requireAuth);

// GET /api/v1/software — active software list (admin + super_admin, used on VM create page)
router.get(
  '/',
  requireRole('admin', 'super_admin'),
  (req, res, next) => softwareController.listActive(req, res, next)
);

// GET /api/v1/software/all — all entries including inactive (super_admin only)
router.get(
  '/all',
  requirePermission('vm_management.manage'),
  (req, res, next) => softwareController.listAll(req, res, next)
);

// POST /api/v1/software
router.post(
  '/',
  requirePermission('vm_management.manage'),
  validateRequest(createSoftwareSchema),
  (req, res, next) => softwareController.create(req, res, next)
);

// PATCH /api/v1/software/:softwareId
router.patch(
  '/:softwareId',
  requirePermission('vm_management.manage'),
  validateRequest(updateSoftwareSchema),
  (req, res, next) => softwareController.update(req, res, next)
);

// DELETE /api/v1/software/:softwareId
router.delete(
  '/:softwareId',
  requirePermission('vm_management.manage'),
  validateRequest(softwareIdParamSchema),
  (req, res, next) => softwareController.deactivate(req, res, next)
);

export default router;
