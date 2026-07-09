const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const { provisionServiceResource } = require('../provisioners/azure/serviceResourceProvisioner');
const { isPerUserCosting } = require('../utils/costingMode');
const { getStagingResourceGroups } = require('./userResourceGroupService');

const logEvent = (event, details = {}) => {
  console.log(
    JSON.stringify({
      event,
      service: 'service-resource-provision',
      timestamp: new Date().toISOString(),
      ...details
    })
  );
};

const getRequestContext = async (client, requestId) => {
  const result = await client.query(
    `
      SELECT
        id,
        location,
        costing_mode,
        azure_resource_group_name,
        status
      FROM requests
      WHERE id = $1
      FOR UPDATE
    `,
    [requestId]
  );

  return result.rows[0] || null;
};

const getInstancesForRequest = async (client, requestId) => {
  const result = await client.query(
    `
      SELECT
        rsi.service_id,
        rsi.instance_option,
        s.name AS service_name
      FROM request_service_instances rsi
      INNER JOIN services s ON s.id = rsi.service_id
      WHERE rsi.request_id = $1
      ORDER BY s.name
    `,
    [requestId]
  );

  return result.rows;
};

const getProvisionedCount = async (client, requestId) => {
  const result = await client.query(
    `
      SELECT COUNT(*)::int AS count
      FROM provisioned_service_resources
      WHERE request_id = $1
        AND status IN ('policy_configured', 'provisioned', 'skipped')
    `,
    [requestId]
  );

  return Number(result.rows[0]?.count || 0);
};

const upsertProvisionedResource = async (client, data) => {
  await client.query(
    `
      INSERT INTO provisioned_service_resources (
        request_id,
        service_id,
        instance_option,
        resource_type,
        resource_name,
        azure_resource_id,
        status,
        error_message,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (request_id, service_id)
      DO UPDATE SET
        instance_option = EXCLUDED.instance_option,
        resource_type = EXCLUDED.resource_type,
        resource_name = EXCLUDED.resource_name,
        azure_resource_id = EXCLUDED.azure_resource_id,
        status = EXCLUDED.status,
        error_message = EXCLUDED.error_message,
        updated_at = NOW()
    `,
    [
      data.requestId,
      data.serviceId,
      data.instanceOption,
      data.resourceType,
      data.resourceName,
      data.azureResourceId,
      data.status,
      data.errorMessage
    ]
  );
};

const provisionServiceResourcesForRequest = async (requestId) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const request = await getRequestContext(client, requestId);

    if (!request) {
      throw new AppError('Request not found.', 404);
    }

    const resourceGroupNames = isPerUserCosting(request.costing_mode)
      ? (await getStagingResourceGroups(requestId, client)).map(
          (row) => row.azure_resource_group_name
        )
      : request.azure_resource_group_name
        ? [request.azure_resource_group_name]
        : [];

    if (resourceGroupNames.length === 0) {
      throw new AppError('Resource group must be created before provisioning service instances.', 400);
    }

    const instances = await getInstancesForRequest(client, requestId);

    if (instances.length === 0) {
      await client.query('COMMIT');
      return { resourcesProvisioned: 0, resourcesSkipped: 0 };
    }

    const existingCount = await getProvisionedCount(client, requestId);

    if (existingCount >= instances.length) {
      await client.query('COMMIT');
      logEvent('service_resources_reused_existing', { requestId, count: existingCount });
      return { resourcesProvisioned: existingCount, resourcesSkipped: 0 };
    }

    let provisioned = 0;
    let skipped = 0;

    for (const instance of instances) {
      const serviceId = Number(instance.service_id);
      const existing = await client.query(
        `
          SELECT status
          FROM provisioned_service_resources
          WHERE request_id = $1 AND service_id = $2
        `,
        [requestId, serviceId]
      );

      if (
        ['policy_configured', 'provisioned', 'skipped'].includes(existing.rows[0]?.status)
      ) {
        if (existing.rows[0].status === 'skipped') {
          skipped += 1;
        } else {
          provisioned += 1;
        }
        continue;
      }

      const result = await provisionServiceResource({
        requestId,
        serviceId,
        serviceName: instance.service_name,
        resourceGroupName: resourceGroupNames[0],
        location: request.location,
        instanceOption: instance.instance_option
      });

      for (const resourceGroupName of resourceGroupNames.slice(1)) {
        await provisionServiceResource({
          requestId,
          serviceId,
          serviceName: instance.service_name,
          resourceGroupName,
          location: request.location,
          instanceOption: instance.instance_option
        });
      }

      await upsertProvisionedResource(client, {
        requestId,
        serviceId,
        instanceOption: instance.instance_option,
        resourceType: result.resourceType,
        resourceName: result.resourceName,
        azureResourceId: result.azureResourceId,
        status: result.status,
        errorMessage: result.errorMessage
      });

      if (result.status === 'skipped') {
        skipped += 1;
      } else if (result.status === 'policy_configured' || result.status === 'provisioned') {
        provisioned += 1;
      }
    }

    await client.query('COMMIT');

    logEvent('service_resources_provision_completed', {
      requestId,
      provisioned,
      skipped
    });

    return {
      resourcesProvisioned: provisioned,
      resourcesSkipped: skipped
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getProvisionedResourcesForRequest = async (requestId) => {
  const result = await db.query(
    `
      SELECT
        service_id,
        instance_option,
        resource_type,
        resource_name,
        azure_resource_id,
        status,
        error_message
      FROM provisioned_service_resources
      WHERE request_id = $1
      ORDER BY service_id
    `,
    [requestId]
  );

  return result.rows;
};

const repairInstancePoliciesForRequest = async (requestId) => {
  const requestResult = await db.query(
    `
      SELECT
        id,
        location,
        costing_mode,
        azure_resource_group_name
      FROM requests
      WHERE id = $1
      LIMIT 1
    `,
    [requestId]
  );

  const request = requestResult.rows[0];
  if (!request) {
    throw new AppError('Request not found.', 404);
  }

  const resourceGroupNames = isPerUserCosting(request.costing_mode)
    ? (await getStagingResourceGroups(requestId)).map((row) => row.azure_resource_group_name)
    : request.azure_resource_group_name
      ? [request.azure_resource_group_name]
      : [];

  if (resourceGroupNames.length === 0) {
    throw new AppError('No resource groups found for this request.', 400);
  }

  const instances = await db.query(
    `
      SELECT
        rsi.service_id,
        rsi.instance_option,
        s.name AS service_name
      FROM request_service_instances rsi
      INNER JOIN services s ON s.id = rsi.service_id
      WHERE rsi.request_id = $1
      ORDER BY s.name
    `,
    [requestId]
  );

  if (instances.rows.length === 0) {
    return { repaired: 0, resourceGroups: resourceGroupNames };
  }

  let repaired = 0;

  for (const instance of instances.rows) {
    for (const resourceGroupName of resourceGroupNames) {
      await provisionServiceResource({
        requestId,
        serviceId: Number(instance.service_id),
        serviceName: instance.service_name,
        resourceGroupName,
        location: request.location,
        instanceOption: instance.instance_option
      });
      repaired += 1;
    }
  }

  logEvent('instance_policies_repaired', {
    requestId,
    repaired,
    resourceGroupCount: resourceGroupNames.length,
    instanceCount: instances.rows.length
  });

  return {
    repaired,
    resourceGroups: resourceGroupNames,
    location: request.location
  };
};

module.exports = {
  provisionServiceResourcesForRequest,
  getProvisionedResourcesForRequest,
  repairInstancePoliciesForRequest
};
