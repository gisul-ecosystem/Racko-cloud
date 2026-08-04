import express from 'express';
import { getLabTemplateById, listActiveLabTemplates } from '../services/labTemplateService.js';

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const labs = await listActiveLabTemplates();
    res.status(200).json({
      success: true,
      message: 'Lab templates loaded.',
      data: { labs },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const lab = await getLabTemplateById(req.params.id);
    if (!lab) {
      res.status(404).json({
        success: false,
        message: 'Lab template not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Lab template loaded.',
      data: { lab },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
