
const AppError = require('../utils/AppError');
const db = require('../db/postgres');
const pricingService = require('./pricingService');
const { assertProvisionableLocation, assertLocationAvailableForServices } = require('./azureLocationService');
const { applyTierRolesToAssignments, ensureAutoAssignRolesForServices, applyDependencyRolesToAssignments, finalizeAiFoundryTierRoles } = require('./instanceRoleMappingService');
const adminAccessRequestService = require('./adminAccessRequestService');
const { normalizeCostingMode, COSTING_MODE_SHARED } = require('../utils/costingMode');
const { buildExpiresAtFromParts } = require('../utils/requestExpiry');

async function createRequest({
  customerEmail,
  accountCount,
  location,
  serviceIds,
  selectedRoles,
  selectedInstances,
  startDate,
  endDate,
  enableDailyUsage,
  dailyLimitMinutes,
  usageSchedule,
  costingMode,
  cleanupEnabled,
  cleanupIntervalHours,
  perUserBudgetUsd,
  resourceCleanupEnabled,
  resourceCleanupIntervalHours,
  resourceCleanupAction,
  usageWindows,
  projectName,
  idMode,
  microsoftLicenseSkuId,
  microsoftLicenseSkuPartNumber,
  convertedFromRequestId,
  purchaseToken,
  rackoUserId
}) {

  const client = await db.connect();

  try {

    await client.query('BEGIN');

    assertProvisionableLocation(location);

    // ==========================
    // Resolve incoming serviceIds
    // Supports:
    // services.id
    // service_locations.id
    // ==========================

    const incomingIds =
      Array.isArray(serviceIds)
        ? serviceIds
            .map(Number)
            .filter(Boolean)
        : [];

    if (!incomingIds.length) {
      throw new AppError('No services selected', 400);
    }

    let validServiceIds = [];



    // ---------------------------------
    // TRY DIRECT services.id
    // ---------------------------------

    const direct =
      await client.query(
        `
        SELECT
          id,
          name
        FROM services
        WHERE id = ANY($1)
        `,
        [incomingIds]
      );



    if (direct.rows.length) {

      validServiceIds =
        direct.rows.map(
          x =>
            Number(
              x.id
            )
        );

    }

    else {

      // ---------------------------------
      // FALLBACK service_locations
      // ---------------------------------

      const catalog =
        await client.query(
          `
          SELECT
            service_name
          FROM service_locations
          WHERE id = ANY($1)
          `,
          [incomingIds]
        );



      if (!catalog.rows.length) {
        throw new AppError('Selected services not found', 400);
      }



      const names =
        [
          ...new Set(

            catalog.rows.map(
              x =>

                String(
                  x.service_name
                )

                  .trim()

                  .toLowerCase()

            )

          )
        ];



      const lookup =
        await client.query(
          `
          SELECT
            id,
            name
          FROM services
          WHERE
          LOWER(
            TRIM(name)
          )
          =
          ANY($1)
          `,
          [names]
        );



      validServiceIds =
        lookup.rows.map(
          x =>
            Number(
              x.id
            )
        );

    }



    if (!validServiceIds.length) {
      throw new AppError('No services resolved', 400);
    }

    const servicesForLocation = await client.query(
      `
        SELECT
          id,
          name,
          COALESCE(supports_regions, true) AS supports_regions
        FROM services
        WHERE id = ANY($1::int[])
      `,
      [validServiceIds]
    );

    await assertLocationAvailableForServices(location, servicesForLocation.rows);

    const normalizedLocation = String(location || '').trim().toLowerCase();
    const instancesToValidate = [];

    for (const service of servicesForLocation.rows) {
      const selected = (Array.isArray(selectedInstances) ? selectedInstances : []).find(
        (entry) => Number(entry?.serviceId ?? entry?.service_id) === Number(service.id)
      );
      const instanceOption = String(
        selected?.instanceOption ?? selected?.instance_option ?? ''
      ).trim();

      if (instanceOption) {
        instancesToValidate.push({
          serviceId: Number(service.id),
          option_name: instanceOption
        });
      }
    }

    if (instancesToValidate.length > 0) {
      const { filterInstancesForLocation } = require('./instanceAvailabilityService');
      const servicesById = new Map(
        servicesForLocation.rows.map((service) => [Number(service.id), service])
      );
      const filtered = await filterInstancesForLocation(
        normalizedLocation,
        instancesToValidate,
        servicesById
      );

      if (filtered.length !== instancesToValidate.length) {
        throw new AppError(
          'One or more selected instance sizes are not available in the chosen region. Pick another region or instance size.',
          400
        );
      }
    }

    // ==========================
    // Pricing
    // ==========================

    const resolvedCostingMode = normalizeCostingMode(costingMode) || COSTING_MODE_SHARED;

    const pricing =
      await pricingService
        .calculatePricing({

          accountCount,

          location,

          startDate,

          endDate,

          serviceIds:
            validServiceIds,

          selectedInstances: Array.isArray(selectedInstances) ? selectedInstances : [],

          selectedRoles: Array.isArray(selectedRoles) ? selectedRoles : [],

          costingMode: resolvedCostingMode,

          usageWindows: Array.isArray(usageWindows) ? usageWindows : []

        });



    const estimatedPrice =
      Number(

        pricing
          .estimatedPrice

        ??

        pricing
          .totalPrice

        ??

        0

      );



    // ==========================
    // Create Request
    // ==========================

    const resolvedRackoUserId = String(rackoUserId || '').trim() || null;
    const resolvedCleanupEnabled = cleanupEnabled === true;
    const resolvedCleanupIntervalHours =
      resolvedCleanupEnabled && Number.isInteger(cleanupIntervalHours)
        ? cleanupIntervalHours
        : null;
    const resolvedPerUserBudgetUsd =
      perUserBudgetUsd !== undefined && perUserBudgetUsd !== null && perUserBudgetUsd !== ''
        ? Number(perUserBudgetUsd)
        : null;
    const resolvedNextCleanupAt =
      resolvedCleanupEnabled && resolvedCleanupIntervalHours
        ? new Date(Date.now() + resolvedCleanupIntervalHours * 60 * 60 * 1000).toISOString()
        : null;
    const resolvedResourceCleanupEnabled = resourceCleanupEnabled === true;
    const resolvedResourceCleanupIntervalHours =
      resolvedResourceCleanupEnabled && Number.isInteger(resourceCleanupIntervalHours)
        ? resourceCleanupIntervalHours
        : null;
    const resolvedResourceCleanupNextRunAt =
      resolvedResourceCleanupEnabled && resolvedResourceCleanupIntervalHours
        ? new Date(Date.now() + resolvedResourceCleanupIntervalHours * 60 * 60 * 1000).toISOString()
        : null;
    const resolvedResourceCleanupAction =
      resourceCleanupAction === 'pause' ? 'pause' : 'delete';
    const resolvedProjectName =
      typeof projectName === 'string' && projectName.trim() ? projectName.trim() : null;
    const resolvedIdMode =
      idMode === 'test_ids' || idMode === 'azure_ids' ? idMode : null;
    const resolvedMicrosoftLicenseSkuId =
      typeof microsoftLicenseSkuId === 'string' && microsoftLicenseSkuId.trim()
        ? microsoftLicenseSkuId.trim()
        : null;
    const resolvedMicrosoftLicenseSkuPartNumber =
      typeof microsoftLicenseSkuPartNumber === 'string' && microsoftLicenseSkuPartNumber.trim()
        ? microsoftLicenseSkuPartNumber.trim()
        : null;
    const { getPurchaseIntentDelayMs } = require('./purchaseIntentService');
    const resolvedPurchaseIntentDueAt =
      resolvedIdMode === 'test_ids'
        ? new Date(Date.now() + getPurchaseIntentDelayMs()).toISOString()
        : null;
    const resolvedConvertedFromRequestId =
      Number.isInteger(Number(convertedFromRequestId)) && Number(convertedFromRequestId) > 0
        ? Number(convertedFromRequestId)
        : null;

    const request =
      await client.query(
        `
        INSERT INTO requests(

          customer_email,

          account_count,

          location,

          expiry_date,

          estimated_price,

          status,

          enable_daily_usage,

          daily_limit_minutes,

          usage_schedule,

          costing_mode,

          racko_user_id,

          cleanup_enabled,

          cleanup_interval_hours,

          next_cleanup_at,

          per_user_budget_usd,

          resource_cleanup_enabled,

          resource_cleanup_interval_hours,

          resource_cleanup_next_run_at,

          resource_cleanup_action,

          project_name,

          id_mode,

          microsoft_license_sku_id,

          microsoft_license_sku_part_number,

          purchase_intent_due_at,

          converted_from_request_id

        )

        VALUES(

          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21,
          $22,
          $23,
          $24,
          $25

        )

        RETURNING
        id,
        estimated_price,
        costing_mode
        `,
        [

          customerEmail,

          accountCount,

          location,

          endDate,

          estimatedPrice,

          'Pending',

          enableDailyUsage === true,

          enableDailyUsage === true && dailyLimitMinutes ? Number(dailyLimitMinutes) : null,

          enableDailyUsage === true && usageSchedule ? JSON.stringify(usageSchedule) : null,

          resolvedCostingMode,

          resolvedRackoUserId,

          resolvedCleanupEnabled,

          resolvedCleanupIntervalHours,

          resolvedNextCleanupAt,

          resolvedPerUserBudgetUsd,

          resolvedResourceCleanupEnabled,

          resolvedResourceCleanupIntervalHours,

          resolvedResourceCleanupNextRunAt,

          resolvedResourceCleanupAction,

          resolvedProjectName,

          resolvedIdMode,

          resolvedMicrosoftLicenseSkuId,

          resolvedMicrosoftLicenseSkuPartNumber,

          resolvedPurchaseIntentDueAt,

          resolvedConvertedFromRequestId

        ]
      );



    const requestId =
      request.rows[0].id;

    if (Array.isArray(usageWindows) && usageWindows.length > 0) {
      for (const window of usageWindows) {
        await client.query(
          `
            INSERT INTO request_usage_windows (
              request_id,
              day_of_week,
              window_start_time,
              window_end_time,
              timezone,
              daily_limit_hours
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (request_id, day_of_week)
            DO UPDATE SET
              window_start_time = EXCLUDED.window_start_time,
              window_end_time = EXCLUDED.window_end_time,
              timezone = EXCLUDED.timezone,
              daily_limit_hours = EXCLUDED.daily_limit_hours
          `,
          [
            requestId,
            window.day_of_week,
            `${window.window_start_time}:00`,
            `${window.window_end_time}:00`,
            window.timezone || 'Asia/Kolkata',
            window.daily_limit_hours ?? null
          ]
        );
      }
    }

    const firstUsageWindow = Array.isArray(usageWindows) && usageWindows.length > 0
      ? usageWindows[0]
      : null;
    const expiresAt = buildExpiresAtFromParts({
      expiryDate: endDate,
      timezone: firstUsageWindow?.timezone,
      endTimeLocal: firstUsageWindow?.window_end_time
    });

    if (expiresAt) {
      await client.query(
        `
          UPDATE requests
          SET expires_at = $2
          WHERE id = $1
        `,
        [requestId, expiresAt]
      );
    }



    // ==========================
    // Insert request_services
    // ==========================

    for (
      const sid
      of validServiceIds
    ) {

      await client.query(
        `
        INSERT INTO request_services(

          request_id,

          service_id

        )

        VALUES(

          $1,

          $2

        )

        ON CONFLICT
        (
          request_id,
          service_id
        )

        DO NOTHING
        `,
        [

          requestId,

          sid

        ]
      );

    }



    // ==========================
    // Save Selected Instances
    // ==========================

    for (const item of selectedInstances || []) {
      const sid = Number(item.serviceId);
      const instanceOption = String(item.instanceOption || '').trim();

      if (!validServiceIds.includes(sid) || !instanceOption) {
        continue;
      }

      await client.query(
        `
          INSERT INTO request_service_instances (
            request_id,
            service_id,
            instance_option
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (request_id, service_id)
          DO UPDATE SET
            instance_option = EXCLUDED.instance_option
        `,
        [requestId, sid, instanceOption]
      );
    }

    // ==========================
    // Save Selected Roles
    // Auto-append default roles for services with enable_role_selection=false
    // ==========================

    // Get service configurations
    const serviceConfigsResult = await client.query(
      `
      SELECT 
        id,
        name,
        COALESCE(enable_role_selection, true) AS enable_role_selection,
        default_role,
        COALESCE(role_required, true) AS role_required
      FROM services
      WHERE id = ANY($1)
      `,
      [validServiceIds]
    );

    const serviceConfigs = new Map();
    for (const svc of serviceConfigsResult.rows) {
      serviceConfigs.set(Number(svc.id), {
        enable_role_selection: Boolean(svc.enable_role_selection),
        default_role: svc.default_role,
        role_required: Boolean(svc.role_required),
        name: svc.name
      });
    }

    // Build final role assignments
    const roleAssignments = new Map(); // serviceId -> Set of roles

    // First, process explicitly selected roles
    for (const item of (selectedRoles || [])) {
      const sid = Number(item.serviceId);

      if (!validServiceIds.includes(sid)) {
        continue;
      }

      const roles = Array.isArray(item.roles) ? item.roles : [];

      if (!roleAssignments.has(sid)) {
        roleAssignments.set(sid, new Set());
      }

      for (const role of roles) {
        roleAssignments.get(sid).add(role);
        console.log(`[ROLE_MANUAL_SELECTED] Service ${sid}: ${role}`);
      }
    }

    // Then, auto-assign default roles for services with enable_role_selection=false
    for (const sid of validServiceIds) {
      const config = serviceConfigs.get(sid);

      if (!config) {
        console.log(`[SERVICE_SELECTED] Service ${sid}: No configuration found, skipping role assignment`);
        continue;
      }

      if (!config.enable_role_selection && config.default_role) {
        if (!roleAssignments.has(sid)) {
          roleAssignments.set(sid, new Set());
        }

        roleAssignments.get(sid).add(config.default_role);
        console.log(`[ROLE_AUTO_ASSIGNED] Service ${sid} (${config.name}): ${config.default_role} (auto)`);
      } else if (config.enable_role_selection) {
        console.log(`[SERVICE_SELECTED] Service ${sid} (${config.name}): Role selection enabled`);
      }
    }

    // Tier-automated services: instance selection drives RBAC role (overrides manual picks)
    await applyTierRolesToAssignments(client, roleAssignments, validServiceIds, selectedInstances);

    // Ensure all auto_assign default roles (control + data plane) are included
    await ensureAutoAssignRolesForServices(client, roleAssignments, validServiceIds);

    // Auto-assign dependency roles required for portal resource creation
    await applyDependencyRolesToAssignments(client, roleAssignments, validServiceIds);

    // Enforce AI Foundry tier-specific role sets after all auto-assign merges
    await finalizeAiFoundryTierRoles(client, roleAssignments, validServiceIds, selectedInstances);

    // Insert all role assignments into database
    for (const [sid, rolesSet] of roleAssignments.entries()) {
      for (const role of rolesSet) {
        await client.query(
          `
          INSERT INTO request_service_roles(
            request_id,
            service_id,
            azure_role
          )
          VALUES($1, $2, $3)
          ON CONFLICT (request_id, service_id, azure_role)
          DO NOTHING
          `,
          [requestId, sid, role]
        );
      }
    }



    await adminAccessRequestService.linkAdminAccessRequestsToRequest({
      customerEmail,
      requestId,
      client
    });

    await client.query(
      'COMMIT'
    );

    try {
      await adminAccessRequestService.fulfillLinkedApprovedAccessRequests({
        customerEmail,
        requestId
      });
    } catch (fulfillmentError) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'request-service',
          level: 'error',
          event: 'approved_access_fulfillment_failed',
          requestId,
          message: fulfillmentError?.message
        })
      );
    }

    if (resolvedConvertedFromRequestId) {
      try {
        const purchaseIntentService = require('./purchaseIntentService');
        await purchaseIntentService.markRequestConverted(
          resolvedConvertedFromRequestId,
          requestId
        );
      } catch (convertError) {
        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            service: 'request-service',
            level: 'error',
            event: 'purchase_convert_mark_failed',
            sourceRequestId: resolvedConvertedFromRequestId,
            requestId,
            message: convertError?.message
          })
        );
      }
    }

    return {

      success:
      true,

      requestId,

      estimatedPrice

    };



  }

  catch(error){

    await client.query(
      'ROLLBACK'
    );

    throw error;

  }

  finally {

    client.release();

  }

}



