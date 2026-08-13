/**
 * Minimum RBAC so lab users can open their resource group in Azure Portal.
 * Built-in Reader includes Microsoft.Resources/subscriptions/resourceGroups/read.
 */
const BASELINE_LAB_RBAC_ROLES = ['Reader'];

module.exports = {
  BASELINE_LAB_RBAC_ROLES
};
