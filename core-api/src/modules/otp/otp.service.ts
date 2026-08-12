import crypto from 'crypto';
import mongoose from 'mongoose';
import { config } from '../../config';
import { PhoneOtpModel, type PhoneOtpPurpose } from '../../models/phoneOtp.model';
import { InternalError, TooManyRequestsError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const RESEND_COOLDOWN_MS = 60_000;
const MAX_SENDS_PER_WINDOW = 5;
const MAX_VERIFY_ATTEMPTS = 5;
const VERIFIED_WINDOW_MS = 30 * 60_000;
const CLEANUP_BUFFER_MS = 60 * 60_000;

function normalizePhone(phone: string): string {
  return phone.trim();
}

function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOtp(phone: string, purpose: PhoneOtpPurpose, otp: string): string {
  return crypto
    .createHmac('sha256', config.JWT_ACCESS_SECRET)
    .update(`${purpose}:${phone}:${otp}`)
    .digest('hex');
}

function isDevBypassCode(code: string): boolean {
  return (
    config.NODE_ENV !== 'production' &&
    config.MSG91_OTP_DEV_BYPASS_CODE.trim().length > 0 &&
    code === config.MSG91_OTP_DEV_BYPASS_CODE.trim()
  );
}

function getDevBypassOtp(): string | null {
  const code = config.MSG91_OTP_DEV_BYPASS_CODE.trim();
  if (config.NODE_ENV === 'production' || !/^\d{6}$/.test(code)) return null;
  return code;
}

async function sendViaMsg91(phone: string, otp: string): Promise<void> {
  const authKey = config.MSG91_AUTH_KEY.trim();
  const templateId = config.MSG91_OTP_TEMPLATE_ID.trim();

  if (!authKey || !templateId) {
    throw new ValidationError('MSG91 OTP is not configured. Add MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID.');
  }

  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', templateId);
  url.searchParams.set('mobile', phone.replace(/^\+/, ''));
  url.searchParams.set('otp', otp);
  url.searchParams.set('otp_expiry', String(config.MSG91_OTP_EXPIRY_MINUTES));
  if (config.MSG91_SENDER_ID.trim()) {
    url.searchParams.set('sender', config.MSG91_SENDER_ID.trim());
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      authkey: authKey,
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  let body: { type?: string; message?: string } | null = null;
  try {
    body = text ? (JSON.parse(text) as { type?: string; message?: string }) : null;
  } catch {
    body = null;
  }

  if (!response.ok || body?.type === 'error') {
    logger.error('[otp] MSG91 send failed', {
      status: response.status,
      message: body?.message ?? text.slice(0, 300),
    });
    throw new InternalError('Could not send OTP right now. Please try again later.');
  }
}

export const otpService = {
  async sendPhoneOtp(userId: string, input: { phone: string; purpose: PhoneOtpPurpose }): Promise<{ expiresInSeconds: number }> {
    const phone = normalizePhone(input.phone);
    const now = new Date();
    const existing = await PhoneOtpModel.findOne({ userId, phone, purpose: input.purpose })
      .select('+otpHash')
      .exec();

    if (existing) {
      const sinceLastSend = now.getTime() - existing.lastSentAt.getTime();
      if (sinceLastSend < RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - sinceLastSend) / 1000);
        throw new TooManyRequestsError(`Please wait ${waitSeconds} second(s) before requesting another OTP.`);
      }
      if (existing.sendCount >= MAX_SENDS_PER_WINDOW && existing.cleanupAt.getTime() > now.getTime()) {
        throw new TooManyRequestsError('Too many OTP requests. Please try again later.');
      }
    }

    const devBypassOtp = getDevBypassOtp();
    const otp = devBypassOtp ?? generateOtp();
    if (!devBypassOtp) {
      await sendViaMsg91(phone, otp);
    } else {
      logger.info('[otp] Development OTP bypass enabled; MSG91 send skipped.', {
        userId,
        phone,
        purpose: input.purpose,
      });
    }

    const expiresAt = new Date(now.getTime() + config.MSG91_OTP_EXPIRY_MINUTES * 60_000);
    const nextSendCount = existing && existing.cleanupAt.getTime() > now.getTime() ? existing.sendCount + 1 : 1;
    await PhoneOtpModel.findOneAndUpdate(
      { userId, phone, purpose: input.purpose },
      {
        $set: {
          otpHash: hashOtp(phone, input.purpose, otp),
          expiresAt,
          attempts: 0,
          sendCount: nextSendCount,
          lastSentAt: now,
          cleanupAt: new Date(now.getTime() + CLEANUP_BUFFER_MS),
        },
        $unset: {
          verifiedAt: '',
          verifiedUntil: '',
        },
        $setOnInsert: {
          userId: new mongoose.Types.ObjectId(userId),
          phone,
          purpose: input.purpose,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    return { expiresInSeconds: config.MSG91_OTP_EXPIRY_MINUTES * 60 };
  },

  async verifyPhoneOtp(userId: string, input: { phone: string; purpose: PhoneOtpPurpose; code: string }): Promise<void> {
    const phone = normalizePhone(input.phone);
    const now = new Date();
    const record = await PhoneOtpModel.findOne({ userId, phone, purpose: input.purpose })
      .select('+otpHash')
      .exec();

    if (!record && !isDevBypassCode(input.code)) {
      throw new ValidationError('Request an OTP before verifying this phone number.');
    }

    if (record && record.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new TooManyRequestsError('Too many incorrect OTP attempts. Request a new OTP.');
    }

    if (record && record.expiresAt.getTime() < now.getTime()) {
      throw new ValidationError('OTP expired. Request a new OTP.');
    }

    const expectedHash = hashOtp(phone, input.purpose, input.code);
    const matches = record ? crypto.timingSafeEqual(Buffer.from(record.otpHash), Buffer.from(expectedHash)) : false;

    if (!matches && !isDevBypassCode(input.code)) {
      if (record) {
        record.attempts += 1;
        await record.save();
      }
      throw new ValidationError('Invalid OTP. Please check the code and try again.');
    }

    const verifiedUntil = new Date(now.getTime() + VERIFIED_WINDOW_MS);
    await PhoneOtpModel.findOneAndUpdate(
      { userId, phone, purpose: input.purpose },
      {
        $set: {
          userId: new mongoose.Types.ObjectId(userId),
          phone,
          purpose: input.purpose,
          otpHash: record?.otpHash ?? hashOtp(phone, input.purpose, input.code),
          expiresAt: record?.expiresAt ?? now,
          verifiedAt: now,
          verifiedUntil,
          cleanupAt: new Date(verifiedUntil.getTime() + CLEANUP_BUFFER_MS),
          lastSentAt: record?.lastSentAt ?? now,
        },
        $setOnInsert: {
          sendCount: 1,
          attempts: 0,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();
  },

  async isPhoneVerified(userId: string, phoneInput: string, purpose: PhoneOtpPurpose): Promise<boolean> {
    const phone = normalizePhone(phoneInput);
    const record = await PhoneOtpModel.findOne({
      userId,
      phone,
      purpose,
      verifiedUntil: { $gt: new Date() },
    })
      .select('_id')
      .lean();
    return !!record;
  },

  async assertPhoneVerified(userId: string, phone: string, purpose: PhoneOtpPurpose): Promise<void> {
    if (getDevBypassOtp()) {
      logger.info('[otp] Development OTP bypass enabled; submit verification check skipped.', {
        userId,
        phone: normalizePhone(phone),
        purpose,
      });
      return;
    }

    const verified = await this.isPhoneVerified(userId, phone, purpose);
    if (!verified) {
      throw new ValidationError('Verify your phone number with OTP before submitting organization details.');
    }
  },
};
