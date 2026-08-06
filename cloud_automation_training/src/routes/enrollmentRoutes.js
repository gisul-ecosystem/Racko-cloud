import express from 'express';
import { createLabEnrollment } from '../services/enrollmentService.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const {
      templateId,
      learnerEmail,
      accountCount,
      selectedInstances,
      projectName,
      startDate,
      endDate,
      azureRequestId,
    } = req.body || {};

    if (!templateId) {
      res.status(400).json({ success: false, message: 'templateId is required.' });
      return;
    }
    if (!learnerEmail || !String(learnerEmail).includes('@')) {
      res.status(400).json({ success: false, message: 'A valid learnerEmail is required.' });
      return;
    }
    const count = Number(accountCount);
    if (!Number.isInteger(count) || count <= 0) {
      res.status(400).json({ success: false, message: 'accountCount must be a positive integer.' });
      return;
    }
    if (!Array.isArray(selectedInstances) || selectedInstances.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Select at least one instance/resource for the lab.',
      });
      return;
    }

    const enrollment = await createLabEnrollment({
      templateId,
      learnerEmail: String(learnerEmail).trim(),
      accountCount: count,
      selectedInstances,
      projectName: projectName ? String(projectName).trim() : '',
      startDate,
      endDate,
      azureRequestId,
    });

    res.status(201).json({
      success: true,
      message:
        'Lab enrollment created. Azure accounts and lab permissions will be provisioned; credentials are emailed with the manage portal link.',
      data: { enrollment },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
