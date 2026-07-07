const db = require('../db/postgres');
const { TIER_ROLE_FALLBACKS, findTierRoleFallbacks } = require('../config/tierRoleMappings');

const normalizeInstanceOption = (value) => String(value || '').trim();

const enrichMappingsWithFallbacks = async (client, mappings) => {
  const servicesResult = await client.query(
    `
      SELECT id, name
      FROM services
      WHERE active = true
    `
  );

  const enriched = [...mappings];

  for (const service of servicesResult.rows) {
    const serviceId = Number(service.id);
    const fallbacks = findTierRoleFallbacks(service.name);

    if (fallbacks.length === 0) {
      continue;
    }

    const existingOptions = new Set(
      enriched
        .filter((row) => Number(row.serviceId) === serviceId)
        .map((row) => String(row.instanceOption || '').trim().toLowerCase())
    );

    for (const fallback of fallbacks) {
      const optionKey = fallback.instanceOption.toLowerCase();
      if (existingOptions.has(optionKey)) {
        continue;
      }

      enriched.push({
        serviceId,
        serviceName: service.name,
        instanceOption: fallback.instanceOption,
        azureRole: fallback.azureRole,
        tierAutomated: true
      });
    }
  }

  return enriched;
};

const loadInstanceRoleMappings = async (client = db) => {
  let rows = [];

  try {
    const result = await client.query(
      `
        SELECT
          sirm.service_id,
          s.name AS service_name,
          sirm.instance_option,
          sirm.azure_role,
          sirm.tier_automated
        FROM service_instance_role_mapping sirm
        INNER JOIN services s ON s.id = sirm.service_id
        ORDER BY sirm.service_id, sirm.instance_option
      `
    );

    rows = result.rows.map((row) => ({
      serviceId: Number(row.service_id),
      serviceName: row.service_name,
      instanceOption: row.instance_option,
      azureRole: row.azure_role,
      tierAutomated: Boolean(row.tier_automated)
    }));
  } catch (error) {
    if (error?.code !== '42P01') {
      throw error;
    }
  }

  return enrichMappingsWithFallbacks(client, rows);
};

const buildMappingIndex = (rows) => {
  const byServiceId = new Map();

  for (const row of rows) {
    const serviceId = Number(row.serviceId);
    const instanceOption = normalizeInstanceOption(row.instanceOption);

    if (!byServiceId.has(serviceId)) {
      byServiceId.set(serviceId, new Map());
    }

    byServiceId.get(serviceId).set(instanceOption.toLowerCase(), row);
  }

  return byServiceId;
};

const resolveRolesForInstance = ({ serviceId, serviceName, instanceOption, mappingIndex }) => {
  const normalizedOption = normalizeInstanceOption(instanceOption).toLowerCase();

  if (!normalizedOption) {
    return [];
  }

  const serviceMappings = mappingIndex?.get(Number(serviceId));
  const mapped = serviceMappings?.get(normalizedOption);

  if (mapped?.azureRole) {
    return [mapped.azureRole];
  }

  const fallback = findTierRoleFallbacks(serviceName).find(
    (entry) => entry.instanceOption.toLowerCase() === normalizedOption
  );

  if (!fallback?.azureRole) {
    return [];
  }

  return [fallback.azureRole];
};

const getAutoAssignRolesForServices = async (client, serviceIds) => {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `
      SELECT service_id, azure_role
      FROM service_role_mapping
      WHERE service_id = ANY($1::int[])
        AND COALESCE(auto_assign, false) = true
      ORDER BY service_id, azure_role
    `,
    [serviceIds]
  );

  const byServiceId = new Map();
  for (const row of result.rows) {
    const serviceId = Number(row.service_id);
    if (!byServiceId.has(serviceId)) {
      byServiceId.set(serviceId, []);
    }
    byServiceId.get(serviceId).push(row.azure_role);
  }

  return byServiceId;
};

