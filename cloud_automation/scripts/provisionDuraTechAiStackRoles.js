/**
 * Attach the DuraTech AI master-list services + roles to a request, then
 * assign those Azure RBAC roles on every per-user resource group.
 *
 * Usage:
 *   node scripts/provisionDuraTechAiStackRoles.js --request-id 365 --dry-run
 *   node scripts/provisionDuraTechAiStackRoles.js --request-id 365
 */
require('dotenv').config();

const db = require('../src/db/postgres');
const {
  buildResourceGroupScope,
  createAuthorizationClient,
  createRoleAssignmentWithRetry,
  findMatchingRoleDefinition,
  getExistingAzureAssignment,
  roleAssignmentIdFromSeed
} = require('../src/provisioners/azure/roleProvisioner');
const { getResourceGroupNameForUser } = require('../src/services/userResourceGroupService');

/** Catalog service name → roles that make the lab stack work. */
const SERVICE_ROLE_PACK = [
  {
    serviceName: 'Azure OpenAI Service',
    roles: ['Cognitive Services OpenAI Contributor'],
    instanceOption: 'Standard S0'
  },
  {
    serviceName: 'Azure AI Search',
    roles: ['Search Service Contributor', 'Search Index Data Contributor'],
    instanceOption: 'Basic'
  },
  {
    serviceName: 'Azure Virtual Machines (VMs)',
    roles: ['Virtual Machine Contributor', 'Network Contributor'],
    instanceOption: 'Standard'
  },
  {
    serviceName: 'Azure Blob Storage',
    roles: ['Storage Account Contributor', 'Storage Blob Data Contributor'],
    instanceOption: 'Standard LRS'
  },
  {
    serviceName: 'Azure Container Registry',
    roles: ['AcrPull', 'AcrPush'],
    instanceOption: 'Basic'
  },
  {
    serviceName: 'Azure AI Vision',
    roles: ['Cognitive Services Contributor', 'Cognitive Services User'],
    instanceOption: 'Standard'
  },
  {
    serviceName: 'Azure AI Language',
    roles: ['Cognitive Services Contributor', 'Cognitive Services User'],
    instanceOption: 'Standard'
  },
  {
    serviceName: 'Azure AI Speech',
    roles: ['Cognitive Services Contributor', 'Cognitive Services User'],
    instanceOption: 'Standard'
  },
  {
    serviceName: 'Azure Key Vault',
    roles: ['Key Vault Reader', 'Key Vault Secrets User'],
    instanceOption: 'Standard'
  }
];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = { requestId: null, dryRun: false, skipAzure: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--request-id' && args[i + 1]) {
      options.requestId = Number(args[++i]);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--skip-azure') {
      options.skipAzure = true;
    }
  }

  if (!options.requestId || !Number.isFinite(options.requestId)) {
    throw new Error('Required: --request-id <id>');
  }

  return options;
};

const uniqueRoles = (pack) => {
  const set = new Set();
  for (const entry of pack) {
    for (const role of entry.roles) set.add(role);
  }
  return [...set].sort();
};

const resolveServices = async () => {
  const names = SERVICE_ROLE_PACK.map((s) => s.serviceName);
  const result = await db.query(
    `
      SELECT id, name
      FROM services
      WHERE name = ANY($1::text[])
      ORDER BY name
    `,
    [names]
  );

  const byName = new Map(result.rows.map((row) => [row.name, row]));
  const missing = names.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`Catalog services not found: ${missing.join(', ')}`);
  }

  return SERVICE_ROLE_PACK.map((entry) => ({
    ...entry,
    serviceId: byName.get(entry.serviceName).id
  }));
};

const attachServicesAndRoles = async (client, requestId, resolved, dryRun) => {
  console.log(`\n== DB: attach services + roles to request ${requestId} ==`);

  for (const entry of resolved) {
    console.log(`  service: ${entry.serviceName} (id=${entry.serviceId})`);
    console.log(`    roles: ${entry.roles.join(', ')}`);
    console.log(`    tier:  ${entry.instanceOption}`);

    if (dryRun) continue;

    await client.query(
      `
        INSERT INTO request_services (request_id, service_id)
        VALUES ($1, $2)
        ON CONFLICT (request_id, service_id) DO NOTHING
      `,
      [requestId, entry.serviceId]
    );

    await client.query(
      `
        INSERT INTO request_service_instances (request_id, service_id, instance_option)
        VALUES ($1, $2, $3)
        ON CONFLICT (request_id, service_id)
        DO UPDATE SET instance_option = EXCLUDED.instance_option
      `,
      [requestId, entry.serviceId, entry.instanceOption]
    );

    for (const role of entry.roles) {
      await client.query(
        `
          INSERT INTO request_service_roles (request_id, service_id, azure_role)
          VALUES ($1, $2, $3)
          ON CONFLICT (request_id, service_id, azure_role) DO NOTHING
        `,
        [requestId, entry.serviceId, role]
      );
    }
  }
};

