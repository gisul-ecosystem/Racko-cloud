import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import type { AuthenticatedRequest } from '../../types';
import { otpService } from './otp.service';
import { sendPhoneOtpSchema, verifyPhoneOtpSchema, type SendPhoneOtpInput, type VerifyPhoneOtpInput } from './otp.validation';

const router = Router();

router.use(requireAuth);

router.post('/phone/send', validateRequest(sendPhoneOtpSchema), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as SendPhoneOtpInput;
    const result = await otpService.sendPhoneOtp(authReq.user.userId, body);
    res.status(200).json({
      success: true,
      message: 'OTP sent to phone number.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/phone/verify', validateRequest(verifyPhoneOtpSchema), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as VerifyPhoneOtpInput;
    await otpService.verifyPhoneOtp(authReq.user.userId, body);
    res.status(200).json({
      success: true,
      message: 'Phone number verified.',
      data: { verified: true },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
