import { Router } from 'express';
import { ipPoolController } from './ipPool.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';

const router = Router();

router.use(requireAuth);
router.use(requireRole('super_admin'));

// POST /api/v1/ip-pool/subnet
router.post('/subnet', (req, res, next) => ipPoolController.addSubnet(req, res, next));

// GET /api/v1/ip-pool/stats
router.get('/stats', (req, res, next) => ipPoolController.getStats(req, res, next));

// GET /api/v1/ip-pool/list
router.get('/list', (req, res, next) => ipPoolController.listIPs(req, res, next));

// POST /api/v1/ip-pool/:ip/release
router.post('/:ip/release', (req, res, next) => ipPoolController.releaseIP(req, res, next));

export default router;
