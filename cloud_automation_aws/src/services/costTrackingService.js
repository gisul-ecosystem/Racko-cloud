import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  UpdateCostAllocationTagsStatusCommand,
} from '@aws-sdk/client-cost-explorer';
import { AssumeRoleCommand } from '@aws-sdk/client-sts';
import { costExplorerClient, stsClient } from '../config/aws.js';
import UserSpend from '../models/UserSpend.js';
import Request from '../models/Request.js';

const LAB_ADMIN_ROLE_NAME = process.env.RACKO_LAB_ADMIN_ROLE_NAME || 'RackoLabAdmin';
const COST_ALLOCATION_TAG_KEYS = ['racko:request', 'racko:user-index', 'racko:user', 'racko:managed'];

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getCostExplorerClient(credentials = null) {
  if (credentials) {
    return new CostExplorerClient({
      region: 'us-east-1',
      credentials,
    });
  }

  return costExplorerClient;
}

function parseUserIndexFromGroupKey(groupKey = '') {
  const value = String(groupKey).replace(/^racko:user-index\$/, '').trim();
  return value || 'untagged';
}

function resolveUsernameForUserIndex(request, userIndex, accessType) {
  if (accessType === 'identity_center') {
    const user = request.identityUsers?.find((entry) => entry.userIndex === userIndex);
    return user?.username || `rackolab${userIndex + 1}-${String(request._id).slice(-6)}`;
  }

  return `labuser${userIndex + 1}`;
}

export async function activateCostAllocationTags(accountId) {
  try {
    const roleArn = `arn:aws:iam::${accountId}:role/${LAB_ADMIN_ROLE_NAME}`;
    const { Credentials } = await stsClient.send(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: 'RackoCostSetup',
        DurationSeconds: 900,
      })
    );

    if (!Credentials) {
      throw new Error(`Failed to assume ${roleArn}`);
    }

    const ce = getCostExplorerClient({
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
    });

    await ce.send(
      new UpdateCostAllocationTagsStatusCommand({
        CostAllocationTagsStatus: COST_ALLOCATION_TAG_KEYS.map((TagKey) => ({
          TagKey,
          Status: 'Active',
        })),
      })
    );

    console.log(`[CostTracking] Cost allocation tags activated for account ${accountId}`);
    return true;
  } catch (err) {
    if (err.message?.includes('not authorized') || err.name === 'AccessDeniedException') {
      console.warn(`[CostTracking] Account ${accountId}: IAM billing access not enabled.`);
      console.warn(
        '[CostTracking] Fix: Log in as ROOT → Account Settings → IAM User and Role Access to Billing → Activate'
      );
      return false;
    }

    console.error(`[CostTracking] Failed to activate tags for ${accountId}:`, err.message);
    return false;
  }
}

export async function fetchRequestSpend(request) {
  const startDate = new Date(request.startDate || request.createdAt || Date.now());
  const start = formatDate(startDate);
  const end = formatDate(addDays(new Date(), 1));

  if (start >= end) {
    return {};
  }

  try {
    const { ResultsByTime } = await costExplorerClient.send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: start, End: end },
        Granularity: 'DAILY',
        Filter: {
          Tags: {
            Key: 'racko:request',
            Values: [String(request._id)],
            MatchOptions: ['EQUALS'],
          },
        },
        GroupBy: [{ Type: 'TAG', Key: 'racko:user-index' }],
        Metrics: ['UnblendedCost'],
      })
    );

    const userSpend = {};

    for (const day of ResultsByTime || []) {
      for (const group of day.Groups || []) {
        const userIndex = parseUserIndexFromGroupKey(group.Keys?.[0] || '');
        const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || 0);
        userSpend[userIndex] = (userSpend[userIndex] || 0) + amount;
      }
    }

    return userSpend;
  } catch (err) {
    console.error(`[CostTracking] Failed to fetch spend for request ${request._id}:`, err.message);
    return {};
  }
}

async function applySpendToRequestDocument(request, spend) {
  const accessType = request.accessType || 'magic_link';
  const budgetUsd = request.perUserBudgetUsd;

  if (accessType === 'magic_link' && request.labRoles?.length) {
    for (const role of request.labRoles) {
      const tagIndex = String(role.userIndex + 1);
      const amount = spend[tagIndex] ?? spend[String(role.userIndex)] ?? 0;
      role.currentSpend = parseFloat(amount.toFixed(4));
      if (budgetUsd && role.currentSpend >= budgetUsd) {
        role.budgetExceeded = true;
      }
    }
  } else if (request.identityUsers?.length) {
    for (const user of request.identityUsers) {
      const tagIndex = String(user.userIndex + 1);
      const amount = spend[tagIndex] ?? spend[String(user.userIndex)] ?? 0;
      user.currentSpend = parseFloat(amount.toFixed(4));
      if (budgetUsd && user.currentSpend >= budgetUsd) {
        user.budgetExceeded = true;
      }
    }
  }

  request.totalSpend = parseFloat(
    Object.values(spend).reduce((sum, value) => sum + value, 0).toFixed(4)
  );
  request.spendLastUpdated = new Date();
}

