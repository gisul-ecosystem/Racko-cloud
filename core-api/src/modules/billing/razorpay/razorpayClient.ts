import Razorpay from 'razorpay';
import { config } from '../../../config';
import { AppError } from '../../../utils/errors';

function getRazorpayClient(): Razorpay {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
    throw new AppError('Razorpay is not configured.', 503, 'SERVICE_UNAVAILABLE');
  }

  return new Razorpay({
    key_id: config.RAZORPAY_KEY_ID,
    key_secret: config.RAZORPAY_KEY_SECRET,
  });
}

export async function createTopupOrder(
  tenantId: string,
  amount: number
): Promise<{
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
}> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Amount must be positive.', 400, 'VALIDATION_ERROR');
  }

  const client = getRazorpayClient();
  const order = await client.orders.create({
    amount: Math.round(amount * 100),
    currency: 'INR',
    notes: {
      tenantId,
      purpose: 'wallet_topup',
    },
  });

  return {
    razorpayOrderId: order.id,
    amount,
    currency: 'INR',
    keyId: config.RAZORPAY_KEY_ID,
  };
}
