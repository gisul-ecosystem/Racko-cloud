const { createGraphClient } = require('../config/azure');
const AppError = require('../utils/AppError');
const { resolveLicenseDisplayName } = require('../utils/microsoftLicenseNames');

const DEFAULT_USAGE_LOCATION = process.env.AZURE_LICENSE_USAGE_LOCATION || 'IN';

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
    throw new AppError(
      error?.body?.error?.message
        || error?.message
        || 'Unable to load Microsoft licenses from the tenant.',
      statusCode >= 400 && statusCode <= 599 ? statusCode : 502
    );
  }
};

/**
 * Assign a Microsoft license SKU to a Graph user. Sets usageLocation when missing.
 */
const assignLicenseToUser = async (graphClient, azureUserId, skuId, usageLocation = DEFAULT_USAGE_LOCATION) => {
  if (!azureUserId || !skuId) {
    return { assigned: false, reason: 'missing_user_or_sku' };
  }

  try {
    const user = await graphClient
      .api(`/users/${encodeURIComponent(azureUserId)}`)
      .select('id,usageLocation')
      .get();

    if (!user?.usageLocation) {
      await graphClient.api(`/users/${encodeURIComponent(azureUserId)}`).patch({
        usageLocation: usageLocation || DEFAULT_USAGE_LOCATION
      });
    }

    await graphClient.api(`/users/${encodeURIComponent(azureUserId)}/assignLicense`).post({
      addLicenses: [
        {
          skuId,
          disabledPlans: []
        }
      ],
      removeLicenses: []
    });

    return { assigned: true };
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

    throw new AppError(message, statusCode >= 400 && statusCode <= 599 ? statusCode : 500);
  }
};

module.exports = {
  listTenantLicenses,
  assignLicenseToUser,
  DEFAULT_USAGE_LOCATION
};