async function syncUserSpendRecords(request, spend) {
  const today = formatDate(new Date());
  const accessType = request.accessType || 'magic_link';
  const requestId = String(request._id);
  const users =
    accessType === 'magic_link'
      ? (request.labRoles || []).map((role) => ({
          userIndex: role.userIndex,
          username: resolveUsernameForUserIndex(request, role.userIndex, accessType),
        }))
      : (request.identityUsers || []).map((user) => ({
          userIndex: user.userIndex,
          username: user.username,
        }));

  for (const user of users) {
    const tagIndex = String(user.userIndex + 1);
    const spendUsd = spend[tagIndex] ?? spend[String(user.userIndex)] ?? 0;

    await UserSpend.findOneAndUpdate(
      { requestId, username: user.username, date: today },
      {
        requestId,
        username: user.username,
        userId: String(user.userIndex),
        date: today,
        spendUsd: parseFloat(spendUsd.toFixed(4)),
        services: [],
        syncedAt: new Date(),
      },
      { upsert: true, new: true }
    );
  }
}

export async function updateRequestSpend(requestId) {
  const request = await Request.findById(requestId);
  if (!request) return {};

  const spend = await fetchRequestSpend(request);
  await applySpendToRequestDocument(request, spend);
  await request.save();
  await syncUserSpendRecords(request, spend);

  console.log(`[CostTracking] Updated spend for request ${requestId}:`, spend);
  return spend;
}

export async function fetchFinalSpend(request) {
  console.log(`[CostTracking] Fetching final spend for request ${request._id} before teardown`);

  const spend = await fetchRequestSpend(request);
  request.finalSpend = spend;
  request.totalFinalSpend = parseFloat(
    Object.values(spend).reduce((sum, value) => sum + value, 0).toFixed(4)
  );
  request.spendLastUpdated = new Date();
  await request.save();

  return spend;
}

export async function fetchUserSpend(username, requestId, startDate, endDate, accessType = 'magic_link') {
  const tagKey = 'racko:request';
  const tagValue = String(requestId);

  const command = new GetCostAndUsageCommand({
    TimePeriod: {
      Start: formatDate(startDate),
      End: formatDate(endDate),
    },
    Granularity: 'DAILY',
    Filter: {
      Tags: { Key: tagKey, Values: [tagValue] },
    },
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
    Metrics: ['UnblendedCost'],
  });

  try {
    const response = await costExplorerClient.send(command);
    const results = response.ResultsByTime || [];

    let totalSpend = 0;
    const serviceBreakdown = {};

    for (const result of results) {
      for (const group of result.Groups || []) {
        const serviceName = group.Keys?.[0] || 'Unknown';
        const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || 0);
        totalSpend += amount;
        serviceBreakdown[serviceName] = (serviceBreakdown[serviceName] || 0) + amount;
      }
    }

    return {
      username,
      totalSpend: parseFloat(totalSpend.toFixed(4)),
      services: Object.entries(serviceBreakdown)
        .map(([serviceName, spendUsd]) => ({
          serviceName,
          spendUsd: parseFloat(spendUsd.toFixed(4)),
        }))
        .sort((a, b) => b.spendUsd - a.spendUsd),
    };
  } catch (err) {
    console.warn(`[CostTracking] No cost data for ${username}:`, err.message);
    return { username, totalSpend: 0, services: [] };
  }
}

export async function syncRequestUserSpend(requestId) {
  const spend = await updateRequestSpend(requestId);
  const request = await Request.findById(requestId);
  if (!request) return [];

  const accessType = request.accessType || 'magic_link';
  const users =
    accessType === 'magic_link'
      ? (request.labRoles || []).map((role) => ({
          userIndex: role.userIndex,
          username: resolveUsernameForUserIndex(request, role.userIndex, accessType),
          currentSpend: role.currentSpend,
        }))
      : (request.identityUsers || []).map((user) => ({
          userIndex: user.userIndex,
          username: user.username,
          currentSpend: user.currentSpend,
        }));

  return users.map((user) => ({
    username: user.username,
    spendUsd: user.currentSpend ?? spend[String(user.userIndex + 1)] ?? 0,
    services: [],
  }));
}

export async function getAllUsersSpend(requestId) {
  const today = formatDate(new Date());
  const [request, spendRecords] = await Promise.all([
    Request.findById(requestId),
    UserSpend.find({ requestId, date: today }).sort({ spendUsd: -1 }),
  ]);

  if (!request) return [];

  const accessType = request.accessType || 'magic_link';
  const spendByUsername = new Map(
    spendRecords.map((record) => [record.username, record.toObject()])
  );

  const users =
    accessType === 'magic_link'
      ? (request.labRoles || []).map((role) => ({
          role,
          username: resolveUsernameForUserIndex(request, role.userIndex, accessType),
        }))
      : (request.identityUsers || []).map((user) => ({
          role: user,
          username: user.username,
        }));

  return users.map(({ role, username }) => {
    const record = spendByUsername.get(username);
    return {
      username,
      userId: String(role.userIndex),
      spendUsd: record?.spendUsd ?? role.currentSpend ?? 0,
      services: record?.services ?? [],
      budgetExceeded: Boolean(role.budgetExceeded),
      suspended: Boolean(role.suspended),
      syncedAt: record?.syncedAt ?? request.spendLastUpdated ?? null,
    };
  });
}
