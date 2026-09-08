import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { superAdminTargetsService } from './superAdminTargets.service';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

const router = Router();

router.use(requireAuth);
router.use(requirePermission('azure.manage'));

/** GET /api/v1/super-admin/targets */
router.get('/', async (_req, res, next) => {
  try {
    const data = await superAdminTargetsService.listTargetOptions();
    success(res, 'Targets retrieved.', data);
  } catch (err) {
    next(err);
  }
});

export default router;
