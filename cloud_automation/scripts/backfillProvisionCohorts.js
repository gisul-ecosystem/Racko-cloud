/**
 * Create provision_cohorts for existing requests and mark waves already fully
 * provisioned (RG + user present for every slot in the wave) as completed.
 *
 * Usage:
 *   node scripts/backfillProvisionCohorts.js
 *   node scripts/backfillProvisionCohorts.js --request-id 363
 *   node scripts/backfillProvisionCohorts.js --dry-run
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../src/db/postgres');
const { buildCohorts, getProvisionCohortSize } = require('../src/utils/provisionCohorts');
const {
  createCohortsForRequest,
  listCohortsForRequest
} = require('../src/services/provisionCohortService');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = { requestId: null, dryRun: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--request-id' && args[i + 1]) {
      options.requestId = Number(args[++i]);
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    }
  }
  return options;
};

const applyMigration = async () => {
  const migrationPath = path.join(
    __dirname,
    '../src/db/migrations/20260807_create_provision_cohorts.sql'
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await db.query(sql);
  console.log('Applied migration 20260807_create_provision_cohorts.sql');
};

const cohortFullyProvisioned = async (requestId, from, to) => {
  const rg = await db.query(
    `
      SELECT COUNT(*)::int AS c
      FROM request_user_resource_groups
      WHERE request_id = $1
        AND user_number BETWEEN $2 AND $3
    `,
    [requestId, from, to]
  );
  const users = await db.query(
    `
      SELECT COUNT(*)::int AS c
      FROM azure_users
      WHERE request_id = $1
        AND COALESCE(is_deleted, false) = false
        AND azure_user_id IS NOT NULL
        AND user_number BETWEEN $2 AND $3
    `,
    [requestId, from, to]
  );
  const roles = await db.query(
    `
      SELECT COUNT(DISTINCT ura.user_id)::int AS c
      FROM user_role_assignments ura
      INNER JOIN azure_users au ON au.id = ura.user_id
      WHERE ura.request_id = $1
        AND au.user_number BETWEEN $2 AND $3
        AND ura.assignment_status = 'assigned'
    `,
    [requestId, from, to]
  );

  const target = to - from + 1;
  const rgOk = Number(rg.rows[0].c) >= target;
  const usersOk = Number(users.rows[0].c) >= target;
  const rolesOk = Number(roles.rows[0].c) >= target;

  return { rgOk, usersOk, rolesOk, fullyDone: rgOk && usersOk && rolesOk };
};

const inferCurrentStep = ({ rgOk, usersOk, rolesOk }) => {
  if (!rgOk) return 'resourceGroup';
  if (!usersOk) return 'users'; // services often soft; users gate roles
  if (!rolesOk) return 'roles';
  return 'fabric';
};

const main = async () => {
  const { requestId, dryRun } = parseArgs();
  await applyMigration();

  const requests = await db.query(
    `
      SELECT id, account_count, project_name, status
      FROM requests
      WHERE ($1::bigint IS NULL OR id = $1)
        AND account_count IS NOT NULL
        AND account_count > 0
      ORDER BY id DESC
    `,
    [requestId]
  );

  console.log(`Scanning ${requests.rows.length} request(s); cohort size=${getProvisionCohortSize()}`);

  for (const request of requests.rows) {
    const id = Number(request.id);
    const accountCount = Number(request.account_count);
    let cohorts = await listCohortsForRequest(id);

    if (cohorts.length === 0) {
      console.log(`\n#${id} ${request.project_name || ''} — creating ${buildCohorts(accountCount).length} cohorts`);
      if (!dryRun) {
        cohorts = await createCohortsForRequest(id, accountCount);
      } else {
        cohorts = buildCohorts(accountCount).map((c) => ({
          ...c,
          status: 'pending',
          currentStep: 'resourceGroup'
        }));
      }
    } else {
      console.log(`\n#${id} ${request.project_name || ''} — already has ${cohorts.length} cohorts`);
    }

    let firstIncomplete = null;

    for (const cohort of cohorts) {
      const from = cohort.userNumberFrom ?? cohort.user_number_from;
      const to = cohort.userNumberTo ?? cohort.user_number_to;
      const progress = await cohortFullyProvisioned(id, from, to);
      const step = inferCurrentStep(progress);

      console.log(
        `  wave ${cohort.cohortIndex ?? '?'} users ${from}-${to}: rg=${progress.rgOk} users=${progress.usersOk} roles=${progress.rolesOk} → ${
          progress.fullyDone ? 'completed' : step
        }`
      );

      if (dryRun) continue;

      if (progress.fullyDone) {
        await db.query(
          `
            UPDATE provision_cohorts
            SET status = 'completed',
                current_step = 'done',
                last_error = NULL,
                updated_at = NOW()
            WHERE request_id = $1 AND cohort_index = $2
          `,
          [id, cohort.cohortIndex]
        );
      } else if (!firstIncomplete) {
        firstIncomplete = { cohort, step };
      }
    }

    if (!dryRun) {
      // Exactly one in_progress cohort at the first incomplete wave.
      await db.query(
        `
          UPDATE provision_cohorts
          SET status = 'pending',
              updated_at = NOW()
          WHERE request_id = $1
            AND status = 'in_progress'
        `,
        [id]
      );

      if (firstIncomplete) {
        await db.query(
          `
            UPDATE provision_cohorts
            SET status = 'in_progress',
                current_step = $3,
                last_error = NULL,
                updated_at = NOW()
            WHERE request_id = $1 AND cohort_index = $2
          `,
          [id, firstIncomplete.cohort.cohortIndex, firstIncomplete.step]
        );
        console.log(
          `  → active wave ${firstIncomplete.cohort.cohortIndex} at step ${firstIncomplete.step}`
        );
      } else {
        console.log('  → all waves completed');
      }
    }
  }

  console.log(dryRun ? '\nDry run complete.' : '\nBackfill complete.');
};

main()
  .catch(async (error) => {
    console.error('Backfill failed:', error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch {
      // ignore
    }
  });
