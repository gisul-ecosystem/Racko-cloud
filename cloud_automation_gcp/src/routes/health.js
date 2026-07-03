import express from 'express';
import {
  GCP_PROJECT_ID,
  GCP_ORGANIZATION_ID,
  GCP_DEFAULT_REGION,
} from '../config/gcp.js';

const router = express.Router();

router.get('/', async (req, res) => {
  res.json({
    success:        true,
    message:        'Cloud Automation GCP API is running.',
    projectId:      GCP_PROJECT_ID,
    organizationId: GCP_ORGANIZATION_ID,
    region:         GCP_DEFAULT_REGION,
    timestamp:      new Date().toISOString(),
  });
});

export default router;