const mergeAutoAssignRoles = (roleAssignments, autoAssignByServiceId) => {
  for (const [serviceId, roles] of autoAssignByServiceId.entries()) {
    if (!roleAssignments.has(serviceId)) {
      roleAssignments.set(serviceId, new Set());
    }

    for (const role of roles) {
      roleAssignments.get(serviceId).add(role);
    }
  }
};

/** @deprecated use resolveRolesForInstance */
const resolveRoleForInstance = (params) => {
  const roles = resolveRolesForInstance(params);
  if (roles.length === 0) {
    return null;
  }

  return {
    serviceId: Number(params.serviceId),
    serviceName: params.serviceName,
    instanceOption: params.instanceOption,
    azureRole: roles[0],
    tierAutomated: true
  };
};

const resolveTierRoles = async (client, serviceIds, selectedInstances = []) => {
  const dbMappings = await loadInstanceRoleMappings(client);
  const mappingIndex = buildMappingIndex(dbMappings);

  const serviceNamesById = new Map();
  if (serviceIds.length > 0) {
    const servicesResult = await client.query(
      `
        SELECT id, name
        FROM services
        WHERE id = ANY($1::int[])
      `,
      [serviceIds]
    );

    for (const row of servicesResult.rows) {
      serviceNamesById.set(Number(row.id), row.name);
    }
  }

  const resolved = [];

  for (const item of selectedInstances || []) {
    const serviceId = Number(item?.serviceId ?? item?.service_id);
    const instanceOption = normalizeInstanceOption(item?.instanceOption ?? item?.instance_option);

    if (!Number.isInteger(serviceId) || serviceId <= 0 || !instanceOption) {
      continue;
    }

    const tierRoles = resolveRolesForInstance({
      serviceId,
      serviceName: serviceNamesById.get(serviceId),
      instanceOption,
      mappingIndex
    });

    if (tierRoles.length === 0) {
      continue;
    }

    const mapping = mappingIndex?.get(serviceId)?.get(instanceOption.toLowerCase());
    const tierAutomated = mapping?.tierAutomated ?? true;

    if (!tierAutomated) {
      continue;
    }

    for (const azureRole of tierRoles) {
      resolved.push({
        serviceId,
        instanceOption,
        azureRole,
        tierAutomated: true
      });
    }
  }

  return resolved;
};

const applyTierRolesToAssignments = async (client, roleAssignments, validServiceIds, selectedInstances) => {
  const tierRoles = await resolveTierRoles(client, validServiceIds, selectedInstances);
  const autoAssignByServiceId = await getAutoAssignRolesForServices(client, validServiceIds);

  for (const tierRole of tierRoles) {
    if (!roleAssignments.has(tierRole.serviceId)) {
      roleAssignments.set(tierRole.serviceId, new Set());
    }

    roleAssignments.get(tierRole.serviceId).add(tierRole.azureRole);
    console.log(
      `[TIER_ROLE_AUTO_ASSIGNED] Service ${tierRole.serviceId} (${tierRole.instanceOption}): ${tierRole.azureRole}`
    );
  }

  mergeAutoAssignRoles(roleAssignments, autoAssignByServiceId);

  return tierRoles;
};

const ensureAutoAssignRolesForServices = async (client, roleAssignments, serviceIds) => {
  const autoAssignByServiceId = await getAutoAssignRolesForServices(client, serviceIds);
  mergeAutoAssignRoles(roleAssignments, autoAssignByServiceId);
  return autoAssignByServiceId;
};

module.exports = {
  TIER_ROLE_FALLBACKS,
  loadInstanceRoleMappings,
  buildMappingIndex,
  resolveRoleForInstance,
  resolveRolesForInstance,
  resolveTierRoles,
  applyTierRolesToAssignments,
  getAutoAssignRolesForServices,
  ensureAutoAssignRolesForServices,
  findTierRoleFallbacks
};
