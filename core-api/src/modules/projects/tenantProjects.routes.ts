import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { requireTenantPermission } from '../../middleware/requireOrgPermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { tenantProjectsController } from './tenantProjects.controller';
import {
  addProjectServicesSchema,
  createProjectSchema,
  projectIdParamSchema,
  projectReportsQuerySchema,
  removeProjectServiceSchema,
  updateProjectSchema,
} from './projects.validation';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.get(
  '/reports/by-project',
  requireTenantPermission('projects.read'),
  (req, res, next) => {
    tenantProjectsController.reportByProject(req, res, next);
  }
);

router.get(
  '/reports/by-service',
  requireTenantPermission('projects.read'),
  validateRequest(projectReportsQuerySchema),
  (req, res, next) => {
    tenantProjectsController.reportByService(req, res, next);
  }
);

router.get('/name-preview', requireTenantPermission('projects.manage'), (req, res, next) => {
  tenantProjectsController.previewName(req, res, next);
});

router.get('/eligible-services', requireTenantPermission('projects.manage'), (req, res, next) => {
  tenantProjectsController.listEligibleServices(req, res, next);
});

/** Used by service purchase flows — any authenticated tenant user can pick a project. */
router.get('/for-service/:serviceKey', (req, res, next) => {
  tenantProjectsController.listForService(req, res, next);
});

router.get('/', requireTenantPermission('projects.read'), (req, res, next) => {
  tenantProjectsController.list(req, res, next);
});

router.post(
  '/',
  requireTenantPermission('projects.manage'),
  validateRequest(createProjectSchema),
  (req, res, next) => {
    tenantProjectsController.create(req, res, next);
  }
);

router.get(
  '/:id',
  requireTenantPermission('projects.read'),
  validateRequest(projectIdParamSchema),
  (req, res, next) => {
    tenantProjectsController.getById(req, res, next);
  }
);

router.patch(
  '/:id',
  requireTenantPermission('projects.manage'),
  validateRequest(updateProjectSchema),
  (req, res, next) => {
    tenantProjectsController.update(req, res, next);
  }
);

router.post(
  '/:id/services',
  requireTenantPermission('projects.manage'),
  validateRequest(addProjectServicesSchema),
  (req, res, next) => {
    tenantProjectsController.addServices(req, res, next);
  }
);

router.delete(
  '/:id/services/:serviceKey',
  requireTenantPermission('projects.manage'),
  validateRequest(removeProjectServiceSchema),
  (req, res, next) => {
    tenantProjectsController.removeService(req, res, next);
  }
);

router.post(
  '/:id/archive',
  requireTenantPermission('projects.manage'),
  validateRequest(projectIdParamSchema),
  (req, res, next) => {
    tenantProjectsController.archive(req, res, next);
  }
);

export default router;
