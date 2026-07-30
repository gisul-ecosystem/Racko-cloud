#!/usr/bin/env node
/**
 * Seed all lab users (#307 + #309) and bind them to one dev Manage Portal link.
 *
 * Usage:
 *   node scripts/setupDevPortalSharedLink.js
 */
require('dotenv').config();

const crypto = require('crypto');
const db = require('../src/db/postgres');
const { issueAccessPortalTokenForRequest } = require('../src/services/managePortalService');
const { createGraphClient } = require('../src/provisioners/azure/userProvisioner');

const PORTAL_TOKEN = '561e2481-68d5-40c5-b64b-a36904721740';
const PORTAL_URL = `https://dev.racko.ai/manage-users?token=${encodeURIComponent(PORTAL_TOKEN)}`;
const PRIMARY_REQUEST_ID = 307;

const ALL_USER_PASSWORDS = {
  307: {
    'cust-307-user-1': '5-Ai2F$=d8_9HSFe',
    'cust-307-user-2': 'cUF75UufTB+CHLA!',
    'cust-307-user-3': '^6%rmxw+fKFcQgM#',
    'cust-307-user-4': 'nkgW5FhVAE4nD&5N',
    'cust-307-user-5': 'ojb6@&hF8ahwNX_z',
    'cust-307-user-6': 'gNWFcZ63+PP@^Ddc',
    'cust-307-user-7': 'qcc^Q-NL7EU8-U8M',
    'cust-307-user-8': '%gRabb7RCCNwA9qi',
    'cust-307-user-9': 'NwWtAHz4F=4Bkwa$',
    'cust-307-user-10': '*q=dre5Fi@ZGk6AC',
    'cust-307-user-11': '@34BMbf$o6SpXG5W',
  },
  309: {
    'cust-309-user-1': 'VnynxCg@_2j*c*#N',
  },
};

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

async function ensureSharedPortalToken(requestId, customerEmail) {
  const tokenHash = sha256Hex(PORTAL_TOKEN);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const existing = await db.query(
    `SELECT id FROM access_portal_tokens WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  );

  if (existing.rows.length) {
    await db.query(
      `
        UPDATE access_portal_tokens
        SET request_id = $2,
            customer_email = $3,
            expires_at = $4,
            used = false,
            used_at = NULL
        WHERE token_hash = $1
      `,
      [tokenHash, requestId, customerEmail, expiresAt]
    );
    return expiresAt;
  }

  await db.query(
    `
      INSERT INTO access_portal_tokens (id, request_id, customer_email, token_hash, expires_at, used)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, false)
    `,
    [requestId, customerEmail, tokenHash, expiresAt]
  );

  return expiresAt;
}

async function seedPasswords(requestId, passwords) {
  let updated = 0;

  for (const [username, password] of Object.entries(passwords)) {
    const result = await db.query(
      `
        UPDATE azure_users
        SET temporary_password = $1
        WHERE request_id = $2
          AND lower(username) = lower($3)
          AND COALESCE(is_deleted, false) = false
        RETURNING username
      `,
      [password, requestId, username]
    );

    if (result.rows.length) {
      updated += 1;
      console.log(`  ✓ ${result.rows[0].username}`);
    } else {
      console.log(`  ✗ NOT FOUND: ${username}`);
    }
  }

  return updated;
}

async function syncAzureAd(requestId) {
  const { graphClient } = createGraphClient();
  const users = await db.query(
    `
      SELECT id, username, azure_user_id, temporary_password
      FROM azure_users
      WHERE request_id = $1
        AND COALESCE(is_deleted, false) = false
        AND azure_user_id IS NOT NULL
      ORDER BY user_number ASC NULLS LAST, username ASC
    `,
    [requestId]
  );

  let ok = 0;
  for (const user of users.rows) {
    if (!user.temporary_password) {
      console.log(`  ✗ ${user.username}: missing password`);
      continue;
    }

    await graphClient.api(`/users/${user.azure_user_id}`).patch({
      accountEnabled: true,
      passwordProfile: {
        forceChangePasswordNextSignIn: false,
        password: String(user.temporary_password),
      },
    });

    await db.query(
      `UPDATE azure_users SET azure_account_enabled = TRUE WHERE id = $1`,
      [user.id]
    );

    console.log(`  ✓ ${user.username} — Azure AD synced`);
    ok += 1;
  }

  return ok;
}

(async () => {
  const primaryRequest = await db.query(
    `SELECT id, project_name, customer_email FROM requests WHERE id = $1`,
    [PRIMARY_REQUEST_ID]
  );

  if (!primaryRequest.rows.length) {
    throw new Error(`Request #${PRIMARY_REQUEST_ID} not found`);
  }

  const { customer_email: customerEmail, project_name: projectName } = primaryRequest.rows[0];

  console.log('Seeding Manage Portal credentials for shared dev link');
  console.log(`Portal URL: ${PORTAL_URL}`);
  console.log('');

  for (const [requestId, passwords] of Object.entries(ALL_USER_PASSWORDS)) {
    console.log(`${'='.repeat(72)}`);
    console.log(`Request #${requestId} — seeding ${Object.keys(passwords).length} user(s)`);
    console.log('='.repeat(72));
    const updated = await seedPasswords(Number(requestId), passwords);
    console.log(`Seeded ${updated}/${Object.keys(passwords).length} password(s).`);
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log('Syncing Azure AD passwords');
  console.log('='.repeat(72));

  for (const requestId of Object.keys(ALL_USER_PASSWORDS)) {
    console.log(`\nRequest #${requestId}:`);
    await syncAzureAd(Number(requestId));
  }

  const expiresAt = await ensureSharedPortalToken(PRIMARY_REQUEST_ID, customerEmail);
  const adminPortal = await issueAccessPortalTokenForRequest(PRIMARY_REQUEST_ID);

  console.log(`\n${'='.repeat(72)}`);
  console.log('SHARED DEV PORTAL LINK (all 12 learners use this URL)');
  console.log('='.repeat(72));
  console.log(PORTAL_URL);
  console.log(`Token bound to request #${PRIMARY_REQUEST_ID} (${projectName || '—'})`);
  console.log(`Expires: ${expiresAt}`);
  console.log('');
  console.log('Admin login (manage request #307 users):');
  console.log(`  Username: ${adminPortal.adminCredentials?.username}`);
  console.log(`  Password: ${adminPortal.adminCredentials?.temporaryPassword}`);
  console.log('');
  console.log('All 12 learner logins:');
  for (const [requestId, passwords] of Object.entries(ALL_USER_PASSWORDS)) {
    for (const [username, password] of Object.entries(passwords)) {
      console.log(`  [${requestId}] ${username} / ${password}`);
    }
  }

  await db.end();
})().catch(async (error) => {
  console.error('Setup failed:', error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
