import { Router } from 'express';
import { handleRazorpayWebhook } from './webhookHandler';

const router = Router();

// Test endpoint to verify webhook reception
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Webhook endpoint is accessible',
    timestamp: new Date().toISOString()
  });
});

// Manual test endpoint for wallet crediting (development only)
router.post('/test-credit', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }

  try {
    const { tenantId, amount } = req.body;
    if (!tenantId || !amount) {
      res.status(400).json({ success: false, message: 'tenantId and amount required' });
      return;
    }

    const { walletService } = await import('../../wallet/wallet.service');
    const result = await walletService.creditWallet(
      tenantId,
      amount,
      'test_topup',
      {
        source: 'manual',
        externalReference: `test_${Date.now()}`,
      }
    );

    res.json({
      success: true,
      message: 'Test credit successful',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/', (req, res) => {
  void handleRazorpayWebhook(req, res);
});

export default router;
