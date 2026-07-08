/*
COMPLETE ROLE ASSIGNMENT MATRIX (auto-assigned during provisioning)

Service                          Own Roles                                    + Dependency Roles
─────────────────────────────────────────────────────────────────────────────────────────────────
Azure Virtual Machines (VMs)     Virtual Machine Contributor                  + Network Contributor
Azure Kubernetes Service (AKS)   AKS Cluster Admin Role                       + Network Contributor
                                                                               + Virtual Machine Contributor
Azure App Service                Website Contributor                          (none)
Azure Functions                  Contributor                                  (none)
Azure Blob Storage               Storage Account Contributor                  (none)
                                 Storage Blob Data Contributor
Azure SQL Database               SQL DB Contributor                           (none)
Azure Cosmos DB                  Cosmos DB Operator                           (none)
Azure Data Lake Storage          Storage Account Contributor                  (none)
                                 Storage Blob Data Contributor
Azure Virtual Network (VNet)     Network Contributor                          (none)
Azure CDN                        CDN Endpoint Contributor                     + Network Contributor
Azure Load Balancer              Network Contributor                          (none)
Azure Application Gateway        Application Gateway Contributor              + Network Contributor
Azure ExpressRoute               Network Contributor                          (none)
Microsoft Entra ID (Azure AD)    User Administrator                           (none)
Azure Key Vault                  Contributor                                  (none)
                                 Key Vault Secrets Officer
Microsoft Defender for Cloud     Security Admin                               (none)
Azure Service Bus                Contributor                                  (none)
                                 Azure Service Bus Data Owner
Azure Event Grid                 EventGrid Contributor                        (none)
Azure Logic Apps                 Logic App Contributor                        (none)
Azure Monitor                    Monitoring Contributor                       (none)
Application Insights             Monitoring Contributor                       (none)
Azure DevOps                     Project Administrator                        (none)
Azure OpenAI Service             Cognitive Services OpenAI Contributor        (none)
Azure AI Foundry                 Azure AI Developer                           + Storage Account Contributor
                                                                               + Storage Blob Data Contributor
                                                                               + Key Vault Secrets User
                                                                               + Key Vault Reader
                                                                               + Monitoring Reader
                                                                               + Contributor
                                                                               + Network Contributor
                                                                               + AcrPull
Azure AI Search                  Search Service Contributor                   (none)
Azure Machine Learning           Contributor                                  + Network Contributor
                                 AzureML Data Scientist                       + Storage Account Contributor
                                                                               + Storage Blob Data Contributor
Azure AI Vision                  Cognitive Services Contributor               (none)
Azure AI Language                Cognitive Services Contributor               (none)
Azure AI Speech                  Cognitive Services Contributor               (none)
Azure Bot Service                Contributor                                  (none)
Azure AI Document Intelligence   Cognitive Services Contributor               (none)
*/

/** Maps service name → additional roles to auto-assign (in addition to the service's own roles). */
const SERVICE_ROLE_DEPENDENCIES = {
  'Azure Virtual Machines (VMs)': [
    {
      role: 'Network Contributor',
      reason: 'Required to create NIC, VNet, subnet, public IP and NSG during VM creation'
    }
  ],

  'Azure Kubernetes Service (AKS)': [
    {
      role: 'Network Contributor',
      reason: 'Required for AKS node pool networking, load balancer, and ingress'
    },
    {
      role: 'Virtual Machine Contributor',
      reason: 'Required for AKS node VM management and scaling'
    }
  ],

  'Azure Application Gateway': [
    {
      role: 'Network Contributor',
      reason: 'Required for App Gateway frontend IP and VNet integration'
    }
  ],

  'Azure CDN': [
    {
      role: 'Network Contributor',
      reason: 'Required for CDN origin endpoint network configuration'
    }
  ],

  'Azure Machine Learning': [
    {
      role: 'Network Contributor',
      reason: 'Required for ML compute cluster VNet integration'
    },
    {
      role: 'Storage Account Contributor',
      reason: 'Required for ML workspace default storage account'
    },
    {
      role: 'Storage Blob Data Contributor',
      reason: 'Required for ML dataset and model artifact storage'
    }
  ],

  'Azure AI Foundry': [
    {
      role: 'Storage Account Contributor',
      reason: 'Required to access AI Foundry linked storage account for datasets and models'
    },
    {
      role: 'Storage Blob Data Contributor',
      reason: 'Required to read/write datasets, model artifacts and experiment outputs in blob storage'
    },
    {
      role: 'Key Vault Secrets User',
      reason: 'Required to read secrets from AI Foundry linked Key Vault'
    },
    {
      role: 'Key Vault Reader',
      reason: 'Required to list and navigate Key Vault resources linked to AI Foundry workspace'
    },
    {
      role: 'Monitoring Reader',
      reason: 'Required to read Application Insights metrics and logs linked to AI Foundry'
    },
    {
      role: 'Contributor',
      reason: 'Required to create and manage compute instances and clusters in AI Foundry'
    },
    {
      role: 'Network Contributor',
      reason: 'Required for AI Foundry compute cluster VNet integration'
    },
    {
      role: 'AcrPull',
      reason: 'Required to pull base images from Azure Container Registry for AI Foundry environments'
    }
  ],

  'Azure ExpressRoute': [
    {
      role: 'Network Contributor',
      reason: 'Required for ExpressRoute circuit VNet peering configuration'
    }
  ]
};

const getDependencyRolesForService = (serviceName) => SERVICE_ROLE_DEPENDENCIES[serviceName] || [];

const getAllDependencyRoles = (serviceNames = []) => {
  const roleSet = new Map();

  for (const serviceName of serviceNames) {
    const deps = SERVICE_ROLE_DEPENDENCIES[serviceName] || [];
    for (const dep of deps) {
      if (!roleSet.has(dep.role)) {
        roleSet.set(dep.role, dep.reason);
      }
    }
  }

  return Array.from(roleSet.entries()).map(([role, reason]) => ({ role, reason }));
};

module.exports = {
  SERVICE_ROLE_DEPENDENCIES,
  getDependencyRolesForService,
  getAllDependencyRoles
};
