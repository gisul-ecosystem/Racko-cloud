import {
  buildCredentialSpreadsheetBuffer,
  buildCredentialSpreadsheetFilename
} from './credentialExcelService.js';
import {
  buildAwsLabAccessGuideBuffer,
  buildAwsLabAccessGuideFilename
} from './awsLabAccessGuideService.js';

function resolveIsMagicLink({ request, isMagicLink, accessType }) {
  if (typeof isMagicLink === 'boolean') {
    return isMagicLink;
  }

  const normalized = String(accessType || request?.accessType || '')
    .trim()
    .toLowerCase();
  return normalized === 'magic_link';
}

function buildAttachmentContext(request, context = {}) {
  const isMagicLink = resolveIsMagicLink({
    request,
    isMagicLink: context.isMagicLink,
    accessType: context.accessType
  });

  const allowedServices =
    context.allowedServices ||
    (request.selectedServices || []).map((entry) => entry.serviceName);

  return {
    requestId: request._id || request.id,
    customerEmail: request.customerEmail,
    region: request.region,
    projectName: request.projectName || request.labName || '',
    accessType: request.accessType || context.accessType,
    costingMode: request.costingMode,
    endDate: request.endDate,
    awsAccountId: context.awsAccountId || request.awsAccountId || null,
    portalLink: context.portalUrl || null,
    portalExpiresAt: context.portalExpiresAt || null,
    adminCredentials: context.portalSession
      ? {
          username: context.portalSession.username,
          temporaryPassword: context.portalSession.password,
          password: context.portalSession.password
        }
      : null,
    allowedServices,
    isMagicLink,
    identityUsers: context.identityUsers || request.identityUsers || [],
    labRoles: context.labRoles || request.labRoles || []
  };
}

export async function buildAwsCredentialAttachments(request, context = {}) {
  const payload = buildAttachmentContext(request, context);
  const requestId = payload.requestId;

  const [excelBuffer, guideBuffer] = await Promise.all([
    Promise.resolve(buildCredentialSpreadsheetBuffer(payload)),
    buildAwsLabAccessGuideBuffer(payload)
  ]);

  return [
    {
      filename: buildCredentialSpreadsheetFilename(requestId),
      content: excelBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    },
    {
      filename: buildAwsLabAccessGuideFilename(requestId),
      content: guideBuffer,
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
  ];
}

export async function buildAwsCredentialSpreadsheet(request, context = {}) {
  const payload = buildAttachmentContext(request, context);
  return {
    filename: buildCredentialSpreadsheetFilename(payload.requestId),
    buffer: buildCredentialSpreadsheetBuffer(payload),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
}

export async function buildAwsLabAccessGuide(request, context = {}) {
  const payload = buildAttachmentContext(request, context);
  return {
    filename: buildAwsLabAccessGuideFilename(payload.requestId),
    buffer: await buildAwsLabAccessGuideBuffer(payload),
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
}