const getRequestUsers = async (requestId) => {
  const result = await db.query(
    `
      SELECT id, username, azure_user_id, user_number
      FROM azure_users
      WHERE request_id = $1
        AND COALESCE(is_deleted, FALSE) = FALSE
        AND azure_user_id IS NOT NULL
      ORDER BY user_number NULLS LAST, username
    `,
    [requestId]
  );
  return result.rows;
};

const assignRolesInAzure = async ({ requestId, users, roles, dryRun }) => {
  console.log(`\n== Azure: assign ${roles.length} role(s) × ${users.length} user(s) ==`);

  if (dryRun) {
    console.log('Dry run — skipping Azure assignments.');
    return { assigned: 0, skipped: 0, failed: [] };
  }

  const { authorizationClient, subscriptionId } = createAuthorizationClient();
  let assigned = 0;
  let skipped = 0;
  const failed = [];

  for (const user of users) {
    const resourceGroupName = await getResourceGroupNameForUser(requestId, user.id);
    if (!resourceGroupName) {
      failed.push({ username: user.username, error: 'No resource group' });
      console.warn(`  ! ${user.username}: no resource group — skipped`);
      continue;
    }

    const scope = buildResourceGroupScope(subscriptionId, resourceGroupName);
    console.log(`\n  ${user.username} → ${resourceGroupName}`);

    for (const roleName of roles) {
      try {
        const roleDefinition = await findMatchingRoleDefinition(
          authorizationClient,
          scope,
          roleName
        );
        if (!roleDefinition?.id) {
          failed.push({ username: user.username, role: roleName, error: 'Role definition not found' });
          console.warn(`    x ${roleName}: definition not found`);
          continue;
        }

        const assignmentSeed = [requestId, user.id, roleDefinition.id, scope].join(':');
        const assignmentId = roleAssignmentIdFromSeed(assignmentSeed);
        const existing = await getExistingAzureAssignment(
          authorizationClient,
          scope,
          assignmentId
        );

        if (!existing) {
          try {
            await createRoleAssignmentWithRetry(
              authorizationClient,
              scope,
              assignmentId,
              {
                principalId: user.azure_user_id,
                roleDefinitionId: roleDefinition.id,
                principalType: 'User'
              },
              requestId
            );
            console.log(`    + ${roleName}`);
            assigned += 1;
          } catch (error) {
            if (error?.statusCode === 409 || error?.code === 'RoleAssignmentExists') {
              console.log(`    ~ ${roleName} (already in Azure)`);
              skipped += 1;
            } else {
              failed.push({
                username: user.username,
                role: roleName,
                error: error.message || String(error)
              });
              console.warn(`    x ${roleName}: ${error.message || error}`);
              continue;
            }
          }
        } else {
          console.log(`    ~ ${roleName} (already in Azure)`);
          skipped += 1;
        }

        await db.query(
          `
            INSERT INTO user_role_assignments (
              assignment_id, request_id, user_id, azure_role, scope,
              assignment_status, assigned_at, assignment_kind, created_at
            )
            VALUES ($1, $2, $3, $4, $5, 'assigned', NOW(), 'rbac', NOW())
            ON CONFLICT (request_id, user_id, azure_role) DO NOTHING
          `,
          [assignmentId, requestId, user.id, roleName, scope]
        );
      } catch (error) {
        failed.push({
          username: user.username,
          role: roleName,
          error: error.message || String(error)
        });
        console.warn(`    x ${roleName}: ${error.message || error}`);
      }
    }
  }

  return { assigned, skipped, failed };
};

const main = async () => {
  const { requestId, dryRun, skipAzure } = parseArgs();

  const requestResult = await db.query(
    `
      SELECT id, project_name, customer_email, status, account_count, location, costing_mode
      FROM requests
      WHERE id = $1
    `,
    [requestId]
  );
  const request = requestResult.rows[0];
  if (!request) {
    throw new Error(`Request ${requestId} not found`);
  }

  console.log('Request:', {
    id: request.id,
    project: request.project_name,
    status: request.status,
    location: request.location,
    accounts: request.account_count,
    costing: request.costing_mode,
    dryRun
  });

  const resolved = await resolveServices();
  const roles = uniqueRoles(resolved);
  console.log(`\nResolved ${resolved.length} services, ${roles.length} unique roles.`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await attachServicesAndRoles(client, requestId, resolved, dryRun);
    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\nDry run — DB changes rolled back.');
    } else {
      await client.query('COMMIT');
      console.log('\nDB commit OK.');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (skipAzure) {
    console.log('\n--skip-azure set; done after DB attach.');
    return;
  }

  const users = await getRequestUsers(requestId);
  console.log(`\nUsers with Azure principal: ${users.length}`);

  const summary = await assignRolesInAzure({
    requestId,
    users,
    roles,
    dryRun
  });

  console.log('\n== Summary ==');
  console.log(`  Assigned: ${summary.assigned}`);
  console.log(`  Skipped:  ${summary.skipped}`);
  console.log(`  Failed:   ${summary.failed.length}`);
  if (summary.failed.length > 0) {
    console.log(JSON.stringify(summary.failed, null, 2));
  }
};

main()
  .catch(async (error) => {
    console.error('\nFailed:', error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch {
      // ignore
    }
  });
