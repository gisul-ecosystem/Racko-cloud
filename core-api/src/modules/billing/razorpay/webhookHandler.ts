import crypto from 'crypto';
import type { Request, Response } from 'express';
import { config } from '../../../config';
import { WebhookEvent } from '../../../models/webhookEvent.model';
import { walletService } from '../../wallet/wallet.service';
import { logger } from '../../../utils/logger';

interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        amount?: number;
        notes?: Record<string, string>;
      };
    };
  };
}

function verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!config.RAZORPAY_WEBHOOK_SECRET || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
  const rawBody = req.body as Buffer;
  const signature = req.headers['x-razorpay-signature'] as string | undefined;

  // Enhanced logging for debugging
  logger.info('Razorpay webhook received', {
    hasSignature: !!signature,
    bodyLength: rawBody.length,
    headers: req.headers,
  });

  if (!verifySignature(rawBody, signature)) {
    logger.error('Invalid webhook signature', { signature, hasSecret: !!config.RAZORPAY_WEBHOOK_SECRET });
    res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
    return;
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookBody;
    logger.info('Webhook payload parsed', { 
      event: body.event, 
      paymentId: body.payload?.payment?.entity?.id,
      amount: body.payload?.payment?.entity?.amount,
      notes: body.payload?.payment?.entity?.notes
    });
  } catch {
    logger.error('Invalid webhook payload', { rawBody: rawBody.toString('utf8').substring(0, 200) });
    res.status(400).json({ success: false, message: 'Invalid webhook payload.' });
    return;
  }

  const payment = body.payload?.payment?.entity;
  const eventName = body.event ?? 'unknown';
  const paymentId = payment?.id ?? 'unknown';
  const eventId = `${eventName}:${paymentId}`;

  try {
    await WebhookEvent.create({ eventId });
    logger.info('Webhook event recorded successfully', { eventId });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('duplicate key')) {
      logger.warn('Duplicate webhook event detected', { eventId });
      res.status(200).json({ success: true, message: 'Already processed.' });
      return;
    }
    logger.error('Failed to record webhook event', { eventId, error });
    res.status(200).json({ success: true, message: 'Recorded with errors.' });
    return;
  }

  if (eventName === 'payment.captured' && payment) {
    const notes = payment.notes ?? {};
    logger.info('Processing payment.captured event', {
      eventId,
      tenantId: notes['tenantId'],
      userId: notes['userId'],
      purpose: notes['purpose'],
      amount: payment.amount,
    });

    // ── Tenant wallet top-up ──────────────────────────────────────────────
    if (notes['purpose'] === 'wallet_topup' && notes['tenantId'] && payment.amount) {
      try {
        const result = await walletService.creditWallet(
          notes['tenantId'],
          payment.amount / 100,
          'topup_razorpay',
          {
            source: 'razorpay',
            externalReference: payment.id ?? null,
          }
        );
        logger.info('Tenant wallet credited successfully', {
          eventId,
          tenantId: notes['tenantId'],
          amount: payment.amount / 100,
          newBalance: result.balance,
          transactionId: result.transactionId,
        });
      } catch (error) {
        logger.error('Failed to credit tenant wallet from Razorpay webhook', {
          eventId,
          tenantId: notes['tenantId'],
          amount: payment.amount,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // ── Admin wallet top-up ───────────────────────────────────────────────
    else if (notes['purpose'] === 'admin_wallet_topup' && notes['userId'] && payment.amount) {
      try {
        const { adminBillingService } = await import('../../adminBilling/adminBilling.service');
        await adminBillingService.creditWallet(
          notes['userId'],
          payment.amount / 100,
          notes['userId'],   // creditedBy = self (razorpay payment)
          'razorpay_topup'
        );
        logger.info('Admin wallet credited successfully via Razorpay', {
          eventId,
          userId: notes['userId'],
          amount: payment.amount / 100,
        });
      } catch (error) {
        logger.error('Failed to credit admin wallet from Razorpay webhook', {
          eventId,
          userId: notes['userId'],
          amount: payment.amount,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    else {
      logger.warn('Payment event conditions not met', {
        eventId,
        purpose: notes['purpose'],
        hasTenantId: !!notes['tenantId'],
        hasUserId: !!notes['userId'],
        hasAmount: !!payment.amount,
      });
    }
  } else {
    logger.info('Ignoring webhook event', { eventName, hasPayment: !!payment });
  }

  res.status(200).json({ success: true, message: 'Webhook processed.' });
}
