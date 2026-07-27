#!/usr/bin/env node
/**
 * Seed Manage Portal credentials from provisioning spreadsheet and issue fresh portal links.
 *
 * Usage:
 *   FRONTEND_URL=https://qa.racko.ai node scripts/seedManagePortalCredentials.js
 */
require('dotenv').config();

process.env.FRONTEND_URL =
  process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')
    ? process.env.FRONTEND_URL
    : 'https://qa.racko.ai';

const db = require('../src/db/postgres');
const { issueAccessPortalTokenForRequest } = require('../src/services/managePortalService');

const REQUEST_CREDENTIALS = {
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

async function saveCredentialDelivery({
  requestId,
  customerEmail,
  portalLink,
  adminUsername,
  adminPassword,
  expiresAt,
}) {
  try {
    const updated = await db.query(
      `
        UPDATE credential_delivery
        SET
          recipient_email = $2,
          delivery_status = 'sent',
          sent_at = NOW(),
          portal_link = $3,
          admin_username = $4,
          admin_temporary_password = $5,
          portal_expires_at = $6
        WHERE request_id = $1
        RETURNING request_id
      `,
      [requestId, customerEmail, portalLink, adminUsername, adminPassword, expiresAt]
    );

    if (!updated.rows.length) {
      await db.query(
        `
          INSERT INTO credential_delivery (
            request_id,
            recipient_email,
            delivery_status,
            sent_at,
            portal_link,
            admin_username,
            admin_temporary_password,
            portal_expires_at
          )
          VALUES ($1, $2, 'sent', NOW(), $3, $4, $5, $6)
        `,
        [requestId, customerEmail, portalLink, adminUsername, adminPassword, expiresAt]
      );
    }
  } catch (error) {
    if (!/column .* does not exist/i.test(error.message || '')) {
      throw error;
    }
  }
}

async function seedRequest(requestId, passwords) {
  const requestResult = await db.query(
    `SELECT id, project_name, customer_email FROM requests WHERE id = $1`,
    [requestId]
  );

  if (!requestResult.rows.length) {
    throw new Error(`Request #${requestId} not found`);
  }

  const request = requestResult.rows[0];
  console.log(`\n${'='.repeat(72)}`);
  console.log(`Request #${requestId} — ${request.project_name || '—'}`);
  console.log(`Customer: ${request.customer_email}`);
  console.log('='.repeat(72));

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

  console.log(`\nSeeded ${updated}/${Object.keys(passwords).length} user password(s).`);

  const portal = await issueAccessPortalTokenForRequest(requestId);

  await saveCredentialDelivery({
    requestId,
    customerEmail: request.customer_email,
    portalLink: portal.manageUrl,
    adminUsername: portal.adminCredentials?.username,
    adminPassword: portal.adminCredentials?.temporaryPassword,
    expiresAt: portal.expiresAt,
  });

  console.log('\nPORTAL LINK (valid 7 days):');
  console.log(portal.manageUrl);
  console.log(`Expires: ${portal.expiresAt}`);

  console.log('\nADMIN LOGIN (manage all users in this request):');
  console.log(`  Username: ${portal.adminCredentials?.username}`);
  console.log(`  Password: ${portal.adminCredentials?.temporaryPassword}`);

  console.log('\nLEARNER LOGINS:');
  for (const [username, password] of Object.entries(passwords)) {
    console.log(`  ${username} / ${password}`);
  }

  return portal;
}

(async () => {
  console.log(`Seeding Manage Portal credentials`);
  console.log(`Portal base URL: ${process.env.FRONTEND_URL}`);

  for (const [requestId, passwords] of Object.entries(REQUEST_CREDENTIALS)) {
    await seedRequest(Number(requestId), passwords);
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log('All done.');
  console.log('Each request has its own portal link and admin login.');
  console.log('Learners use their username + temporary password on that request link.');
  console.log('After portal login, click "Open Azure Console" to access Azure Portal.');
  console.log('='.repeat(72));

  await db.end();
})().catch(async (error) => {
  console.error('Seed failed:', error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
