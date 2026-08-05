import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { adminBillingController } from './adminBilling.controller';
import {
  creditWalletSchema,
  listTransactionsSchema,
  quoteSchema,
  savePricingSchema,
  topupSchema,
  userIdParamSchema,
  chargeCloudRequestSchema,
  refundCloudRequestSchema,
  linkCloudRequestSchema,
} from './adminBilling.validation';

const router = Router();

router.use(requireAuth);
// Both super_admin and admin use billing — wallet is per-user
router.use(requireRole('super_admin', 'admin'));

// ── Pricing ────────────────────────────────────────────────────────────────
// GET  /api/v1/admin-billing/pricing
// PATCH /api/v1/admin-billing/pricing  (super_admin only — set rates)
router.get('/pricing', (req, res, next) => {
  adminBillingController.getPricing(req, res, next);
});

router.patch(
  '/pricing',
  requireRole('super_admin'),   // only super admin can change rates
  validateRequest(savePricingSchema),
  (req, res, next) => {
    adminBillingController.savePricing(req, res, next);
  }
);

// ── Quote ───────────────────────────────────────────────────────────────────
// POST /api/v1/admin-billing/quote
router.post(
  '/quote',
  validateRequest(quoteSchema),
  (req, res, next) => {
    adminBillingController.quote(req, res, next);
  }
);

// ── My wallet (the calling user's own wallet) ────────────────────────────────
// GET  /api/v1/admin-billing/wallet/me
// GET  /api/v1/admin-billing/wallet/me/transactions
router.get('/wallet/me', (req, res, next) => {
  adminBillingController.getMyWallet(req, res, next);
});

router.get('/wallet/me/transactions', (req, res, next) => {
  adminBillingController.listMyTransactions(req, res, next);
});

router.get('/wallet/me/transactions/:txId', (req, res, next) => {
  adminBillingController.getMyTransaction(req, res, next);
});

// POST /api/v1/admin-billing/wallet/me/topup  — self top-up via Razorpay
router.post(
  '/wallet/me/topup',
  validateRequest(topupSchema),
  (req, res, next) => {
    adminBillingController.topupMyWallet(req, res, next);
  }
);

// POST /api/v1/admin-billing/wallet/me/charge-cloud-request — USD→INR debit for Azure labs
router.post(
  '/wallet/me/charge-cloud-request',
  validateRequest(chargeCloudRequestSchema),
  (req, res, next) => {
    adminBillingController.chargeCloudRequest(req, res, next);
  }
);

// POST /api/v1/admin-billing/wallet/me/refund-cloud-request — refund if lab create fails
router.post(
  '/wallet/me/refund-cloud-request',
  validateRequest(refundCloudRequestSchema),
  (req, res, next) => {
    adminBillingController.refundCloudRequestCharge(req, res, next);
  }
);

// POST /api/v1/admin-billing/wallet/me/link-cloud-request — attach request id to latest debit
router.post(
  '/wallet/me/link-cloud-request',
  validateRequest(linkCloudRequestSchema),
  (req, res, next) => {
    adminBillingController.linkCloudRequestCharge(req, res, next);
  }
);

// ── Any user's wallet — super_admin only ─────────────────────────────────────
// GET  /api/v1/admin-billing/wallet/:userId
// GET  /api/v1/admin-billing/wallet/:userId/transactions
// POST /api/v1/admin-billing/wallet/credit
router.post(
  '/wallet/credit',
  requirePermission('admin_users.manage'),
  validateRequest(creditWalletSchema),
  (req, res, next) => {
    adminBillingController.creditWallet(req, res, next);
  }
);

router.get(
  '/wallet/:userId',
  requirePermission('admin_users.manage'),
  validateRequest(userIdParamSchema),
  (req, res, next) => {
    adminBillingController.getWalletByUserId(req, res, next);
  }
);

router.get(
  '/wallet/:userId/transactions',
  requirePermission('admin_users.manage'),
  validateRequest(listTransactionsSchema),
  (req, res, next) => {
    adminBillingController.listTransactions(req, res, next);
  }
);

export default router;
