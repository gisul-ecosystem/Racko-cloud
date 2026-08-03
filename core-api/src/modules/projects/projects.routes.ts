import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { requirePlatformPermission } from '../../middleware/requireOrgPermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { projectsController } from './projects.controller';
import {
  addProjectServicesSchema,
  addProjectServicesForAdminSchema,
  addProjectServicesForTenantSchema,
  adminIdParamSchema,
  adminProjectParamSchema,
  createProjectForAdminSchema,
  createProjectForTenantSchema,
  createProjectSchema,
  projectIdParamSchema,
  projectReportsQuerySchema,
  removeProjectServiceSchema,
  tenantIdParamSchema,
  updateProjectSchema,
} from './projects.validation';

const router = Router();

router.use(requireAuth);

/** Super-admin: manage projects for an organization owner */
router.get(
  '/admins/:adminId',
  requirePermission('admin_users.manage'),
  validateRequest(adminIdParamSchema),
  (req, res, next) => {
    projectsController.listForAdmin(req, res, next);
  }
);

router.get(
  '/admins/:adminId/name-preview',
  requirePermission('admin_users.manage'),
  validateRequest(adminIdParamSchema),
  (req, res, next) => {
    projectsController.previewNameForAdmin(req, res, next);
  }
);

router.get(
  '/admins/:adminId/eligible-services',
  requirePermission('admin_users.manage'),
  validateRequest(adminIdParamSchema),
  (req, res, next) => {
    projectsController.listEligibleServicesForAdmin(req, res, next);
  }
);

router.post(
  '/admins/:adminId',
  requirePermission('admin_users.manage'),
  validateRequest(createProjectForAdminSchema),
  (req, res, next) => {
    projectsController.createForAdmin(req, res, next);
  }
);

router.get(
  '/admins/:adminId/:projectId/reports/by-service',
  requirePermission('admin_users.manage'),
  validateRequest(adminProjectParamSchema),
  (req, res, next) => {
    projectsController.reportByServiceForAdmin(req, res, next);
  }
);

router.get(
  '/admins/:adminId/:projectId',
  requirePermission('admin_users.manage'),
  validateRequest(adminProjectParamSchema),
  (req, res, next) => {
    projectsController.getByIdForAdmin(req, res, next);
  }
);

router.post(
  '/admins/:adminId/:projectId/services',
  requirePermission('admin_users.manage'),
  validateRequest(addProjectServicesForAdminSchema),
  (req, res, next) => {
    projectsController.addServicesForAdmin(req, res, next);
  }
);

/** Super-admin: manage projects for a white-label tenant */
router.get(
  '/tenants/:tenantId',
  requirePermission('white_labelling.manage'),
  validateRequest(tenantIdParamSchema),
  (req, res, next) => {
    projectsController.listForTenant(req, res, next);
  }
);

router.get(
  '/tenants/:tenantId/name-preview',
  requirePermission('white_labelling.manage'),
  validateRequest(tenantIdParamSchema),
  (req, res, next) => {
    projectsController.previewNameForTenant(req, res, next);
  }
);

router.get(
  '/tenants/:tenantId/eligible-services',
  requirePermission('white_labelling.manage'),
  validateRequest(tenantIdParamSchema),
  (req, res, next) => {
    projectsController.listEligibleServicesForTenant(req, res, next);
  }
);

router.post(
  '/tenants/:tenantId',
  requirePermission('white_labelling.manage'),
  validateRequest(createProjectForTenantSchema),
  (req, res, next) => {
    projectsController.createForTenant(req, res, next);
  }
);

router.post(
  '/tenants/:tenantId/:projectId/services',
  requirePermission('white_labelling.manage'),
  validateRequest(addProjectServicesForTenantSchema),
  (req, res, next) => {
    projectsController.addServicesForTenantSuperAdmin(req, res, next);
  }
);

/** Org admin routes */
router.use(requireRole('admin'));

router.get(
  '/reports/by-project',
  requirePlatformPermission('projects.read'),
  (req, res, next) => {
    projectsController.reportByProject(req, res, next);
  }
);

router.get(
  '/reports/by-service',
  requirePlatformPermission('projects.read'),
  validateRequest(projectReportsQuerySchema),
  (req, res, next) => {
    projectsController.reportByService(req, res, next);
  }
);

router.get(
  '/name-preview',
  requirePlatformPermission('projects.manage'),
  (req, res, next) => {
    projectsController.previewName(req, res, next);
  }
);

router.get('/for-service/:serviceKey', (req, res, next) => {
  projectsController.listForService(req, res, next);
});

router.get('/', requirePlatformPermission('projects.read'), (req, res, next) => {
  projectsController.list(req, res, next);
});

router.post(
  '/',
  requirePlatformPermission('projects.manage'),
  validateRequest(createProjectSchema),
  (req, res, next) => {
    projectsController.create(req, res, next);
  }
);

router.get(
  '/:id',
  requirePlatformPermission('projects.read'),
  validateRequest(projectIdParamSchema),
  (req, res, next) => {
    projectsController.getById(req, res, next);
  }
);

router.patch(
  '/:id',
  requirePlatformPermission('projects.manage'),
  validateRequest(updateProjectSchema),
  (req, res, next) => {
    projectsController.update(req, res, next);
  }
);

router.post(
  '/:id/services',
  requirePlatformPermission('projects.manage'),
  validateRequest(addProjectServicesSchema),
  (req, res, next) => {
    projectsController.addServices(req, res, next);
  }
);

router.delete(
  '/:id/services/:serviceKey',
  requirePlatformPermission('projects.manage'),
  validateRequest(removeProjectServiceSchema),
  (req, res, next) => {
    projectsController.removeService(req, res, next);
  }
);

router.post(
  '/:id/archive',
  requirePlatformPermission('projects.manage'),
  validateRequest(projectIdParamSchema),
  (req, res, next) => {
    projectsController.archive(req, res, next);
  }
);

export default router;
