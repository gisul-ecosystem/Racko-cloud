const { createGraphClient } = require('../config/azure');
const AppError = require('../utils/AppError');
const { resolveLicenseDisplayName } = require('../utils/microsoftLicenseNames');
const {
  DEFAULT_USAGE_LOCATION,
  isValidUsageLocation,
  resolveUsageLocation
} = require('../utils/azureUsageLocation');

/**
 * Graph app permissions needed for create-request license assignment:
 *   Directory.Read.All — list subscribedSkus
 *   User.ReadWrite.All — set usageLocation / assignLicense (also works)
 *   LicenseAssignment.ReadWrite.All — preferred for assignLicense / subscribedSkus
 * Grant these on the Azure app registration and admin-consent them.
 */
const LICENSE_GRAPH_PERMISSIONS_HINT =
  'Ensure the Azure app registration has Directory.Read.All and ' +
  'User.ReadWrite.All or LicenseAssignment.ReadWrite.All (application permissions) with admin consent.';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isGraphPermissionError = (statusCode, message) => {
  const code = Number(statusCode) || 0;
  const text = String(message || '').toLowerCase();
  return (
    code === 401
    || code === 403
    || /authorization_requestdenied|insufficient privileges|access denied|forbidden/i.test(text)
  );
};

const withPermissionHint = (message) => {
  const base = String(message || '').trim() || 'Microsoft Graph license operation failed.';
  if (/LicenseAssignment\.ReadWrite\.All|Directory\.Read\.All/i.test(base)) {
    return base;
  }
  return `${base} ${LICENSE_GRAPH_PERMISSIONS_HINT}`;
};

const mapSku = (sku) => {
  const prepaid = Number(sku?.prepaidUnits?.enabled ?? 0);
  const consumed = Number(sku?.consumedUnits ?? 0);
  const available = Math.max(0, prepaid - consumed);
  const skuPartNumber = sku.skuPartNumber || sku.skuId;

  return {
    skuId: sku.skuId,
    skuPartNumber,
    productName: resolveLicenseDisplayName(skuPartNumber),
    capabilityStatus: sku.capabilityStatus || 'Unknown',
    prepaidUnits: prepaid,
    consumedUnits: consumed,
    availableUnits: available,
    appliesTo: sku.appliesTo || null
  };
};

const isAssignableLicense = (license) => {
  const status = String(license.capabilityStatus || '').toLowerCase();
  if (status && status !== 'enabled') {
    return false;
  }

  return license.availableUnits > 0;
};

/**
 * List Microsoft licenses (subscribed SKUs) available in the configured tenant.
 * Returns only enabled SKUs with remaining seats, using friendly product names.
 */
const listTenantLicenses = async () => {
  const graphClient = createGraphClient();

  try {
    const response = await graphClient
      .api('/subscribedSkus')
      .select('skuId,skuPartNumber,capabilityStatus,prepaidUnits,consumedUnits,appliesTo')
      .get();

    const skus = Array.isArray(response?.value) ? response.value : [];

    return skus
      .map(mapSku)
      .filter((sku) => sku.skuId && isAssignableLicense(sku))
      .sort((a, b) => String(a.productName).localeCompare(String(b.productName)));
  } catch (error) {
    const statusCode = Number(error?.statusCode || error?.status) || 502;
    const message =
      error?.body?.error?.message
      || error?.message
      || 'Unable to load Microsoft licenses from the tenant.';
    throw new AppError(
      isGraphPermissionError(statusCode, message) ? withPermissionHint(message) : message,
      statusCode >= 400 && statusCode <= 599 ? statusCode : 502
    );
  }
};

/**
 * Assign a Microsoft license SKU to a Graph user.
 * Ensures usageLocation is a valid ISO country code before assignLicense.
 */
const assignLicenseToUser = async (
  graphClient,
  azureUserId,
  skuId,
  usageLocationHint = DEFAULT_USAGE_LOCATION
) => {
  if (!azureUserId || !skuId) {
    return { assigned: false, reason: 'missing_user_or_sku' };
  }

  const desiredUsageLocation = resolveUsageLocation(usageLocationHint);

  try {
    const user = await graphClient
      .api(`/users/${encodeURIComponent(azureUserId)}`)
      .select('id,usageLocation')
      .get();

    const currentUsageLocation = String(user?.usageLocation || '').trim().toUpperCase();
    const needsUsageLocationUpdate = !isValidUsageLocation(currentUsageLocation);

    if (needsUsageLocationUpdate) {
      await graphClient.api(`/users/${encodeURIComponent(azureUserId)}`).patch({
        usageLocation: desiredUsageLocation
      });
      // Graph can briefly lag after patch; small delay avoids false "invalid usage location".
      await sleep(750);
    }

    const postAssign = async () =>
      graphClient.api(`/users/${encodeURIComponent(azureUserId)}/assignLicense`).post({
        addLicenses: [
          {
            skuId,
            disabledPlans: []
          }
        ],
        removeLicenses: []
      });

    try {
      await postAssign();
    } catch (assignError) {
      const assignMessage =
        assignError?.body?.error?.message || assignError?.message || '';
      // Retry once after forcing usageLocation again (adopted users / eventual consistency).
      if (/usage location/i.test(String(assignMessage))) {
        await graphClient.api(`/users/${encodeURIComponent(azureUserId)}`).patch({
          usageLocation: desiredUsageLocation
        });
        await sleep(1000);
        await postAssign();
      } else {
        throw assignError;
      }
    }

    return {
      assigned: true,
      usageLocation: needsUsageLocationUpdate ? desiredUsageLocation : currentUsageLocation
    };
  } catch (error) {
    const statusCode = Number(error?.statusCode || error?.status) || 500;
    const message =
      error?.body?.error?.message
      || error?.message
      || 'Failed to assign Microsoft license to user.';

    // Treat "already licensed" as success so re-runs are idempotent.
    if (
      statusCode === 400
      && /already|license.*assigned|mutually exclusive/i.test(String(message))
    ) {
      return { assigned: true, reason: 'already_licensed_or_conflict' };
    }

    throw new AppError(
      isGraphPermissionError(statusCode, message) ? withPermissionHint(message) : message,
      statusCode >= 400 && statusCode <= 599 ? statusCode : 500
    );
  }
};

module.exports = {
  listTenantLicenses,
  assignLicenseToUser,
  DEFAULT_USAGE_LOCATION,
  LICENSE_GRAPH_PERMISSIONS_HINT,
  resolveUsageLocation
};
