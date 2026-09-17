import { z } from 'zod';
import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { requireTenantPermission } from '../../middleware/requireOrgPermission.middleware';
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

const chargeCloudRequestSchema = z.object({
  body: z.object({
    amountUsd: z.number().positive(),
    relatedRequestId: z.string().min(1).nullable().optional(),
    provider: z.enum(['azure', 'aws', 'gcp']).optional().default('azure'),
    projectId: z.string().min(1).optional(),
    serviceKey: z.enum(['azure', 'aws', 'gcp', 'cloud-labs']).optional(),
  }),
});

const refundCloudRequestSchema = z.object({
  body: z.object({
    amountInr: z.number().positive(),
    relatedRequestId: z.string().min(1).nullable().optional(),
    provider: z.enum(['azure', 'aws', 'gcp']).optional().default('azure'),
  }),
});

const linkCloudRequestSchema = z.object({
  body: z.object({
    relatedRequestId: z.string().min(1),
    provider: z.enum(['azure', 'aws', 'gcp']).optional().default('azure'),
  }),
});

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.get(
  '/',
  requireTenantPermission('wallet.read'),
  (req, res, next) => walletController.getWallet(req, res, next)
);

router.get(
  '/transactions',
  requireTenantPermission('wallet.read'),
  validateRequest(listTransactionsSchema),
  (req, res, next) => walletController.listTransactions(req, res, next)
);

router.get('/transactions/:txId', (req, res, next) =>
  walletController.getTransaction(req, res, next)
);

router.post(
  '/topup',
  requireTenantPermission('wallet.topup'),
  validateRequest(topupSchema),
  (req, res, next) => walletController.createTopup(req, res, next)
);

router.post(
  '/charge-cloud-request',
  requireTenantPermission('wallet.topup', 'azure.manage', 'aws.manage'),
  validateRequest(chargeCloudRequestSchema),
  (req, res, next) => walletController.chargeCloudRequest(req, res, next)
);

router.post(
  '/refund-cloud-request',
  requireTenantPermission('wallet.topup', 'azure.manage', 'aws.manage'),
  validateRequest(refundCloudRequestSchema),
  (req, res, next) => walletController.refundCloudRequest(req, res, next)
);

router.post(
  '/link-cloud-request',
  requireTenantPermission('wallet.topup', 'azure.manage', 'aws.manage'),
  validateRequest(linkCloudRequestSchema),
  (req, res, next) => walletController.linkCloudRequest(req, res, next)
);

export default router;
