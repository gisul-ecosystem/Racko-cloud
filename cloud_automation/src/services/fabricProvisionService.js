const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const fabricClient = require('../provisioners/fabric/fabricClient');

const CERT_TAG_RE = /\b(DP-600|DP-700)\b/i;

function mapTemplateItemToFabricTypes(rawLabel, certTag) {
  const label = String(rawLabel || '').toLowerCase();
  const prefix = String(certTag || 'LAB').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const items = [];

  if (label.includes('lakehouse')) {
    items.push({ type: 'Lakehouse', displayName: `${prefix}-Lakehouse` });
  }
  if (label.includes('warehouse')) {
    items.push({ type: 'Warehouse', displayName: `${prefix}-Warehouse` });
  }
  if (label.includes('eventhouse') || label.includes('eventstream')) {
    items.push({ type: 'Eventhouse', displayName: `${prefix}-Eventhouse` });
  }
  // Semantic models / Power BI / OneLake are covered by workspace Contributor + Lakehouse.
  return items;
}

function buildItemPlan(workspaceItems, certTag) {
  const planned = [];
  const seen = new Set();

  for (const raw of workspaceItems || []) {
    for (const item of mapTemplateItemToFabricTypes(raw, certTag)) {
      const key = `${item.type}:${item.displayName}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      planned.push(item);
    }
  }

  if (!planned.some((item) => item.type === 'Lakehouse')) {
    planned.unshift({
      type: 'Lakehouse',
      displayName: `${String(certTag || 'LAB').toUpperCase()}-Lakehouse`,
    });
  }

  if (String(certTag).toUpperCase() === 'DP-700') {
    if (!planned.some((item) => item.type === 'Warehouse')) {
      planned.push({ type: 'Warehouse', displayName: 'DP-700-Warehouse' });
    }
    if (!planned.some((item) => item.type === 'Eventhouse')) {
      planned.push({ type: 'Eventhouse', displayName: 'DP-700-Eventhouse' });
    }
  }

  return planned;
}

async function loadFabricLabContext(requestId) {
  const enrollmentResult = await db.query(
    `
      SELECT
        fe.id AS enrollment_id,
        fe.status AS enrollment_status,
        fe.workspace_id,
        fe.capacity_id,
        ft.id AS template_id,
        ft.cert_tag,
        ft.name AS lab_name,
        ft.workspace_items,
        ft.workspace_role,
        ft.onelake_permissions,
        ft.capacity_sku
      FROM fabric_enrollments fe
      JOIN fabric_lab_templates ft ON ft.id = fe.template_id
      WHERE fe.azure_request_id = $1
      ORDER BY fe.created_at DESC
      LIMIT 1
    `,
    [requestId]
  ).catch(() => ({ rows: [] }));

  if (enrollmentResult.rows[0]) {
    return { required: true, source: 'enrollment', ...enrollmentResult.rows[0] };
  }

  const requestResult = await db.query(
    `
      SELECT
        r.id,
        r.project_name,
        EXISTS (
          SELECT 1
          FROM request_services rs
          JOIN services s ON s.id = rs.service_id
          WHERE rs.request_id = r.id
            AND LOWER(s.name) = 'microsoft fabric'
        ) AS has_fabric_service
      FROM requests r
      WHERE r.id = $1
      LIMIT 1
    `,
    [requestId]
  );

  const request = requestResult.rows[0];
  if (!request) {
    throw new AppError('Request not found.', 404);
  }

  const projectName = String(request.project_name || '');
  const certMatch = projectName.match(CERT_TAG_RE);
  const certTag = certMatch ? certMatch[1].toUpperCase() : null;

  if (!request.has_fabric_service && !certTag) {
    return { required: false };
  }

  let template = null;
  if (certTag) {
    const templateResult = await db.query(
      `
        SELECT
          id AS template_id,
          cert_tag,
          name AS lab_name,
          workspace_items,
          workspace_role,
          onelake_permissions,
          capacity_sku
        FROM fabric_lab_templates
        WHERE UPPER(cert_tag) = $1
        LIMIT 1
      `,
      [certTag]
    ).catch(() => ({ rows: [] }));
    template = templateResult.rows[0] || null;
  }

  return {
    required: true,
    source: 'request',
    enrollment_id: null,
    cert_tag: certTag || template?.cert_tag || 'DP-600',
    lab_name: template?.lab_name || projectName || 'Fabric Lab',
    workspace_items: template?.workspace_items || ['Lakehouse'],
    workspace_role: template?.workspace_role || 'Contributor',
    onelake_permissions: template?.onelake_permissions || 'read-write',
    capacity_sku: template?.capacity_sku || 'F2',
    workspace_id: null,
    capacity_id: null,
  };
}

async function getFabricProvisionStatus(requestId) {
  const context = await loadFabricLabContext(requestId);
  if (!context.required) {
    return {
      required: false,
      complete: true,
      status: 'skipped',
      workspaceId: null,
      capacityId: null,
      items: [],
      roleAssignments: [],
      certTag: null,
    };
  }

  const stateResult = await db.query(
    `SELECT * FROM fabric_provision_state WHERE request_id = $1 LIMIT 1`,
    [requestId]
  ).catch(() => ({ rows: [] }));

  const state = stateResult.rows[0] || null;
  const assignmentsResult = await db.query(
    `
      SELECT azure_user_id, username, workspace_role, status, error_message, assigned_at
      FROM fabric_workspace_role_assignments
      WHERE request_id = $1
      ORDER BY username ASC
    `,
    [requestId]
  ).catch(() => ({ rows: [] }));

  const complete = String(state?.status || '').toLowerCase() === 'complete';

  return {
    required: true,
    complete,
    status: state?.status || 'pending',
    workspaceId: state?.workspace_id || context.workspace_id || null,
    capacityId: state?.capacity_id || context.capacity_id || null,
    workspaceName: state?.workspace_name || null,
    workspaceRole: state?.workspace_role || context.workspace_role || 'Contributor',
    onelakePermissions: state?.onelake_permissions || context.onelake_permissions || null,
    items: state?.items || [],
    roleAssignments: assignmentsResult.rows,
    certTag: state?.cert_tag || context.cert_tag || null,
    errorMessage: state?.error_message || null,
  };
}

async function upsertProvisionState(requestId, patch) {
  await db.query(
    `
      INSERT INTO fabric_provision_state (
        request_id,
        enrollment_id,
        cert_tag,
        capacity_id,
        workspace_id,
        workspace_name,
        workspace_role,
        onelake_permissions,
        items,
        role_assignments,
        status,
        error_message,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, NOW()
      )
      ON CONFLICT (request_id) DO UPDATE SET
        enrollment_id = COALESCE(EXCLUDED.enrollment_id, fabric_provision_state.enrollment_id),
        cert_tag = COALESCE(EXCLUDED.cert_tag, fabric_provision_state.cert_tag),
        capacity_id = COALESCE(EXCLUDED.capacity_id, fabric_provision_state.capacity_id),
        workspace_id = COALESCE(EXCLUDED.workspace_id, fabric_provision_state.workspace_id),
        workspace_name = COALESCE(EXCLUDED.workspace_name, fabric_provision_state.workspace_name),
        workspace_role = COALESCE(EXCLUDED.workspace_role, fabric_provision_state.workspace_role),
        onelake_permissions = COALESCE(EXCLUDED.onelake_permissions, fabric_provision_state.onelake_permissions),
        items = COALESCE(EXCLUDED.items, fabric_provision_state.items),
        role_assignments = COALESCE(EXCLUDED.role_assignments, fabric_provision_state.role_assignments),
        status = EXCLUDED.status,
        error_message = EXCLUDED.error_message,
        updated_at = NOW()
    `,
    [
      requestId,
      patch.enrollmentId || null,
      patch.certTag || null,
      patch.capacityId || null,
      patch.workspaceId || null,
      patch.workspaceName || null,
      patch.workspaceRole || 'Contributor',
      patch.onelakePermissions || null,
      JSON.stringify(patch.items || []),
      JSON.stringify(patch.roleAssignments || []),
      patch.status || 'pending',
      patch.errorMessage || null,
    ]
  );
}

async function provisionFabricForRequest(requestId, options = {}) {
  const context = await loadFabricLabContext(requestId);
  if (!context.required) {
    return {
      success: true,
      required: false,
      complete: true,
      status: 'skipped',
      message: 'Fabric provisioning not required for this request.',
    };
  }

  const cohortFrom =
    Number.isInteger(Number(options.userNumberFrom)) && Number(options.userNumberFrom) > 0
      ? Number(options.userNumberFrom)
      : null;
  const cohortTo =
    Number.isInteger(Number(options.userNumberTo)) && Number(options.userNumberTo) > 0
      ? Number(options.userNumberTo)
      : null;

  const usersResult = await db.query(
    `
      SELECT id, azure_user_id, username, user_number
      FROM azure_users
      WHERE request_id = $1
        AND COALESCE(is_deleted, false) = false
        AND azure_user_id IS NOT NULL
        AND (
          $2::int IS NULL
          OR (user_number >= $2 AND user_number <= $3)
        )
      ORDER BY user_number ASC NULLS LAST, id ASC
    `,
    [requestId, cohortFrom, cohortTo]
  );

  if (!usersResult.rows.length) {
    throw new AppError('No provisioned Azure users found for Fabric workspace assignment.', 400);
  }

  const certTag = String(context.cert_tag || 'DP-600').toUpperCase();
  const workspaceRole = String(context.workspace_role || 'Contributor');
  const workspaceName = `Racko-${certTag}-REQ-${requestId}`.slice(0, 250);
  const itemPlan = buildItemPlan(context.workspace_items, certTag);

  await upsertProvisionState(requestId, {
    enrollmentId: context.enrollment_id,
    certTag,
    workspaceRole,
    onelakePermissions: context.onelake_permissions,
    status: 'provisioning',
    items: itemPlan,
  });

  try {
    const token = await fabricClient.getFabricAccessToken();
    const capacityId = await fabricClient.resolveCapacityId(token);

    fabricClient.logFabric('info', 'fabric_capacity_resolved', { requestId, capacityId, certTag });

    const workspace = await fabricClient.createWorkspace({
      displayName: workspaceName,
      description: `${context.lab_name || certTag} lab workspace for request #${requestId}. Role: ${workspaceRole}. OneLake: ${context.onelake_permissions || 'read-write'}.`,
      capacityId,
      token,
    });

    const workspaceId = workspace.id;
    fabricClient.logFabric('info', 'fabric_workspace_ready', {
      requestId,
      workspaceId,
      workspaceName,
    });

    const createdItems = [];
    for (const item of itemPlan) {
      const created = await fabricClient.createWorkspaceItem(workspaceId, item, token);
      createdItems.push({
        type: item.type,
        displayName: item.displayName,
        id: created.id || null,
        status: created.status === 'failed' ? 'failed' : 'ready',
        error: created.error || null,
      });
    }

    const roleAssignments = [];
    for (const user of usersResult.rows) {
      try {
        const assignment = await fabricClient.addWorkspaceRoleAssignment(
          workspaceId,
          { principalId: user.azure_user_id, role: workspaceRole },
          token
        );

        await db.query(
          `
            INSERT INTO fabric_workspace_role_assignments (
              request_id, azure_user_id, username, workspace_id, workspace_role,
              assignment_id, status, error_message, assigned_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'assigned', NULL, NOW())
            ON CONFLICT (request_id, azure_user_id, workspace_id, workspace_role)
            DO UPDATE SET
              status = 'assigned',
              assignment_id = COALESCE(EXCLUDED.assignment_id, fabric_workspace_role_assignments.assignment_id),
              error_message = NULL,
              assigned_at = NOW()
          `,
          [
            requestId,
            user.azure_user_id,
            user.username,
            workspaceId,
            workspaceRole,
            assignment.id || null,
          ]
        );

        roleAssignments.push({
          username: user.username,
          azureUserId: user.azure_user_id,
          role: workspaceRole,
          status: 'assigned',
        });
      } catch (error) {
        await db.query(
          `
            INSERT INTO fabric_workspace_role_assignments (
              request_id, azure_user_id, username, workspace_id, workspace_role,
              status, error_message, assigned_at
            ) VALUES ($1, $2, $3, $4, $5, 'failed', $6, NOW())
            ON CONFLICT (request_id, azure_user_id, workspace_id, workspace_role)
            DO UPDATE SET
              status = 'failed',
              error_message = EXCLUDED.error_message,
              assigned_at = NOW()
          `,
          [
            requestId,
            user.azure_user_id,
            user.username,
            workspaceId,
            workspaceRole,
            error.message || 'Fabric role assignment failed',
          ]
        );

        roleAssignments.push({
          username: user.username,
          azureUserId: user.azure_user_id,
          role: workspaceRole,
          status: 'failed',
          error: error.message,
        });
      }
    }

    const failedRoles = roleAssignments.filter((row) => row.status === 'failed');
    const failures = failedRoles.map((row) => ({
      username: row.username,
      error: row.error || 'Fabric role assignment failed'
    }));

    // Soft-fail: keep workspace + successful assignments; retry remaining users next wave/call.
    await upsertProvisionState(requestId, {
      enrollmentId: context.enrollment_id,
      certTag,
      capacityId,
      workspaceId,
      workspaceName,
      workspaceRole,
      onelakePermissions: context.onelake_permissions,
      items: createdItems,
      roleAssignments,
      status: failedRoles.length > 0 ? 'provisioning' : 'complete',
      errorMessage:
        failedRoles.length > 0
          ? `${failedRoles.length} Fabric role assignment(s) failed — retry remaining users.`
          : null,
    });

    if (context.enrollment_id) {
      await db.query(
        `
          UPDATE fabric_enrollments
          SET
            workspace_id = $2,
            capacity_id = $3,
            status = 'active',
            updated_at = NOW()
          WHERE id = $1
        `,
        [context.enrollment_id, workspaceId, capacityId]
      ).catch(() => undefined);
    }

    return {
      success: failedRoles.length === 0,
      required: true,
      complete: failedRoles.length === 0,
      status: failedRoles.length === 0 ? 'complete' : 'provisioning',
      capacityId,
      workspaceId,
      workspaceName,
      workspaceRole,
      onelakePermissions: context.onelake_permissions,
      items: createdItems,
      roleAssignments,
      usersProcessed: roleAssignments.length,
      certTag,
      failures,
      remaining: failedRoles.length,
      userNumberFrom: cohortFrom,
      userNumberTo: cohortTo
    };
  } catch (error) {
    await upsertProvisionState(requestId, {
      enrollmentId: context.enrollment_id,
      certTag,
      workspaceRole,
      onelakePermissions: context.onelake_permissions,
      status: 'failed',
      errorMessage: error.message || 'Fabric provisioning failed',
    });

    if (context.enrollment_id) {
      await db.query(
        `
          UPDATE fabric_enrollments
          SET status = 'failed', failure_reason = $2, updated_at = NOW()
          WHERE id = $1
        `,
        [context.enrollment_id, error.message || 'Fabric provisioning failed']
      ).catch(() => undefined);
    }

    throw error;
  }
}

module.exports = {
  getFabricProvisionStatus,
  loadFabricLabContext,
  provisionFabricForRequest,
};
