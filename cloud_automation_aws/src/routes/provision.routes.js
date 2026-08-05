import { Router } from 'express';
import { retry, start, syncRolePolicies } from '../services/provisioningService.js';
import { getStatus } from '../services/provisionStatusService.js';
import { getRequestById } from '../services/requestService.js';
import {
  downloadCredentialSpreadsheetForRequest,
  downloadLabAccessGuideForRequest
} from '../services/credentialExportService.js';

const router = Router();

function getRackoActor(req) {
  const rackoUserId = String(req.headers['x-user-id'] || '').trim() || undefined;
  const role = String(req.headers['x-user-role'] || '').trim().toLowerCase();
  const isSuperAdmin = role === 'super_admin';
  return { rackoUserId, isSuperAdmin };
}

async function assertOwnedRequest(req, requestId) {
  await getRequestById(requestId, getRackoActor(req));
}

function sendBinaryFile(res, { filename, buffer, contentType }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', Buffer.byteLength(buffer));
  res.send(Buffer.from(buffer));
}

router.post('/provision/request/:id/start', async (req, res, next) => {
  try {
    await assertOwnedRequest(req, req.params.id);
    await start(req.params.id);
    res.status(202).json({ success: true, status: 'Provisioning' });
  } catch (err) {
    next(err);
  }
});

router.get('/provision/request/:id/status', async (req, res, next) => {
  try {
    await assertOwnedRequest(req, req.params.id);
    const status = await getStatus(req.params.id);
    res.json({ success: true, ...status });
  } catch (err) {
    next(err);
  }
});

router.post('/provision/request/:id/retry', async (req, res, next) => {
  try {
    await assertOwnedRequest(req, req.params.id);
    await retry(req.params.id);
    res.status(202).json({ success: true, status: 'Provisioning' });
  } catch (err) {
    next(err);
  }
});

router.post('/provision/request/:id/sync-policies', async (req, res, next) => {
  try {
    const result = await syncRolePolicies(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/provision/request/:id/credentials/spreadsheet', async (req, res, next) => {
  try {
    await assertOwnedRequest(req, req.params.id);
    const file = await downloadCredentialSpreadsheetForRequest(req.params.id);
    sendBinaryFile(res, file);
  } catch (err) {
    next(err);
  }
});

router.get('/provision/request/:id/credentials/guide', async (req, res, next) => {
  try {
    await assertOwnedRequest(req, req.params.id);
    const file = await downloadLabAccessGuideForRequest(req.params.id);
    sendBinaryFile(res, file);
  } catch (err) {
    next(err);
  }
});

export default router;
