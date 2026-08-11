import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { requirePlatformPermission } from '../../middleware/requireOrgPermission.middleware';
import { myVmDashboardController } from './myVmDashboard.controller';

const router = Router();

router.use(requireAuth);

/** GET /api/v1/my-vms — read-only VM list gated by my_vms.read. */
router.get(
  '/',
  requireRole('admin', 'super_admin'),
  requirePlatformPermission('my_vms.read'),
  (req, res, next) => myVmDashboardController.listForAdmin(req, res, next)
);

export default router;
