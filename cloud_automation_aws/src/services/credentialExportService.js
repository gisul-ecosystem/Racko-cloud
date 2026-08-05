import mongoose from 'mongoose';
import Request from '../models/Request.js';
import ManagePortalSession from '../models/ManagePortalSession.js';
import { resolvePortalBaseUrl } from '../utils/portalUrl.js';
import {
  buildAwsCredentialSpreadsheet,
  buildAwsLabAccessGuide
} from './email/credentialAttachmentService.js';

function validationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function loadRequestForExport(requestId) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw validationError('Invalid request id');
  }

  const request = await Request.findById(requestId).lean();
  if (!request) {
    throw validationError('Request not found', 404);
  }

  if (!request.credentialsSent && request.status !== 'Completed') {
    throw validationError(
      'Credentials are not ready yet. Wait until provisioning finishes and access email is sent.',
      409
    );
  }

  return request;
}

async function buildExportContext(request) {
  const isMagicLink = String(request.accessType || '').toLowerCase() === 'magic_link';
  const portalSession = await ManagePortalSession.findOne({ requestId: request._id })
    .sort({ createdAt: -1 })
    .lean();

  let portalUrl = null;
  if (portalSession?.token) {
    const portalBase = await resolvePortalBaseUrl({
      portalBaseUrl: request.portalBaseUrl,
      ownerId: request.createdBy
    });
    portalUrl = `${portalBase}/manage-users/aws?token=${portalSession.token}`;
  }

  return {
    awsAccountId: request.awsAccountId || null,
    labRoles: request.labRoles || [],
    identityUsers: request.identityUsers || [],
    portalSession: portalSession
      ? {
          username: portalSession.username,
          // Password is hashed at rest — Excel re-download omits it; original email had it.
          password: ''
        }
      : null,
    portalUrl,
    portalExpiresAt: portalSession?.expiresAt || null,
    isMagicLink,
    accessType: request.accessType,
    allowedServices: (request.selectedServices || []).map((entry) => entry.serviceName)
  };
}

export async function downloadCredentialSpreadsheetForRequest(requestId) {
  const request = await loadRequestForExport(requestId);
  const context = await buildExportContext(request);
  return buildAwsCredentialSpreadsheet(request, context);
}

export async function downloadLabAccessGuideForRequest(requestId) {
  const request = await loadRequestForExport(requestId);
  const context = await buildExportContext(request);
  return buildAwsLabAccessGuide(request, context);
}

export function attachmentsAvailable(request) {
  return Boolean(request?.credentialsSent || request?.status === 'Completed');
}
