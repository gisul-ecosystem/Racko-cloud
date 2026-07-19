import { Router } from 'express';
import { tenantAuthController } from './tenantAuth.controller';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  tenantForgotPasswordSchema,
  tenantLoginSchema,
  tenantResetPasswordSchema,
} from './tenantAuth.validation';

const router = Router();

router.post('/login', validateRequest(tenantLoginSchema), (req, res, next) => {
  tenantAuthController.login(req, res, next);
});

router.post('/forgot-password', validateRequest(tenantForgotPasswordSchema), (req, res, next) => {
  tenantAuthController.forgotPassword(req, res, next);
});

router.post('/reset-password', validateRequest(tenantResetPasswordSchema), (req, res, next) => {
  tenantAuthController.resetPassword(req, res, next);
});

export default router;
