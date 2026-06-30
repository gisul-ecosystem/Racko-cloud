import { GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { costExplorerClient } from '../config/aws.js';
import UserSpend from '../models/UserSpend.js';
import Request from '../models/Request.js';

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export async function fetchUserSpend(username, requestId, startDate, endDate, accessType = 'magic_link') {
  const tagKey = accessType === 'magic_link' ? 'racko:user' : 'racko:request';
  const tagValue = accessType === 'magic_link' ? username : String(requestId);

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
    console.warn(`[costTracking] No cost data for ${username}:`, err.message);
    return { username, totalSpend: 0, services: [] };
  }
}

export async function syncRequestUserSpend(requestId) {
  const request = await Request.findById(requestId);
  if (!request || request.status !== 'Completed') return [];

  const today = formatDate(new Date());
  const startDate = new Date(request.startDate);
  const endDate = new Date();
  const accessType = request.accessType || 'magic_link';

  const users =
    accessType === 'magic_link'
      ? (request.labRoles || []).map((r) => ({
          userIndex: r.userIndex,
          username: `labuser${r.userIndex + 1}`,
        }))
      : (request.identityUsers || []).map((u) => ({
          userIndex: u.userIndex,
          username: u.username,
        }));

  const results = [];

  for (const user of users) {
    const spend = await fetchUserSpend(
      user.username,
      requestId,
      startDate,
      endDate,
      accessType
    );

    await UserSpend.findOneAndUpdate(
      { requestId, username: user.username, date: today },
      {
        requestId,
        username: user.username,
        userId: String(user.userIndex),
        date: today,
        spendUsd: spend.totalSpend,
        services: spend.services,
        syncedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    const field = accessType === 'magic_link' ? 'labRoles' : 'identityUsers';
    await Request.findOneAndUpdate(
      { _id: requestId, [`${field}.userIndex`]: user.userIndex },
      { $set: { [`${field}.$.currentSpend`]: spend.totalSpend } }
    );

    results.push({ username: user.username, spendUsd: spend.totalSpend, services: spend.services });
  }

  return results;
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
          username: `labuser${role.userIndex + 1}`,
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
      syncedAt: record?.syncedAt ?? null,
    };
  });
}
