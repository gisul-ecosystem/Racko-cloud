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

export async function getManagePortalData(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw new Error('Request not found');

  const servicePeriod = evaluateServicePeriodAccess(request);
  const labRoles = request.labRoles || [];
  const consoleUrls = [];

  for (const role of labRoles) {
    const username = `labuser${role.userIndex + 1}`;

    if (role.suspended) {
      consoleUrls.push({
        userIndex: role.userIndex,
        username,
        roleName: role.roleName,
        consoleUrl: null,
        suspended: true,
        servicePeriodBlocked: !servicePeriod.allowed,
        servicePeriodMessage: servicePeriod.message,
        spendUsd: role.currentSpend || 0,
        budgetExceeded: role.budgetExceeded || false,
      });
      continue;
    }

    if (!servicePeriod.allowed) {
      consoleUrls.push({
        userIndex: role.userIndex,
        username,
        roleName: role.roleName,
        consoleUrl: null,
        suspended: false,
        servicePeriodBlocked: true,
        servicePeriodMessage: servicePeriod.message,
        spendUsd: role.currentSpend || 0,
        budgetExceeded: role.budgetExceeded || false,
      });
      continue;
    }

    consoleUrls.push({
      userIndex: role.userIndex,
      username,
      roleName: role.roleName,
      consoleUrl: null,
      suspended: false,
      servicePeriodBlocked: false,
      servicePeriodMessage: null,
      spendUsd: role.currentSpend || 0,
      budgetExceeded: role.budgetExceeded || false,
    });
  }

  return {
    requestId,
    customerEmail: request.customerEmail,
    region: request.region,
    awsAccountId: request.awsAccountId,
    allowedServices: (request.selectedServices || []).map((s) => s.serviceName),
    accountCount: request.accountCount,
    startDate: request.startDate,
    endDate: request.endDate,
    status: request.status,
    perUserBudgetUsd: request.perUserBudgetUsd,
    cleanupEnabled: request.cleanupEnabled || false,
    cleanupIntervalHours: request.cleanupIntervalHours,
    servicePeriod,
    consoleUrls,
  };
}
