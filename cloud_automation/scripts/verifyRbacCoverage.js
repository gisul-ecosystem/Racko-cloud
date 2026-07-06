require('dotenv').config();
const db = require('../src/db/postgres');
const { isControlPlaneRole } = require('../src/config/rbacRoleClassification');

/** Expected auto_assign roles from supabase_full_catalog_seed.sql (31 services) */
const SEED_AUTO_ASSIGN_ROLES = [
  ['Azure Virtual Machines (VMs)', ['Virtual Machine Contributor', 'Network Contributor']],
  ['Azure Kubernetes Service (AKS)', ['Azure Kubernetes Service Cluster Admin Role', 'Network Contributor', 'Virtual Machine Contributor']],
  ['Azure App Service', ['Website Contributor']],
  ['Azure Functions', ['Contributor']],
  ['Azure Blob Storage', ['Storage Account Contributor', 'Storage Blob Data Contributor']],
  ['Azure SQL Database', ['SQL DB Contributor']],
  ['Azure Cosmos DB', ['Cosmos DB Operator']],
  ['Azure Data Lake Storage', ['Storage Account Contributor', 'Storage Blob Data Contributor']],
  ['Azure Virtual Network (VNet)', ['Network Contributor']],
  ['Azure CDN', ['CDN Endpoint Contributor', 'Network Contributor']],
  ['Azure Load Balancer', ['Network Contributor']],
  ['Azure Application Gateway', ['Application Gateway Contributor', 'Network Contributor']],
  ['Azure ExpressRoute', ['Network Contributor']],
  ['Microsoft Entra ID (Azure AD)', ['User Administrator']],
  ['Azure Key Vault', ['Contributor', 'Key Vault Secrets Officer']],
  ['Microsoft Defender for Cloud', ['Security Admin']],
  ['Azure Service Bus', ['Contributor', 'Azure Service Bus Data Owner']],
  ['Azure Event Grid', ['EventGrid Contributor']],
  ['Azure Logic Apps', ['Logic App Contributor']],
  ['Azure Monitor', ['Monitoring Contributor']],
  ['Application Insights', ['Monitoring Contributor']],
  ['Azure DevOps', ['Project Administrator']],
  ['Azure OpenAI Service', ['Cognitive Services OpenAI Contributor']],
  ['Azure AI Foundry', ['Azure AI Developer', 'Storage Account Contributor', 'Storage Blob Data Contributor']],
  ['Azure AI Search', ['Search Service Contributor']],
  ['Azure Machine Learning', ['Contributor', 'AzureML Data Scientist', 'Network Contributor', 'Storage Account Contributor', 'Storage Blob Data Contributor']],
  ['Azure AI Vision', ['Cognitive Services Contributor']],
  ['Azure AI Language', ['Cognitive Services Contributor']],
  ['Azure AI Speech', ['Cognitive Services Contributor']],
  ['Azure Bot Service', ['Contributor']],
  ['Azure AI Document Intelligence', ['Cognitive Services Contributor']]
];

function auditSeedCatalog() {
  const issues = [];

  for (const [serviceName, roles] of SEED_AUTO_ASSIGN_ROLES) {
    const hasControlPlane = roles.some((roleName) => isControlPlaneRole(roleName));
    if (!hasControlPlane) {
      issues.push({
        service: serviceName,
        currentRoles: roles,
        problem: 'No control-plane role among auto_assign defaults'
      });
    }
  }

  console.log(`\n=== RBAC SEED AUDIT: ${issues.length} services with issues (${SEED_AUTO_ASSIGN_ROLES.length} total) ===\n`);

  if (issues.length === 0) {
    console.log('✅ All 31 services have correct control-plane RBAC coverage');
  } else {
    for (const issue of issues) {
      console.log(`❌ ${issue.service}`);
      console.log(`   Current auto_assign roles: ${issue.currentRoles.join(', ')}`);
      console.log(`   Fix: ${issue.problem}\n`);
    }
  }

  return issues;
}

async function auditAllServices() {
  const services = await db.query(`
    SELECT DISTINCT s.id, s.name AS service_name
    FROM services s
    INNER JOIN service_role_mapping srm ON srm.service_id = s.id
    WHERE s.active = true
    ORDER BY s.name
  `);

  const issues = [];

  for (const { id, service_name } of services.rows) {
    const roles = await db.query(
      `
        SELECT azure_role, COALESCE(auto_assign, false) AS auto_assign, role_purpose
        FROM service_role_mapping
        WHERE service_id = $1 AND COALESCE(auto_assign, false) = true
        ORDER BY azure_role
      `,
      [id]
    );

    const defaultRoles = roles.rows.map((row) => row.azure_role);
    const hasControlPlane = defaultRoles.some((roleName) => isControlPlaneRole(roleName));

    if (!hasControlPlane) {
      issues.push({
        service: service_name,
        currentRoles: defaultRoles,
        problem: 'No control-plane role among auto_assign defaults — will fail on resource group access'
      });
    }
  }

  const serviceCount = services.rows.length;
  console.log(`\n=== RBAC AUDIT: ${issues.length} services with issues (${serviceCount} total) ===\n`);

  if (issues.length === 0) {
    console.log(`✅ All services have correct control-plane RBAC coverage`);
  } else {
    for (const issue of issues) {
      console.log(`❌ ${issue.service}`);
      console.log(`   Current auto_assign roles: ${issue.currentRoles.join(', ') || '(none)'}`);
      console.log(`   Fix: ${issue.problem}\n`);
    }
  }

  return issues;
}

const useSeedMode = process.argv.includes('--seed');

if (useSeedMode) {
  const issues = auditSeedCatalog();
  process.exit(issues.length === 0 ? 0 : 1);
}

auditAllServices()
  .then((issues) => {
    process.exit(issues.length === 0 ? 0 : 1);
  })
  .catch(async (error) => {
    console.error('Audit failed:', error.message);
    try {
      await db.end();
    } catch (_) {
      // ignore
    }
    process.exit(1);
  })
  .finally(async () => {
    try {
      await db.end();
    } catch (_) {
      // ignore
    }
  });
