#!/usr/bin/env node
/**
 * Allow cust-309-user-1 to sign in via the shared #307 dev portal link
 * without waiting for cross-request login deploy.
 *
 * Creates a portal alias row on request #307 that mirrors the #309 user.
 */
require('dotenv').config();

const crypto = require('crypto');
const db = require('../src/db/postgres');

const PORTAL_TOKEN = '561e2481-68d5-40c5-b64b-a36904721740';
const SHARED_REQUEST_ID = 307;
const USERNAME = 'cust-309-user-1';

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

(async () => {
  const source = await db.query(
    `
      SELECT *
      FROM azure_users
      WHERE request_id = 309
        AND lower(username) = lower($1)
        AND COALESCE(is_deleted, false) = false
      LIMIT 1
    `,
    [USERNAME]
  );

  if (!source.rows.length) {
    throw new Error(`${USERNAME} not found on request #309`);
  }

  const user = source.rows[0];

  const existingAlias = await db.query(
    `
      SELECT id, request_id, username, azure_resource_group_name
      FROM azure_users
      WHERE request_id = $1
        AND lower(username) = lower($2)
        AND COALESCE(is_deleted, false) = false
      LIMIT 1
    `,
    [SHARED_REQUEST_ID, USERNAME]
  );

  if (existingAlias.rows.length) {
    await db.query(
      `
        UPDATE azure_users
        SET
          temporary_password = $2,
          azure_user_id = $3,
          azure_resource_group_name = $4,
          azure_resource_group_id = $5,
          status = $6,
          azure_account_enabled = TRUE,
          is_deleted = false,
          deleted_at = NULL
        WHERE id = $1
      `,
      [
        existingAlias.rows[0].id,
        user.temporary_password,
        user.azure_user_id,
        user.azure_resource_group_name,
        user.azure_resource_group_id,
        user.status,
      ]
    );
    console.log(`Updated existing portal alias on request #${SHARED_REQUEST_ID} for ${USERNAME}`);
  } else {
    const nextUserNumber = await db.query(
      `
        SELECT COALESCE(MAX(user_number), 0) + 1 AS next_number
        FROM azure_users
        WHERE request_id = $1
      `,
      [SHARED_REQUEST_ID]
    );

    await db.query(
      `
        INSERT INTO azure_users (
          request_id,
          azure_user_id,
          username,
          temporary_password,
          status,
          user_number,
          azure_resource_group_name,
          azure_resource_group_id,
          azure_account_enabled,
          is_deleted
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, false)
      `,
      [
        SHARED_REQUEST_ID,
        user.azure_user_id,
        user.username,
        user.temporary_password,
        user.status,
        nextUserNumber.rows[0].next_number,
        user.azure_resource_group_name,
        user.azure_resource_group_id,
      ]
    );
    console.log(`Created portal alias on request #${SHARED_REQUEST_ID} for ${USERNAME}`);
  }

  const tokenHash = sha256Hex(PORTAL_TOKEN);
  await db.query(
    `
      UPDATE access_portal_tokens
      SET request_id = $2,
          used = false,
          used_at = NULL,
          expires_at = GREATEST(expires_at, NOW() + INTERVAL '7 days')
      WHERE token_hash = $1
    `,
    [tokenHash, SHARED_REQUEST_ID]
  );

  console.log('');
  console.log('Shared dev portal link (all 12 learners):');
  console.log(`https://dev.racko.ai/manage-users?token=${PORTAL_TOKEN}`);
  console.log('');
  console.log(`${USERNAME} can now sign in on this link with the same password.`);

  await db.end();
})().catch(async (error) => {
  console.error('Alias setup failed:', error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
