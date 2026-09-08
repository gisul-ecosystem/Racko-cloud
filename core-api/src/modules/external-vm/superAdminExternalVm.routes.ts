import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { superAdminExternalVmController } from './superAdminExternalVm.controller';
import { superAdminBulkImportExternalVmSchema } from './superAdminBulkImport.validation';
import {
  createSuperAdminExternalVmAssignmentSchema,
  patchSuperAdminExternalVmAssignmentSchema,
  deleteSuperAdminExternalVmAssignmentSchema,
  bulkUpdateSuperAdminExternalVmOverrideSchema,
  setSuperAdminExternalVmInventoryLockSchema,
  patchSuperAdminExternalVmDetailsSchema,
  createSuperAdminExternalVmSiblingLoginSchema,
} from './superAdminExternalVmAssignment.validation';
import {
  deleteSuperAdminExternalVmSchema,
  bulkDeleteSuperAdminExternalVmSchema,
} from './superAdminExternalVmDelete.validation';

const router = Router();

router.use(requireAuth);
/**
 * Control-plane entitlement for SA bulk import / assign / overview.
 * `super_admin` always bypasses; `staff` needs `elastic_servers.superadmin`.
 * Platform admin `elastic.manage` / tenant `elastic.*` are unchanged separate paths.
 */
router.use(requirePermission('elastic_servers.superadmin'));

router.get('/overview', (req, res, next) =>
  superAdminExternalVmController.overview(req, res, next)
);

router.get('/assignees', (req, res, next) =>
  superAdminExternalVmController.listAssignees(req, res, next)
);

router.get('/targets', (req, res, next) =>
  superAdminExternalVmController.listTargets(req, res, next)
);

router.post(
  '/bulk-import',
  validateRequest(superAdminBulkImportExternalVmSchema),
  (req, res, next) => superAdminExternalVmController.bulkImport(req, res, next)
);

router.post(
  '/bulk-override',
  validateRequest(bulkUpdateSuperAdminExternalVmOverrideSchema),
  (req, res, next) => superAdminExternalVmController.bulkUpdateOverride(req, res, next)
);

router.post(
  '/bulk-delete',
  validateRequest(bulkDeleteSuperAdminExternalVmSchema),
  (req, res, next) => superAdminExternalVmController.bulkDeleteExternalVms(req, res, next)
);

router.post(
  '/:id/assignments',
  validateRequest(createSuperAdminExternalVmAssignmentSchema),
  (req, res, next) => superAdminExternalVmController.createAssignment(req, res, next)
);

router.patch(
  '/:id/assignments/:assignmentId',
  validateRequest(patchSuperAdminExternalVmAssignmentSchema),
  (req, res, next) => superAdminExternalVmController.patchAssignment(req, res, next)
);

router.patch(
  '/:id/lock',
  validateRequest(setSuperAdminExternalVmInventoryLockSchema),
  (req, res, next) => superAdminExternalVmController.setInventoryLock(req, res, next)
);

router.patch(
  '/:id/details',
  validateRequest(patchSuperAdminExternalVmDetailsSchema),
  (req, res, next) => superAdminExternalVmController.updateDetails(req, res, next)
);

router.post(
  '/:id/sibling-login',
  validateRequest(createSuperAdminExternalVmSiblingLoginSchema),
  (req, res, next) => superAdminExternalVmController.addSiblingLogin(req, res, next)
);

router.delete(
  '/:id/assignments/:assignmentId',
  validateRequest(deleteSuperAdminExternalVmAssignmentSchema),
  (req, res, next) => superAdminExternalVmController.deleteAssignment(req, res, next)
);

router.delete(
  '/:id',
  validateRequest(deleteSuperAdminExternalVmSchema),
  (req, res, next) => superAdminExternalVmController.deleteExternalVm(req, res, next)
);

export default router;
