/**
 * Azure RBAC role classification for control-plane vs data-plane coverage audits.
 * Control-plane roles include Microsoft.Resources/subscriptions/resourceGroups/read.
 */

const DATA_PLANE_ONLY_ROLES = new Set([
  'Storage Blob Data Contributor',
  'Storage Blob Data Reader',
  'Storage Blob Data Owner',
  'Key Vault Secrets Officer',
  'Key Vault Secrets User',
  'Key Vault Reader',
  'Azure Service Bus Data Owner',
  'Azure Service Bus Data Sender',
  'Azure Service Bus Data Receiver',
  'Service Bus Data Owner',
  'Service Bus Data Sender',
  'Service Bus Data Receiver',
  'Cognitive Services User',
  'Cognitive Services Speech User',
  'Search Index Data Contributor',
  'Search Index Data Reader',
  'EventGrid Data Sender',
  'AzureML Compute Operator',
  'AcrPull',
  'AcrPush',
  'Log Analytics Reader'
]);

const CONTROL_PLANE_ROLES = new Set([
  'Reader',
  'Contributor',
  'Owner',
  'Virtual Machine Contributor',
  'Virtual Machine User Login',
  'Virtual Machine Administrator Login',
  'Azure Kubernetes Service Cluster Admin Role',
  'Azure Kubernetes Service Cluster User Role',
  'Website Contributor',
  'SQL DB Contributor',
  'Network Contributor',
  'Network Reader',
  'CDN Endpoint Contributor',
  'Application Gateway Contributor',
  'User Administrator',
  'Directory Readers',
  'Security Admin',
  'Security Reader',
  'Logic App Contributor',
  'Logic App Operator',
  'Monitoring Contributor',
  'Monitoring Reader',
  'Project Administrator',
  'Cognitive Services OpenAI Contributor',
  'Azure AI Developer',
  'Search Service Contributor',
  'AzureML Data Scientist',
  'Cognitive Services Contributor',
  'EventGrid Contributor',
  'Cosmos DB Operator',
  'Cosmos DB Account Reader Role',
  'Storage Account Contributor',
  'API Management Service Contributor',
  'API Management Service Reader',
  'API Management Service Operator Role',
  'Log Analytics Contributor',
  'Log Analytics Reader'
]);

const isControlPlaneRole = (roleName) => CONTROL_PLANE_ROLES.has(roleName);

const isDataPlaneOnlyRole = (roleName) => DATA_PLANE_ONLY_ROLES.has(roleName);

module.exports = {
  DATA_PLANE_ONLY_ROLES,
  CONTROL_PLANE_ROLES,
  isControlPlaneRole,
  isDataPlaneOnlyRole
};
