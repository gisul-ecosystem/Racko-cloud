import { Router } from 'express';
import { adminVmTemplateController } from './adminVmTemplate.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';

const router = Router();

// SSE stream — must be defined BEFORE the router-level auth middleware.
// EventSource cannot set Authorization headers; auth uses a short-lived
// single-use ?streamToken= ticket issued by POST /:templateId/stream-ticket.
router.get(
  '/:templateId/stream',
  (req, res) => void adminVmTemplateController.streamProgress(req, res)
);

// All other routes require auth
router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));

router.post(
  '/:templateId/stream-ticket',
  (req, res, next) => void adminVmTemplateController.issueStreamTicket(req, res, next)
);

router.get('/', (req, res, next) => adminVmTemplateController.list(req, res, next));

router.post('/', (req, res, next) => adminVmTemplateController.create(req, res, next));

router.delete(
  '/:templateId',
  (req, res, next) => adminVmTemplateController.remove(req, res, next)
);

export default router;
