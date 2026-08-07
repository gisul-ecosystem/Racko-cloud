/**
 * Force-enable all Entra accounts for a request (accountEnabled only).
 * Diagnoses soft-delete / Graph errors, retries, and verifies.
 *
 * Usage: node scripts/forceEnableRequest365Users.js --request-id 365
 */
require('dotenv').config();

const db = require('../src/db/postgres');
const { createGraphClient } = require('../src/provisioners/azure/userProvisioner');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = () => {
  const args = process.argv.slice(2);
  let requestId = 365;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--request-id' && args[i + 1]) {
      requestId = Number(args[++i]);
    }
  }
  return { requestId };
};

const main = async () => {
  const { requestId } = parseArgs();
  const { graphClient } = createGraphClient();

  const usersResult = await db.query(
    `
      SELECT id, username, azure_user_id, status, azure_account_enabled, blocked_until
      FROM azure_users
      WHERE request_id = $1
        AND COALESCE(is_deleted, false) = false
        AND azure_user_id IS NOT NULL
      ORDER BY user_number ASC NULLS LAST, username ASC
    `,
    [requestId]
  );

  console.log(`Force-enabling ${usersResult.rows.length} user(s) on request #${requestId}\n`);

  let ok = 0;
  let failed = 0;
  const failures = [];

  for (const user of usersResult.rows) {
    process.stdout.write(`${user.username} ... `);
    try {
      let azureUser;
      try {
        azureUser = await graphClient
          .api(`/users/${user.azure_user_id}`)
          .select('id,displayName,userPrincipalName,accountEnabled,deletedDateTime')
          .get();
      } catch (lookupError) {
        // Soft-deleted?
        try {
          azureUser = await graphClient
            .api(`/directory/deletedItems/microsoft.graph.user/${user.azure_user_id}`)
            .select('id,displayName,userPrincipalName')
            .get();
          throw new Error(`user is soft-deleted in Entra (${azureUser.userPrincipalName || user.azure_user_id})`);
        } catch (deletedLookupError) {
          if (/soft-deleted/i.test(deletedLookupError.message || '')) throw deletedLookupError;
          throw new Error(`Graph lookup failed: ${lookupError.message || lookupError}`);
        }
      }

      if (azureUser.accountEnabled === true) {
        console.log('already enabled');
        await db.query(
          `
            UPDATE azure_users
            SET azure_account_enabled = TRUE,
                blocked_until = NULL,
                blocked_reason = NULL,
                blocked_at = NULL,
                status = CASE
                  WHEN lower(COALESCE(status, '')) IN ('blocked', 'disabled') THEN 'Created'
                  ELSE status
                END
            WHERE id = $1
          `,
          [user.id]
        );
        ok += 1;
        continue;
      }

      await graphClient.api(`/users/${user.azure_user_id}`).patch({ accountEnabled: true });
      await sleep(800);

      let verified = await graphClient
        .api(`/users/${user.azure_user_id}`)
        .select('accountEnabled')
        .get();

      if (verified.accountEnabled !== true) {
        // retry once
        await sleep(1500);
        await graphClient.api(`/users/${user.azure_user_id}`).patch({ accountEnabled: true });
        await sleep(1000);
        verified = await graphClient
          .api(`/users/${user.azure_user_id}`)
          .select('accountEnabled')
          .get();
      }

      if (verified.accountEnabled !== true) {
        throw new Error('still disabled after retries (possible directory policy / missing User.ReadWrite.All)');
      }

      await db.query(
        `
          UPDATE azure_users
          SET azure_account_enabled = TRUE,
              blocked_until = NULL,
              blocked_reason = NULL,
              blocked_at = NULL,
              status = CASE
                WHEN lower(COALESCE(status, '')) IN ('blocked', 'disabled') THEN 'Created'
                ELSE status
              END
          WHERE id = $1
        `,
        [user.id]
      );

      console.log(`enabled (${azureUser.userPrincipalName || user.azure_user_id})`);
      ok += 1;
    } catch (error) {
      console.log(`FAILED — ${error.message || error}`);
      failed += 1;
      failures.push({ username: user.username, error: error.message || String(error) });
    }
  }

  console.log('\n== Summary ==');
  console.log(`  Enabled: ${ok}`);
  console.log(`  Failed:  ${failed}`);
  if (failures.length) {
    console.log(JSON.stringify(failures, null, 2));
  }
};

main()
  .catch(async (error) => {
    console.error('Failed:', error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch {
      // ignore
    }
  });
