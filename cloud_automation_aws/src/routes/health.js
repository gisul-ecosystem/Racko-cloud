import { Router } from 'express';
import { SSO_REGION, validateIdentityCenterConfig } from '../config/aws.js';

const router = Router();

router.get('/', async (req, res) => {
  const identityCenter = await validateIdentityCenterConfig();

  res.status(200).json({
    success: true,
    message: 'Cloud Automation AWS API is running.',
    region: process.env.AWS_REGION,
    ssoRegion: SSO_REGION,
    identityCenter,
    timestamp: new Date().toISOString()
  });
});

export default router;
