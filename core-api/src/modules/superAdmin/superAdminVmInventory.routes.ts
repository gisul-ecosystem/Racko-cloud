import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { superAdminVmInventoryController } from './superAdminVmInventory.controller';
import {
  superAdminVmInventoryDeleteAssignedUserSchema,
  superAdminVmInventoryClearAssignmentSchema,
  superAdminVmInventoryQuerySchema,
  superAdminVmProviderMetadataImportSchema,
  superAdminVmProviderMetadataUpdateSchema,
} from './superAdminVmInventory.validation';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('vm_inventory.read'));

router.post(
  '/provider-metadata/import',
  requirePermission('vm_inventory.write'),
  validateRequest(superAdminVmProviderMetadataImportSchema),
  (req, res, next) => {
    superAdminVmInventoryController.importProviderMetadata(req, res, next);
  }
);

router.patch(
  '/assignment/delete-user',
  requirePermission('vm_inventory.write'),
  validateRequest(superAdminVmInventoryDeleteAssignedUserSchema),
  (req, res, next) => {
    superAdminVmInventoryController.deleteAssignedUser(req, res, next);
  }
);

router.patch(
  '/assignment/clear',
  requirePermission('vm_inventory.write'),
  validateRequest(superAdminVmInventoryClearAssignmentSchema),
  (req, res, next) => {
    superAdminVmInventoryController.clearAssignment(req, res, next);
  }
);

router.patch(
  '/assignment/free-and-delete-user',
  requirePermission('vm_inventory.write'),
  validateRequest(superAdminVmInventoryClearAssignmentSchema),
  (req, res, next) => {
    superAdminVmInventoryController.freeVmAndDeleteAssignedUser(req, res, next);
  }
);

router.patch(
  '/provider-metadata',
  requirePermission('vm_inventory.write'),
  validateRequest(superAdminVmProviderMetadataUpdateSchema),
  (req, res, next) => {
    superAdminVmInventoryController.updateProviderMetadata(req, res, next);
  }
);

router.get('/owners', validateRequest(superAdminVmInventoryQuerySchema), (req, res, next) => {
  superAdminVmInventoryController.listOwners(req, res, next);
});

router.get('/', validateRequest(superAdminVmInventoryQuerySchema), (req, res, next) => {
  superAdminVmInventoryController.list(req, res, next);
});

export default router;