async function getAllRequests({ rackoUserId, isSuperAdmin } = {}) {
  if (isSuperAdmin) {
    const result = await db.query(
      `
      SELECT *
      FROM requests
      ORDER BY created_at DESC
      `
    );

    return result.rows;
  }

  const result = await db.query(
    `
    SELECT *
    FROM requests
    WHERE racko_user_id = $1
    ORDER BY created_at DESC
    `,
    [rackoUserId]
  );

  return result.rows;
}



async function getRequestById(
  requestId,
  { rackoUserId, isSuperAdmin } = {}
) {
  const request = await db.query(
    `
    SELECT *
    FROM requests
    WHERE id=$1
    `,
    [requestId]
  );

  if (!request.rows.length) {
    return null;
  }

  const row = request.rows[0];

  if (
    !isSuperAdmin &&
    row.racko_user_id &&
    String(row.racko_user_id) !== String(rackoUserId)
  ) {
    return null;
  }

  if (!isSuperAdmin && !row.racko_user_id) {
    return null;
  }



const services =
await db.query(
`
SELECT

s.id,

s.name,

rsr.azure_role

FROM request_services rs

LEFT JOIN services s

ON s.id=rs.service_id

LEFT JOIN request_service_roles rsr

ON rsr.service_id=s.id

AND rsr.request_id=rs.request_id

WHERE rs.request_id=$1
`,
[
requestId
]
);



const instances =
await db.query(
`
SELECT
  rsi.service_id,
  rsi.instance_option,
  s.name AS service_name
FROM request_service_instances rsi
LEFT JOIN services s ON s.id = rsi.service_id
WHERE rsi.request_id = $1
`,
[
requestId
]
);

return{

...request.rows[0],

services:
services.rows,

instances:
instances.rows

};

}



module.exports={

createRequest,

getAllRequests,

getRequestById

};

