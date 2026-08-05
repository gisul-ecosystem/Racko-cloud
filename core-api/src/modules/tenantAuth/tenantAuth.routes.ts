import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { tenantAuthController } from './tenantAuth.controller';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  tenantForgotPasswordSchema,
  tenantLoginSchema,
  tenantResendVerificationSchema,
  tenantResetPasswordSchema,
  tenantVerifyEmailSchema,
} from './tenantAuth.validation';

const router = Router();

router.post('/login', validateRequest(tenantLoginSchema), (req, res, next) => {
  tenantAuthController.login(req, res, next);
});

router.post('/verify-email', validateRequest(tenantVerifyEmailSchema), (req, res, next) => {
  tenantAuthController.verifyEmail(req, res, next);
});

router.post(
  '/resend-verification',
  validateRequest(tenantResendVerificationSchema),
  (req, res, next) => {
    tenantAuthController.resendVerification(req, res, next);
  }
);

router.get('/access-check', resolveTenantContext, requireTenantAuth, (req, res, next) => {
  tenantAuthController.accessCheck(req, res, next);
});

router.post('/forgot-password', validateRequest(tenantForgotPasswordSchema), (req, res, next) => {
  tenantAuthController.forgotPassword(req, res, next);
});

router.post('/reset-password', validateRequest(tenantResetPasswordSchema), (req, res, next) => {
  tenantAuthController.resetPassword(req, res, next);
});

export default router;
