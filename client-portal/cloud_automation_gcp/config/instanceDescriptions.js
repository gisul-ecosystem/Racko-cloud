/** Short blurbs for GCP machine / tier options in create-request flow. */
export const INSTANCE_DESCRIPTIONS = {
  'e2-micro': '0.25 vCPU, 1 GiB — smallest VM for dev and demos',
  'e2-small': '0.5 vCPU, 2 GiB — light web apps and testing',
  'e2-medium': '1 vCPU, 4 GiB — moderate dev/staging workloads',
  'e2-standard-2': '2 vCPU, 8 GiB — general-purpose lab VMs',
  'e2-standard-4': '4 vCPU, 16 GiB — multi-service student labs',
  'e2-standard-8': '8 vCPU, 32 GiB — heavier compute labs',
  'n1-standard-4': '4 vCPU, 15 GiB — ML / GPU-adjacent workloads',
  'n1-standard-8': '8 vCPU, 30 GiB — larger training environments',
  'db-f1-micro': 'Shared-core Cloud SQL — dev/test databases',
  'db-g1-small': 'Small Cloud SQL — light production-shaped labs',
  'db-custom-2-7680': '2 vCPU, 7.5 GiB Cloud SQL — standard DB labs',
  'gke-small': 'Small GKE cluster footprint (3 nodes)',
  'gke-standard': 'Standard GKE cluster for container labs',
  'spanner-1-node': 'Single Spanner node — global SQL labs',
  'bigtable-1-node': 'Single Bigtable cluster node',
  'redis-basic-m1': 'Basic Memorystore Redis — caching labs',
  'dataproc-n1-standard-2': 'Small Dataproc cluster for Spark/Hadoop',
};

export function getInstanceDescription(instanceType) {
  return INSTANCE_DESCRIPTIONS[instanceType] ?? null;
}
