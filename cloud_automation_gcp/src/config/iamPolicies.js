/** Default IAM roles per GCP catalog service. */
export const DEFAULT_IAM_ROLES = {
  'Compute Engine': 'roles/compute.instanceAdmin.v1',
  'Cloud Run': 'roles/run.developer',
  'Cloud Functions': 'roles/cloudfunctions.developer',
  'App Engine': 'roles/appengine.appAdmin',
  'Cloud SQL': 'roles/cloudsql.client',
  Firestore: 'roles/datastore.user',
  'Cloud Spanner': 'roles/spanner.databaseUser',
  Memorystore: 'roles/redis.editor',
  Bigtable: 'roles/bigtable.user',
  'Cloud Storage': 'roles/storage.objectAdmin',
  Filestore: 'roles/file.editor',
  GKE: 'roles/container.developer',
  'Artifact Registry': 'roles/artifactregistry.reader',
  VPC: 'roles/compute.networkAdmin',
  'Cloud DNS': 'roles/dns.admin',
  'Cloud CDN': 'roles/compute.loadBalancerAdmin',
  'Cloud Load Balancing': 'roles/compute.loadBalancerAdmin',
  BigQuery: 'roles/bigquery.dataEditor',
  Dataflow: 'roles/dataflow.developer',
  Dataproc: 'roles/dataproc.editor',
  'Pub/Sub': 'roles/pubsub.editor',
  'Vertex AI': 'roles/aiplatform.user',
  'Cloud Vision': 'roles/visionai.viewer',
  'Secret Manager': 'roles/secretmanager.admin',
  'Cloud KMS': 'roles/cloudkms.admin',
};

export const SERVICE_IAM_ROLES = Object.fromEntries(
  Object.entries(DEFAULT_IAM_ROLES).map(([name, role]) => [name, [role, 'roles/viewer']])
);

export function resolveDefaultRole(serviceName) {
  return DEFAULT_IAM_ROLES[serviceName] || 'roles/viewer';
}
