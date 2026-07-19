import { Router } from 'express';
import { vmAutomationController } from './vmAutomation.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createVmAutomationSchema,
  updateVmAutomationSchema,
  automationIdParamSchema,
} from './vmAutomation.validation';

const router = Router();

router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));

router.get('/', (req, res, next) => vmAutomationController.list(req, res, next));

router.post(
  '/',
  validateRequest(createVmAutomationSchema),
  (req, res, next) => vmAutomationController.create(req, res, next)
);

router.get(
  '/:automationId',
  validateRequest(automationIdParamSchema),
  (req, res, next) => vmAutomationController.getById(req, res, next)
);

router.patch(
  '/:automationId',
  validateRequest(updateVmAutomationSchema),
  (req, res, next) => vmAutomationController.update(req, res, next)
);

router.delete(
  '/:automationId',
  validateRequest(automationIdParamSchema),
  (req, res, next) => vmAutomationController.delete(req, res, next)
);

export default router;
