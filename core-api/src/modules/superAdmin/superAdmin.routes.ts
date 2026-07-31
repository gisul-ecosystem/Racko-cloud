import { Router } from 'express';
import { superAdminController } from './superAdmin.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  manualWalletCreditSchema,
  setTenantAdminActiveSchema,
  superAdminManualCreditsListSchema,
  superAdminTenantAdminParamSchema,
  superAdminTenantIdParamSchema,
  superAdminWalletTransactionsSchema,
} from './superAdmin.validation';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('white_labelling.manage'));

router.get('/overview', (req, res, next) => {
  superAdminController.overview(req, res, next);
});

router.get(
  '/tenants/:tenantId/admins',
  validateRequest(superAdminTenantIdParamSchema),
  (req, res, next) => {
    superAdminController.listTenantAdmins(req, res, next);
  }
);

router.patch(
  '/tenants/:tenantId/admins/:tenantUserId/active',
  validateRequest(setTenantAdminActiveSchema),
  (req, res, next) => {
    superAdminController.setTenantAdminActive(req, res, next);
  }
);

router.delete(
  '/tenants/:tenantId/admins/:tenantUserId',
  validateRequest(superAdminTenantAdminParamSchema),
  (req, res, next) => {
    superAdminController.deleteTenantAdmin(req, res, next);
  }
);

router.get(
  '/tenants/:tenantId/wallet',
  validateRequest(superAdminTenantIdParamSchema),
  (req, res, next) => {
    superAdminController.getTenantWallet(req, res, next);
  }
);

router.get(
  '/tenants/:tenantId/wallet/transactions',
  validateRequest(superAdminWalletTransactionsSchema),
  (req, res, next) => {
    superAdminController.listTenantWalletTransactions(req, res, next);
  }
);

router.get(
  '/tenants/:tenantId/wallet/manual-credits',
  validateRequest(superAdminManualCreditsListSchema),
  (req, res, next) => {
    superAdminController.listTenantManualCredits(req, res, next);
  }
);

router.post(
  '/tenants/:tenantId/wallet/manual-credit',
  validateRequest(manualWalletCreditSchema),
  (req, res, next) => {
    superAdminController.manualCreditTenantWallet(req, res, next);
  }
);

export default router;
