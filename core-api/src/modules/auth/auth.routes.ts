import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from './auth.controller';
import { validateRequest } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireInternalSecret } from '../../middleware/internalSecret.middleware';
import { registerSchema, loginSchema, verifyEmailSchema } from './auth.validation';

const router = Router();

// Rate limiters per route
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { success: false, message: 'Too many registration attempts. Try again in 1 hour.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, message: 'Too many verification attempts. Try again in 1 hour.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { success: false, message: 'Too many refresh attempts.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
router.post('/register', registerLimiter, validateRequest(registerSchema), (req, res, next) => {
  authController.register(req, res, next);
});

router.post('/verify-email', verifyEmailLimiter, validateRequest(verifyEmailSchema), (req, res, next) => {
  authController.verifyEmail(req, res, next);
});

router.post('/login', loginLimiter, validateRequest(loginSchema), (req, res, next) => {
  authController.login(req, res, next);
});

router.post('/refresh', refreshLimiter, (req, res, next) => {
  authController.refreshToken(req, res, next);
});

// Protected routes
router.post('/logout', requireAuth, (req, res, next) => {
  authController.logout(req, res, next);
});

router.get('/me', requireAuth, (req, res, next) => {
  authController.getCurrentUser(req, res, next);
});

// Internal route — gateway only
router.post('/validate', requireInternalSecret, (req, res, next) => {
  authController.validateTokenForGateway(req, res, next);
});

export default router;
