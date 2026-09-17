/**
 * Tenant support routes — register in app.ts as:
 *   app.use('/api/v1/tenant/support', tenantSupportRoutes);
 */
import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth, requireTenantRole } from '../../middleware/requireTenantAuth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { tenantSupportController } from './tenantSupport.controller';
import {
  addCommentSchema,
  createTicketSchema,
  escalateSchema,
  listTicketsSchema,
  tenantAssignSelfSchema,
  ticketIdParamSchema,
} from './support.validation';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.post(
  '/tickets',
  validateRequest(createTicketSchema),
  (req, res, next) => tenantSupportController.create(req, res, next)
);

router.get(
  '/tickets',
  validateRequest(listTicketsSchema),
  (req, res, next) => tenantSupportController.list(req, res, next)
);

router.get(
  '/tickets/:ticketId',
  validateRequest(ticketIdParamSchema),
  (req, res, next) => tenantSupportController.getOne(req, res, next)
);

router.post(
  '/tickets/:ticketId/comments',
  validateRequest(addCommentSchema),
  (req, res, next) => tenantSupportController.addComment(req, res, next)
);

router.post(
  '/tickets/:ticketId/assign',
  requireTenantRole('tenant_admin'),
  validateRequest(tenantAssignSelfSchema),
  (req, res, next) => tenantSupportController.assignToSelf(req, res, next)
);

router.patch(
  '/tickets/:ticketId/resolve',
  requireTenantRole('tenant_admin'),
  validateRequest(ticketIdParamSchema),
  (req, res, next) => tenantSupportController.resolve(req, res, next)
);

router.post(
  '/tickets/:ticketId/escalate',
  requireTenantRole('tenant_admin'),
  validateRequest(escalateSchema),
  (req, res, next) => tenantSupportController.escalate(req, res, next)
);

export default router;
