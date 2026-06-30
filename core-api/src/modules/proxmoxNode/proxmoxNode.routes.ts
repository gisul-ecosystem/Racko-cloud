import { Router } from 'express';
import { proxmoxNodeController } from './proxmoxNode.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';

const router = Router();
router.use(requireAuth);
router.use(requireRole('super_admin'));

router.get('/available', (req, res, next) => proxmoxNodeController.getAvailable(req, res, next));
router.post('/selection', (req, res, next) => proxmoxNodeController.saveSelection(req, res, next));

export default router;
