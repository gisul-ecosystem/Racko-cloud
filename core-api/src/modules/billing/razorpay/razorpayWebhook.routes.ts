import { Router } from 'express';
import { handleRazorpayWebhook } from './webhookHandler';

const router = Router();

router.post('/', (req, res) => {
  void handleRazorpayWebhook(req, res);
});

export default router;
