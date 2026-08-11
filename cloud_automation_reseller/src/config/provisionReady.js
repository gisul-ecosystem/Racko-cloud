/** True when reseller can launch VMs on this provider (env + network configured). */
export function isProvisionReady(provider) {
  const p = String(provider || '').toLowerCase();
  switch (p) {
    case 'aws':
      return Boolean(
        process.env.AWS_ACCESS_KEY_ID &&
          process.env.AWS_SECRET_ACCESS_KEY &&
          process.env.AWS_DEFAULT_AMI_ID &&
          process.env.AWS_SUBNET_ID &&
          process.env.AWS_SECURITY_GROUP_ID
      );
    case 'azure':
      return Boolean(
        process.env.AZURE_SUBSCRIPTION_ID &&
          process.env.AZURE_RESOURCE_GROUP &&
          process.env.AZURE_VNET_NAME &&
          process.env.AZURE_SUBNET_NAME
      );
    case 'oci':
      return Boolean(
        process.env.OCI_TENANCY_OCID &&
          process.env.OCI_USER_OCID &&
          process.env.OCI_FINGERPRINT &&
          (process.env.OCI_PRIVATE_KEY || process.env.OCI_PRIVATE_KEY_PATH) &&
          process.env.OCI_COMPARTMENT_OCID &&
          process.env.OCI_SUBNET_OCID
      );
    case 'gcp':
      return Boolean(
        process.env.GCP_PROJECT_ID &&
          process.env.GCP_ZONE &&
          (process.env.GCP_SERVICE_ACCOUNT_KEY_PATH || process.env.GCP_SERVICE_ACCOUNT_KEY)
      );
    default:
      return false;
  }
}

/** Keep only providers that can be auto-provisioned with current env. */
export function filterProvisionReadyProviders(providers) {
  return (providers || []).filter(isProvisionReady);
}
