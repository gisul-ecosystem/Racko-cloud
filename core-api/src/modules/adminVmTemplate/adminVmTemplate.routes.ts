import { Router } from 'express';
import { adminVmTemplateController } from './adminVmTemplate.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';

const router = Router();

router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));

router.get('/', (req, res, next) => adminVmTemplateController.list(req, res, next));

router.post('/', (req, res, next) => adminVmTemplateController.create(req, res, next));

router.delete(
  '/:templateId',
  (req, res, next) => adminVmTemplateController.remove(req, res, next)
);

export default router;
