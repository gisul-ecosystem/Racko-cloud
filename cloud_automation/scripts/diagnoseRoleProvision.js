/**
 * Diagnose why POST /provision/request/:id/roles fails for a request.
 * Usage: node scripts/diagnoseRoleProvision.js --request-id 363
 */
require('dotenv').config();

const db = require('../src/db/postgres');

const requestId = Number(
  process.argv.includes('--request-id')
    ? process.argv[process.argv.indexOf('--request-id') + 1]
    : 363
);

(async () => {
  const req = await db.query(
    `SELECT id, project_name, status, account_count, location, costing_mode, azure_resource_group_name
     FROM requests WHERE id = $1`,
    [requestId]
  );
  console.log('REQUEST', JSON.stringify(req.rows[0], null, 2));

  const users = await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE azure_user_id IS NULL)::int AS missing_principal,
            COUNT(*) FILTER (WHERE COALESCE(is_deleted,false)=true)::int AS deleted
     FROM azure_users WHERE request_id = $1`,
    [requestId]
  );
  console.log('USERS', users.rows[0]);

  const roles = await db.query(
    `SELECT s.name AS service, rsr.azure_role, COUNT(*) OVER() AS role_rows
     FROM request_service_roles rsr
     JOIN services s ON s.id = rsr.service_id
     WHERE rsr.request_id = $1
     ORDER BY s.name, rsr.azure_role`,
    [requestId]
  );
  console.log(`REQUEST_SERVICE_ROLES (${roles.rows.length}):`);
  for (const row of roles.rows) {
    console.log(`  - ${row.service}: ${row.azure_role}`);
  }

  const assigned = await db.query(
    `SELECT COUNT(*)::int AS assigned_rows,
            COUNT(DISTINCT user_id)::int AS users_with_roles,
            COUNT(DISTINCT azure_role)::int AS distinct_roles
     FROM user_role_assignments WHERE request_id = $1`,
    [requestId]
  );
  console.log('USER_ROLE_ASSIGNMENTS', assigned.rows[0]);

  const perRole = await db.query(
    `SELECT azure_role, COUNT(*)::int AS n
     FROM user_role_assignments WHERE request_id = $1
     GROUP BY azure_role ORDER BY n DESC, azure_role`,
    [requestId]
  );
  console.log('ASSIGNED_BY_ROLE:');
  for (const row of perRole.rows) {
    console.log(`  ${row.n}\t${row.azure_role}`);
  }

  const services = await db.query(
    `SELECT s.name FROM request_services rs
     JOIN services s ON s.id = rs.service_id
     WHERE rs.request_id = $1 ORDER BY s.name`,
    [requestId]
  );
  console.log(`SERVICES (${services.rows.length}):`, services.rows.map((r) => r.name).join(', '));

  // Expected matrix size
  const userCount = await db.query(
    `SELECT COUNT(*)::int AS c FROM azure_users
     WHERE request_id = $1 AND COALESCE(is_deleted,false)=false AND azure_user_id IS NOT NULL`,
    [requestId]
  );
  const uniqueRoles = [...new Set(roles.rows.map((r) => r.azure_role))];
  const expected = userCount.rows[0].c * uniqueRoles.length;
  console.log('\nMATRIX', {
    users: userCount.rows[0].c,
    uniqueRoles: uniqueRoles.length,
    expectedAssignments: expected,
    currentlyAssigned: assigned.rows[0].assigned_rows,
    remainingApprox: Math.max(0, expected - assigned.rows[0].assigned_rows)
  });

  await db.end();
})().catch(async (e) => {
  console.error(e);
  try {
    await db.end();
  } catch {}
  process.exit(1);
});
