import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { requirePlatformPermission } from '../../middleware/requireOrgPermission.middleware';
import type { Request, Response, NextFunction } from 'express';
import { myVmDashboardController } from './myVmDashboard.controller';

const router = Router();

router.use(requireAuth);

/** GET /api/v1/my-vms — unified VM hub for platform admin. */
router.get(
  '/',
  requireRole('admin', 'staff', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    const role = (req as { user?: { role?: string } }).user?.role;
    if (role === 'staff' || role === 'super_admin') {
      return next();
    }
    return await requirePlatformPermission('my_vms.read')(req, res, next);
  },
  (req, res, next) => myVmDashboardController.listForAdmin(req, res, next)
);

export default router;
