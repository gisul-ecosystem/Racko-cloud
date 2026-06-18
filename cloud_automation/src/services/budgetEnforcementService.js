const { createGraphClient } = require('../provisioners/azure/userProvisioner');
const db = require('../db/postgres');
const { sendBudgetExceededEmailWithRetry } = require('./email/budgetExceededEmailService');

const logBudgetEnforcementEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'budget-enforcement',
    level,
    event,
    ...details
  };

  const message = JSON.stringify(entry);

  if (level === 'error') {
    console.error(message);
    return;
  }

  console.log(message);
};

const getUserEmailFromGraph = async (azureUserId) => {
  const { graphClient } = createGraphClient();
  const user = await graphClient
    .api(`/users/${azureUserId}`)
    .select('mail,userPrincipalName')
    .get();

  return user?.mail || user?.userPrincipalName || null;
};

const enforceBudgetExceededForUser = async (user) => {
  const { id, azure_user_id: azureUserId, request_id: requestId } = user;
  const requestLabel = `Request #${requestId}`;

  const { graphClient } = createGraphClient();

  await graphClient
    .api(`/users/${azureUserId}`)
    .patch({ accountEnabled: false });

  logBudgetEnforcementEvent('info', 'entra_account_disabled', {
    requestId,
    userId: id,
    azureUserId
  });

  await db.query(
    `
      UPDATE azure_users
      SET
        budget_exceeded = TRUE,
        budget_exceeded_at = NOW()
      WHERE id = $1
        AND COALESCE(budget_exceeded, false) = FALSE
    `,
    [id]
  );

  await db.query(
    `
      INSERT INTO budget_exceeded_events (
        request_id,
        user_id,
        azure_user_id,
        resource_group_name
      )
      VALUES ($1, $2, $3, $4)
    `,
    [requestId, id, azureUserId, user.azure_resource_group_name]
  );

  const recipientEmail = user.contact_email || (await getUserEmailFromGraph(azureUserId));

  if (recipientEmail) {
    await sendBudgetExceededEmailWithRetry({
      to: recipientEmail,
      requestLabel
    });
  } else {
    logBudgetEnforcementEvent('error', 'budget_exceeded_email_skipped', {
      requestId,
      userId: id,
      reason: 'missing_user_email'
    });
  }
};

module.exports = {
  enforceBudgetExceededForUser,
  getUserEmailFromGraph,
  logBudgetEnforcementEvent
};
