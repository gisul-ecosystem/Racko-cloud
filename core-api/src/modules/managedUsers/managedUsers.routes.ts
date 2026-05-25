import { Router } from 'express';
import { managedUsersController } from './managedUsers.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createSingleUserSchema,
  createBulkUsersSchema,
  userIdParamSchema,
} from './managedUsers.validation';

const router = Router();

router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));

// POST /api/v1/managed-users/single
router.post(
  '/single',
  validateRequest(createSingleUserSchema),
  (req, res, next) => managedUsersController.createSingle(req, res, next)
);

// POST /api/v1/managed-users/bulk
router.post(
  '/bulk',
  validateRequest(createBulkUsersSchema),
  (req, res, next) => managedUsersController.createBulk(req, res, next)
);

// GET /api/v1/managed-users
router.get(
  '/',
  (req, res, next) => managedUsersController.listMyUsers(req, res, next)
);

// PATCH /api/v1/managed-users/:userId/active
router.patch(
  '/:userId/active',
  validateRequest(userIdParamSchema),
  (req, res, next) => managedUsersController.setUserActive(req, res, next)
);

// DELETE /api/v1/managed-users/:userId
router.delete(
  '/:userId',
  validateRequest(userIdParamSchema),
  (req, res, next) => managedUsersController.deleteUser(req, res, next)
);

export default router;
