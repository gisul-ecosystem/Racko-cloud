/**
 * Platform support routes — register in app.ts as:
 *   app.use('/api/v1/support', supportRoutes);
 */
import { Router } from 'express';
import { supportController } from './support.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  addCommentSchema,
  createSupportAgentSchema,
  listTicketsSchema,
  reassignSchema,
  ticketIdParamSchema,
  updateTicketSchema,
} from './support.validation';

const router = Router();

router.use(requireAuth);

router.get(
  '/tickets/my',
  // support_agent, admin, super_admin
  validateRequest(listTicketsSchema),
  (req, res, next) => supportController.myTickets(req, res, next)
);

router.get(
  '/tickets/:ticketId',
  // support_agent, admin, super_admin
  validateRequest(ticketIdParamSchema),
  (req, res, next) => supportController.getOne(req, res, next)
);

router.patch(
  '/tickets/:ticketId',
  // support_agent, admin, super_admin
  validateRequest(updateTicketSchema),
  (req, res, next) => supportController.updateTicket(req, res, next)
);

router.post(
  '/tickets/:ticketId/comments',
  // support_agent, admin, super_admin
  validateRequest(addCommentSchema),
  (req, res, next) => supportController.addComment(req, res, next)
);

router.get(
  '/tickets',
  requireRole('admin', 'super_admin'),
  validateRequest(listTicketsSchema),
  (req, res, next) => supportController.listAll(req, res, next)
);

router.get(
  '/queue',
  requireRole('admin', 'super_admin'),
  (req, res, next) => supportController.queueOverview(req, res, next)
);

router.get(
  '/agents',
  requireRole('admin', 'super_admin'),
  (req, res, next) => supportController.listAgents(req, res, next)
);

router.post(
  '/agents',
  requireRole('admin', 'super_admin'),
  validateRequest(createSupportAgentSchema),
  (req, res, next) => supportController.createAgent(req, res, next)
);

router.post(
  '/tickets/:ticketId/reassign',
  requireRole('admin', 'super_admin'),
  validateRequest(reassignSchema),
  (req, res, next) => supportController.reassign(req, res, next)
);

export default router;
