import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import ManagePortalSession from '../models/ManagePortalSession.js';
import Request from '../models/Request.js';
import { evaluateServicePeriodAccess } from '../utils/servicePeriodAccess.js';

const JWT_SECRET = process.env.PROVISION_ACCESS_TOKEN_SECRET || 'dev-secret';

function createPortalError(message, statusCode = 401) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function generatePortalCredentials() {
  const username = `admin-${crypto.randomBytes(4).toString('hex')}`;
  const password = `Rk!${crypto.randomBytes(8).toString('base64url')}9a`;
  return { username, password };
}

function hashPassword(password) {
  return crypto.createHmac('sha256', JWT_SECRET).update(password).digest('hex');
}

function normalizeLoginId(value) {
  return String(value || '').trim().toLowerCase();
}

async function getPortalTokenSession(token) {
  const session = await ManagePortalSession.findOne({ token });
  if (!session) {
    throw createPortalError('Invalid or expired access link.');
  }
  if (new Date() > session.expiresAt) {
    throw createPortalError('Access link expired.');
  }
  return session;
}

async function verifyAdminCredentials(token, username, password) {
  const session = await getPortalTokenSession(token);

  if (session.username !== username) {
    throw createPortalError('Invalid username or password.');
  }

  const passwordHash = hashPassword(password);
  if (passwordHash !== session.passwordHash) {
    throw createPortalError('Invalid username or password.');
  }

  return session;
}

async function verifyLabUserCredentials(requestId, username, password) {
  const loginId = normalizeLoginId(username);
  if (!loginId || !password) {
    throw createPortalError('Username and password are required.', 400);
  }

  const request = await Request.findById(requestId);
  if (!request) {
    throw createPortalError('Request not found.', 404);
  }

  const accessType = request.accessType || 'cloud_identity';
  if (accessType !== 'cloud_identity') {
    throw createPortalError('Invalid username or password.');
  }

  const identityUser = (request.identityUsers || []).find((entry) => {
    const index = Number(entry.userIndex) + 1;
    const candidates = [
      entry.username,
      entry.email?.split('@')[0],
      `labuser${index}`,
      `testlab${index}`,
    ]
      .map(normalizeLoginId)
      .filter(Boolean);
    return candidates.includes(loginId);
  });

  if (!identityUser || String(identityUser.password) !== String(password)) {
    throw createPortalError('Invalid username or password.');
  }

  if (identityUser.suspended) {
    throw createPortalError('This account is suspended and cannot sign in.', 403);
  }

  return {
    userIndex: identityUser.userIndex,
    username: identityUser.username || `labuser${identityUser.userIndex + 1}`,
  };
}

async function resolvePortalActor(token, username, password) {
  try {
    const session = await verifyAdminCredentials(token, username, password);
    return {
      role: 'admin',
      session,
      userIndex: null,
      username: session.username,
    };
  } catch (adminError) {
    if (adminError.statusCode && adminError.statusCode !== 401) {
      throw adminError;
    }

    const session = await getPortalTokenSession(token);
    const labUser = await verifyLabUserCredentials(session.requestId, username, password);

    return {
      role: 'user',
      session,
      userIndex: labUser.userIndex,
      username: labUser.username,
    };
  }
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
  const actor = await resolvePortalActor(token, username, password);

  const jwt_token = jwt.sign(
    {
      requestId: String(actor.session.requestId),
      username: actor.username,
      role: actor.role,
      userIndex: actor.userIndex,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    jwt_token,
    requestId: actor.session.requestId,
    customerEmail: actor.session.customerEmail,
    role: actor.role,
    userIndex: actor.userIndex,
    username: actor.username,
  };
}

function buildIdentityUserEntry(user, servicePeriod) {
  const blocked = user.suspended || !servicePeriod.allowed;

  return {
    userIndex: user.userIndex,
    username: user.username,
    email: user.email,
    roleName: user.username,
    gcpProjectId: user.gcpProjectId,
    consoleUrl: blocked ? null : user.consoleUrl || 'https://console.cloud.google.com/',
    password: blocked ? null : user.password,
    suspended: user.suspended || false,
    budgetExceeded: user.budgetExceeded || false,
    spendUsd: user.currentSpend || 0,
    needsActivation: false,
    servicePeriodBlocked: !servicePeriod.allowed,
    servicePeriodMessage: servicePeriod.allowed ? null : servicePeriod.message,
  };
}

export async function getManagePortalData(requestId, { role = 'admin', userIndex = null } = {}) {
  const request = await Request.findById(requestId);
  if (!request) throw new Error('Request not found');

  const servicePeriod = evaluateServicePeriodAccess(request);
  const accessType = request.accessType || 'cloud_identity';

  let consoleUrls = (request.identityUsers || []).map((user) =>
    buildIdentityUserEntry(user, servicePeriod)
  );

  if (role === 'user' && userIndex != null) {
    consoleUrls = consoleUrls.filter((entry) => Number(entry.userIndex) === Number(userIndex));
  }

  return {
    requestId,
    customerEmail: request.customerEmail,
    region: request.region,
    gcpProjectId: request.gcpProjectId,
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
    role,
  };
}
