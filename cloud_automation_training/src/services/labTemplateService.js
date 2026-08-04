import { pool } from '../config/db.js';

function mapAzureLab(row) {
  const services = Array.isArray(row.services) ? row.services : [];
  const rbacActions = Array.isArray(row.rbac_actions) ? row.rbac_actions : [];
  const serviceNames = services.map((item) =>
    typeof item === 'string' ? item : item?.name
  ).filter(Boolean);

  const roleSummary = services.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const name = item.name || 'Service';
    const roles = Array.isArray(item.roles) ? item.roles : [];
    if (roles.length === 0) return [`${name}: catalog default roles`];
    return [`${name}: ${roles.join(', ')}`];
  });

  return {
    id: row.id,
    kind: 'azure',
    name: row.name,
    certTag: row.cert_tag,
    cloud: row.cloud,
    services,
    permissions: {
      rbacActions,
      entraDirectoryRole: row.entra_directory_role,
      summary: [
        ...rbacActions.map((action) => String(action)),
        ...(roleSummary.length && rbacActions.length === 0 ? roleSummary : []),
      ],
    },
    // UI resource picker shows catalog services included in the lab pack.
    instances: serviceNames,
    region: row.region,
    durationHours: row.duration_hours,
    cost: {
      budgetCap: Number(row.budget_cap_inr),
      currency: 'INR',
      label: `Budget cap ₹${Number(row.budget_cap_inr).toFixed(2)}`,
    },
    active: row.active,
  };
}

function mapFabricLab(row) {
  const hourly = row.capacity_hourly_cost_usd != null ? Number(row.capacity_hourly_cost_usd) : null;
  const durationHours = row.duration_hours;
  const estimated =
    hourly != null && durationHours != null ? Number((hourly * durationHours).toFixed(2)) : null;

  return {
    id: row.id,
    kind: 'fabric',
    name: row.name,
    certTag: row.cert_tag,
    cloud: 'fabric',
    provisionerType: row.provisioner_type,
    capacitySku: row.capacity_sku,
    capacityBillingMode: row.capacity_billing_mode,
    capacityPausedWhenIdle: row.capacity_paused_when_idle,
    permissions: {
      workspaceRole: row.workspace_role,
      onelakePermissions: row.onelake_permissions,
      summary: [
        `Workspace role: ${row.workspace_role}`,
        row.onelake_permissions ? `OneLake: ${row.onelake_permissions}` : null,
      ].filter(Boolean),
    },
    instances: row.workspace_items ?? [],
    durationHours,
    cost: {
      budgetCap: Number(row.budget_cap_usd),
      currency: 'USD',
      capacityHourlyCostUsd: hourly,
      estimatedTotalUsd: estimated,
      storageEstimateGb: row.storage_estimate_gb,
      label:
        estimated != null
          ? `Est. $${estimated.toFixed(2)} · cap $${Number(row.budget_cap_usd).toFixed(2)}`
          : `Budget cap $${Number(row.budget_cap_usd).toFixed(2)}`,
    },
    active: row.active,
  };
}

export async function listActiveLabTemplates() {
  const [azure, fabric] = await Promise.all([
    pool.query(
      `SELECT *
       FROM lab_templates
       WHERE active = true
       ORDER BY cert_tag ASC`
    ),
    pool.query(
      `SELECT *
       FROM fabric_lab_templates
       WHERE active = true
       ORDER BY cert_tag ASC`
    ),
  ]);

  return [
    ...azure.rows.map(mapAzureLab),
    ...fabric.rows.map(mapFabricLab),
  ].sort((a, b) => a.certTag.localeCompare(b.certTag));
}

export async function getLabTemplateById(id) {
  const azure = await pool.query(`SELECT * FROM lab_templates WHERE id = $1 LIMIT 1`, [id]);
  if (azure.rows[0]) return mapAzureLab(azure.rows[0]);

  const fabric = await pool.query(
    `SELECT * FROM fabric_lab_templates WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (fabric.rows[0]) return mapFabricLab(fabric.rows[0]);

  return null;
}
