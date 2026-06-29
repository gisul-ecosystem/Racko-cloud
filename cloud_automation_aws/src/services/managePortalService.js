import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import ManagePortalSession from '../models/ManagePortalSession.js';
import Request from '../models/Request.js';
import { evaluateServicePeriodAccess } from '../utils/servicePeriodAccess.js';

const JWT_SECRET = process.env.PROVISION_ACCESS_TOKEN_SECRET || 'dev-secret';

function generatePortalCredentials() {
  const username = `admin-${crypto.randomBytes(4).toString('hex')}`;
  const password = `Rk!${crypto.randomBytes(8).toString('base64url')}9a`;
  return { username, password };
}

function hashPassword(password) {
  return crypto.createHmac('sha256', JWT_SECRET).update(password).digest('hex');
}

export async function createManagePortalSession(request) {
  const { username, password } = generatePortalCredentials();
  const passwordHash = hashPassword(password);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(request.endDate);

  await ManagePortalSession.findOneAndUpdate(
    { requestId: request._id },
    {
      requestId: request._id,
      token,
      username,
      passwordHash,
      customerEmail: request.customerEmail,
      expiresAt,
    },
    { upsert: true, new: true }
  );

  return { username, password, token };
}

export async function verifyManagePortalLogin(token, username, password) {
  const session = await ManagePortalSession.findOne({ token });
  if (!session) throw new Error('Invalid session token');
  if (new Date() > session.expiresAt) throw new Error('Session expired');
  if (session.username !== username) throw new Error('Invalid credentials');

  const passwordHash = hashPassword(password);
  if (passwordHash !== session.passwordHash) throw new Error('Invalid credentials');

  const jwt_token = jwt.sign(
    { requestId: String(session.requestId), username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    jwt_token,
    requestId: session.requestId,
    customerEmail: session.customerEmail,
  };
}

function buildMagicLinkUserEntry(role, servicePeriod) {
  const username = `labuser${role.userIndex + 1}`;
  const base = {
    userIndex: role.userIndex,
    username,
    roleName: role.roleName,
    spendUsd: role.currentSpend || 0,
    budgetExceeded: role.budgetExceeded || false,
    suspended: role.suspended || false,
  };

  if (role.suspended) {
    return {
      ...base,
      consoleUrl: null,
      servicePeriodBlocked: !servicePeriod.allowed,
      servicePeriodMessage: servicePeriod.message,
    };
  }

  if (!servicePeriod.allowed) {
    return {
      ...base,
      consoleUrl: null,
      servicePeriodBlocked: true,
      servicePeriodMessage: servicePeriod.message,
    };
  }

  return {
    ...base,
    consoleUrl: null,
    servicePeriodBlocked: false,
    servicePeriodMessage: null,
  };
}

function buildIdentityCenterUserEntry(user, servicePeriod) {
  const blocked = user.suspended || !servicePeriod.allowed;

  return {
    userIndex: user.userIndex,
    username: user.username,
    email: user.email,
    roleName: user.username,
    accountId: user.accountId || user.awsAccountId,
    consoleUrl: blocked ? null : user.consoleUrl,
    password: blocked ? null : user.password,
    suspended: user.suspended || false,
    budgetExceeded: user.budgetExceeded || false,
    spendUsd: user.currentSpend || 0,
    needsActivation: false,
    servicePeriodBlocked: !servicePeriod.allowed,
    servicePeriodMessage: servicePeriod.allowed ? null : servicePeriod.message,
  };
}

export async function getManagePortalData(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw new Error('Request not found');

  const servicePeriod = evaluateServicePeriodAccess(request);
  const accessType = request.accessType || 'magic_link';
  const isMagicLink = accessType !== 'identity_center';

  const consoleUrls = isMagicLink
    ? (request.labRoles || []).map((role) => buildMagicLinkUserEntry(role, servicePeriod))
    : (request.identityUsers || []).map((user) => buildIdentityCenterUserEntry(user, servicePeriod));

  return {
    requestId,
    customerEmail: request.customerEmail,
    region: request.region,
    awsAccountId: request.awsAccountId,
    allowedServices: (request.selectedServices || []).map((service) => service.serviceName),
    accountCount: request.accountCount,
    startDate: request.startDate,
    endDate: request.endDate,
    status: request.status,
    accessType,
    perUserBudgetUsd: request.perUserBudgetUsd,
    cleanupEnabled: request.cleanupEnabled || false,
    cleanupIntervalHours: request.cleanupIntervalHours,
    servicePeriod,
    consoleUrls,
  };
}
