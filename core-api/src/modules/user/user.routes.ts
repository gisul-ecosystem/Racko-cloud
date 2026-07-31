import { Router } from 'express';
import { userController } from './user.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';

const router = Router();

// All user routes require authentication
router.use(requireAuth);

// GET /api/v1/users — control-plane admin users
router.get('/', requirePermission('admin_users.manage'), (req, res, next) => {
  userController.listUsers(req, res, next);
});

router.get('/:id', requirePermission('admin_users.manage'), (req, res, next) => {
  userController.getUser(req, res, next);
});

router.patch('/:id/active', requirePermission('admin_users.manage'), (req, res, next) => {
  userController.setUserActive(req, res, next);
});

export default router;
