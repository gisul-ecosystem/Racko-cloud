import { Router } from 'express';
import { softwareCatalogController } from './software-catalog.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createSoftwareCatalogSchema,
  softwareCatalogIdParamSchema,
} from './software-catalog.validation';

const router = Router();

router.use(requireAuth);

// GET /api/v1/software-catalog — admin + super_admin list
router.get(
  '/',
  requireRole('admin', 'super_admin'),
  (req, res, next) => softwareCatalogController.list(req, res, next)
);

// GET /api/v1/software-catalog/:id — agent resolves install details (admin + super_admin)
router.get(
  '/:id',
  requireRole('admin', 'super_admin'),
  validateRequest(softwareCatalogIdParamSchema),
  (req, res, next) => softwareCatalogController.getOne(req, res, next)
);

// POST /api/v1/software-catalog — super_admin only
router.post(
  '/',
  requireRole('super_admin'),
  validateRequest(createSoftwareCatalogSchema),
  (req, res, next) => softwareCatalogController.create(req, res, next)
);

// DELETE /api/v1/software-catalog/:id — super_admin only
router.delete(
  '/:id',
  requireRole('super_admin'),
  validateRequest(softwareCatalogIdParamSchema),
  (req, res, next) => softwareCatalogController.remove(req, res, next)
);

export default router;
