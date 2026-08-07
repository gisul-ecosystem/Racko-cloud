import { Router } from 'express';
import { machineGroupsController } from './machine-groups.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRoleOrPermission } from '../../middleware/requirePermission.middleware';

const router = Router();

router.use(requireAuth);
router.use(requireRoleOrPermission(['admin', 'super_admin'], 'machine_manager.manage'));

// POST   /api/v1/machine-groups
router.post('/', (req, res, next) => machineGroupsController.create(req, res, next));

// GET    /api/v1/machine-groups
router.get('/', (req, res, next) => machineGroupsController.list(req, res, next));

// GET    /api/v1/machine-groups/:id
router.get('/:id', (req, res, next) => machineGroupsController.getOne(req, res, next));

// PATCH  /api/v1/machine-groups/:id
router.patch('/:id', (req, res, next) => machineGroupsController.rename(req, res, next));

// DELETE /api/v1/machine-groups/:id
router.delete('/:id', (req, res, next) => machineGroupsController.delete(req, res, next));

// POST   /api/v1/machine-groups/:id/machines  — add machines
router.post('/:id/machines', (req, res, next) => machineGroupsController.addMachines(req, res, next));

// DELETE /api/v1/machine-groups/:id/machines  — remove machines
router.delete('/:id/machines', (req, res, next) => machineGroupsController.removeMachines(req, res, next));

// GET    /api/v1/machine-groups/:id/machines  — list machines
router.get('/:id/machines', (req, res, next) => machineGroupsController.listMachines(req, res, next));

export default router;
