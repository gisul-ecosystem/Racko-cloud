const pkgs = [
  ['@google-cloud/resource-manager', ['ProjectsClient']],
  ['@google-cloud/iam-credentials', ['IAMCredentialsClient']],
  ['@google-cloud/billing', ['CloudBillingClient']],
  ['@google-cloud/sql', ['SqlInstancesServiceClient']],
  ['@google-cloud/billing-budgets', ['BudgetServiceClient']],
  ['@google-cloud/logging', ['Logging']],
  ['@google-cloud/compute', ['InstancesClient', 'ImagesClient', 'ZoneOperationsClient']],
  ['@google-cloud/storage', ['Storage']],
  ['@google-cloud/container', ['ClusterManagerClient']],
  ['@google-cloud/run', ['ServicesClient']],
  ['@google-cloud/functions', ['CloudFunctionsServiceClient']],
  ['@google-cloud/bigquery', ['BigQuery']],
  ['@google-cloud/pubsub', ['PubSub']],
  ['@google-cloud/monitoring', ['MetricServiceClient']],
  ['@google-cloud/firestore', ['Firestore']],
];

for (const [pkg, names] of pkgs) {
  const mod = await import(pkg);
  for (const n of names) {
    const ok = mod[n] ?? mod.default?.[n];
    console.log(ok ? 'OK' : 'MISSING', pkg, n);
  }
}
