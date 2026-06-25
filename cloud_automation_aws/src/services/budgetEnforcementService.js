import Request from '../models/Request.js';
import BudgetEvent from '../models/BudgetEvent.js';
import UserSpend from '../models/UserSpend.js';

function labUsername(userIndex) {
  return `labuser${userIndex + 1}`;
}

export async function suspendUser(request, role) {
  const username = labUsername(role.userIndex);

  await Request.findOneAndUpdate(
    { _id: request._id, 'labRoles.userIndex': role.userIndex },
    {
      $set: {
        'labRoles.$.budgetExceeded': true,
        'labRoles.$.suspended': true,
      },
    }
  );

  await BudgetEvent.create({
    requestId: request._id,
    username,
    userId: String(role.userIndex),
    spendUsd: role.currentSpend || 0,
    budgetUsd: request.perUserBudgetUsd,
    action: 'suspended',
    reason: 'Budget exceeded',
  });

  console.log(`[budgetEnforcement] Suspended user ${username} — budget exceeded`);
}

export async function reinstateUser(request, role) {
  const username = labUsername(role.userIndex);

  await Request.findOneAndUpdate(
    { _id: request._id, 'labRoles.userIndex': role.userIndex },
    {
      $set: {
        'labRoles.$.budgetExceeded': false,
        'labRoles.$.suspended': false,
      },
    }
  );

  await BudgetEvent.create({
    requestId: request._id,
    username,
    userId: String(role.userIndex),
    spendUsd: 0,
    budgetUsd: request.perUserBudgetUsd,
    action: 'reinstated',
    reason: 'Budget renewed by admin',
  });

  console.log(`[budgetEnforcement] Reinstated user ${username}`);
}

export async function checkAndEnforceBudgets() {
  const requests = await Request.find({
    status: 'Completed',
    perUserBudgetUsd: { $gt: 0 },
  });

  for (const request of requests) {
    for (const role of request.labRoles || []) {
      const username = labUsername(role.userIndex);
      const today = new Date().toISOString().split('T')[0];
      const spendRecord = await UserSpend.findOne({
        requestId: request._id,
        username,
        date: today,
      });

      const currentSpend = spendRecord?.spendUsd || 0;
      role.currentSpend = currentSpend;

      if (currentSpend >= request.perUserBudgetUsd && !role.suspended) {
        console.log(
          `[budgetEnforcement] ${username} exceeded budget: $${currentSpend} >= $${request.perUserBudgetUsd}`
        );
        await suspendUser(request, role);
      }
    }
  }
}
