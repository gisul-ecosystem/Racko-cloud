import { Router } from 'express';
import { authController } from './auth.controller';
import { validateRequest } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireInternalSecret } from '../../middleware/internalSecret.middleware';
import {
  checkEmailSchema,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validation';

const router = Router();

// Rate limiting is handled entirely by the gateway — no per-route limiters here.
// Core-api is not publicly exposed; all traffic goes through the gateway.

// Public routes
router.post('/check-email', validateRequest(checkEmailSchema), (req, res, next) => {
  authController.checkEmail(req, res, next);
});

router.post('/register', validateRequest(registerSchema), (req, res, next) => {
  authController.register(req, res, next);
});

router.post('/verify-email', validateRequest(verifyEmailSchema), (req, res, next) => {
  authController.verifyEmail(req, res, next);
});

router.post(
  '/resend-verification',
  validateRequest(resendVerificationSchema),
  (req, res, next) => {
    authController.resendVerification(req, res, next);
  }
);

router.post('/login', validateRequest(loginSchema), (req, res, next) => {
  authController.login(req, res, next);
});

router.post('/refresh', (req, res, next) => {
  authController.refreshToken(req, res, next);
});

// Cookie-only — no access token required so sign-out always clears the session
router.post('/logout', (req, res, next) => {
  authController.logout(req, res, next);
});

router.post('/forgot-password', validateRequest(forgotPasswordSchema), (req, res, next) => {
  authController.forgotPassword(req, res, next);
});

router.post('/reset-password', validateRequest(resetPasswordSchema), (req, res, next) => {
  authController.resetPassword(req, res, next);
});

// Protected routes

router.get('/me', requireAuth, (req, res, next) => {
  authController.getCurrentUser(req, res, next);
});

router.get('/access-check', requireAuth, (req, res, next) => {
  authController.accessCheck(req, res, next);
});

// Internal route — gateway only
router.post('/validate', requireInternalSecret, (req, res, next) => {
  authController.validateTokenForGateway(req, res, next);
});

export default router;
