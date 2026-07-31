#!/usr/bin/env node
/**
 * Sync Azure Entra ID passwords to match azure_users.temporary_password in Racko DB.
 * Required after seeding DB passwords — Microsoft login uses Entra, not DB alone.
 *
 * Usage:
 *   node scripts/syncAzureAdPasswords.js 307
 *   node scripts/syncAzureAdPasswords.js 307 309
 */
require('dotenv').config();

const db = require('../src/db/postgres');
const { createGraphClient } = require('../src/provisioners/azure/userProvisioner');

const requestIds = process.argv.slice(2).map(Number).filter((id) => id > 0);

if (!requestIds.length) {
  console.error('Usage: node scripts/syncAzureAdPasswords.js <requestId> [requestId...]');
  process.exit(1);
}

(async () => {
  const { graphClient } = createGraphClient();

  for (const requestId of requestIds) {
    console.log(`\n${'='.repeat(72)}`);
    console.log(`Syncing Azure AD passwords for request #${requestId}`);
    console.log('='.repeat(72));

    const users = await db.query(
      `
        SELECT id, username, azure_user_id, temporary_password, azure_account_enabled, status
        FROM azure_users
        WHERE request_id = $1
          AND COALESCE(is_deleted, false) = false
          AND azure_user_id IS NOT NULL
        ORDER BY user_number ASC NULLS LAST, username ASC
      `,
      [requestId]
    );

    if (!users.rows.length) {
      console.log('No users found.');
      continue;
    }

    let ok = 0;
    let failed = 0;

    for (const user of users.rows) {
      const password = user.temporary_password;
      if (!password) {
        console.log(`  ✗ ${user.username}: missing temporary_password in DB`);
        failed += 1;
        continue;
      }

      try {
        await graphClient.api(`/users/${user.azure_user_id}`).patch({
          accountEnabled: true,
          passwordProfile: {
            forceChangePasswordNextSignIn: false,
            password: String(password),
          },
        });

        await db.query(
          `
            UPDATE azure_users
            SET azure_account_enabled = TRUE,
                status = CASE WHEN lower(status) = 'blocked' THEN 'Created' ELSE status END
            WHERE id = $1
          `,
          [user.id]
        );

        console.log(`  ✓ ${user.username} — Azure AD password synced & account enabled`);
        ok += 1;
      } catch (error) {
        console.log(`  ✗ ${user.username}: ${error.message || error}`);
        failed += 1;
      }
    }

    console.log(`\nDone request #${requestId}: ${ok} synced, ${failed} failed`);
  }

  console.log('\nUsers can now sign in to Azure Portal with the same temporary password as Manage Portal.');
  await db.end();
})().catch(async (error) => {
  console.error('Sync failed:', error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
