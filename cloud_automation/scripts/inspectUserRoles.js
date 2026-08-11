require('dotenv').config();
const db = require('../src/db/postgres');

(async () => {
  const requestId = Number(process.argv[2] || 365);
  const username = process.argv[3] || 'cust-365-user-9';

  const result = await db.query(
    `
      SELECT au.username, au.azure_user_id, au.azure_resource_group_name, ura.azure_role, ura.scope, ura.assignment_status
      FROM azure_users au
      LEFT JOIN user_role_assignments ura ON ura.user_id = au.id AND ura.request_id = au.request_id
      WHERE au.request_id = $1 AND au.username ILIKE $2
      ORDER BY ura.azure_role
    `,
    [requestId, username]
  );

  console.log(JSON.stringify(result.rows, null, 2));
  await db.end();
})().catch(async (error) => {
  console.error(error);
  try {
    await db.end();
  } catch (_) {}
  process.exit(1);
});
