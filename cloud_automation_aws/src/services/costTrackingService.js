import { GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { costExplorerClient } from '../config/aws.js';
import UserSpend from '../models/UserSpend.js';
import Request from '../models/Request.js';

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export async function fetchUserSpend(username, startDate, endDate) {
  const command = new GetCostAndUsageCommand({
    TimePeriod: {
      Start: formatDate(startDate),
      End: formatDate(endDate),
    },
    Granularity: 'DAILY',
    Filter: {
      Tags: {
        Key: 'racko:user',
        Values: [username],
      },
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
  if (!request || request.status !== 'Completed') return;

  const today = formatDate(new Date());
  const startDate = new Date(request.startDate);
  const endDate = new Date();

  const results = [];

  for (const role of request.labRoles || []) {
    const username = `labuser${role.userIndex + 1}`;
    const spend = await fetchUserSpend(username, startDate, endDate);

    await UserSpend.findOneAndUpdate(
      { requestId, username, date: today },
      {
        requestId,
        username,
        userId: String(role.userIndex),
        date: today,
        spendUsd: spend.totalSpend,
        services: spend.services,
        budgetExceeded: Boolean(role.budgetExceeded),
        syncedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await Request.findOneAndUpdate(
      { _id: requestId, 'labRoles.userIndex': role.userIndex },
      { $set: { 'labRoles.$.currentSpend': spend.totalSpend } }
    );

    results.push({
      username,
      spendUsd: spend.totalSpend,
      services: spend.services,
    });
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

  const spendByUsername = new Map(
    spendRecords.map((record) => [record.username, record.toObject()])
  );

  return (request.labRoles || []).map((role) => {
    const username = `labuser${role.userIndex + 1}`;
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
