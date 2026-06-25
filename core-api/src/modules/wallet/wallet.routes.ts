import { z } from 'zod';
import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import {
  requireTenantAuth,
  requireTenantRole,
} from '../../middleware/requireTenantAuth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { walletController } from './wallet.controller';

const topupSchema = z.object({
  body: z.object({
    amount: z.number().positive('amount must be positive'),
  }),
});

const listTransactionsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),
});

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.get('/', (req, res, next) => walletController.getWallet(req, res, next));

router.get(
  '/transactions',
  validateRequest(listTransactionsSchema),
  (req, res, next) => walletController.listTransactions(req, res, next)
);

router.post(
  '/topup',
  requireTenantRole('tenant_admin'),
  validateRequest(topupSchema),
  (req, res, next) => walletController.createTopup(req, res, next)
);

export default router;
