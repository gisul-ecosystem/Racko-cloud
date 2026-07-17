import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'cloud-automation-reseller',
    providers: ['aws', 'azure'],
  });
});

export default router;
