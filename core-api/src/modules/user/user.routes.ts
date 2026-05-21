import { Router } from 'express';
import { userController } from './user.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';

const router = Router();

// All user routes require authentication
router.use(requireAuth);

// GET /api/v1/users — super_admin only
router.get('/', requireRole('super_admin'), (req, res, next) => {
  userController.listUsers(req, res, next);
});

// GET /api/v1/users/:id — super_admin only
router.get('/:id', requireRole('super_admin'), (req, res, next) => {
  userController.getUser(req, res, next);
});

// PATCH /api/v1/users/:id/active — super_admin only
router.patch('/:id/active', requireRole('super_admin'), (req, res, next) => {
  userController.setUserActive(req, res, next);
});

export default router;
