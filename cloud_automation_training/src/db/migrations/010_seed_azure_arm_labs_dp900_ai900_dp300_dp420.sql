-- ARM Azure certification labs (no Fabric license required).

-- DP-900 read-only; AI-900 / DP-300 / DP-420 write-capable lab packs.



INSERT INTO lab_templates (

  name,

  cert_tag,

  cloud,

  services,

  rbac_actions,

  entra_directory_role,

  region,

  duration_hours,

  budget_cap_inr,

  active

)

VALUES

(

  'Azure Data Fundamentals',

  'DP-900',

  'azure',

  '[

    {

      "name": "Azure SQL Database",

      "roles": ["Reader"],

      "defaultInstance": "Basic",

      "access": "read"

    },

    {

      "name": "Azure Cosmos DB",

      "roles": ["Cosmos DB Account Reader Role"],

      "defaultInstance": "Serverless",

      "access": "read"

    },

    {

      "name": "Azure Blob Storage",

      "roles": ["Storage Blob Data Reader", "Reader"],

      "defaultInstance": "Hot",

      "access": "read"

    }

  ]'::jsonb,

  '[

    "Reader on Microsoft.Sql/servers/databases",

    "Cosmos DB Account Reader Role",

    "Storage Blob Data Reader + Reader on storage",

    "Reader on resource groups"

  ]'::jsonb,

  NULL,

  'eastus',

  40,

  2500.00,

  true

),

(

  'Azure AI Fundamentals',

  'AI-900',

  'azure',

  '[

    {

      "name": "Azure AI Foundry",

      "roles": ["Azure AI Developer", "Contributor"],

      "defaultInstance": "Starter",

      "access": "write"

    },

    {

      "name": "Azure Machine Learning",

      "roles": ["Contributor", "AzureML Data Scientist"],

      "defaultInstance": "Basic Compute",

      "access": "write"

    },

    {

      "name": "Azure Blob Storage",

      "roles": ["Storage Account Contributor", "Storage Blob Data Contributor"],

      "defaultInstance": "Hot",

      "access": "write"

    }

  ]'::jsonb,

  '[

    "Azure AI Developer + Contributor (Cognitive / Foundry)",

    "Contributor on Microsoft.MachineLearningServices/workspaces",

    "Storage Account Contributor + Storage Blob Data Contributor"

  ]'::jsonb,

  NULL,

  'eastus',

  40,

  5000.00,

  true

),

(

  'Administering Azure SQL Solutions',

  'DP-300',

  'azure',

  '[

    {

      "name": "Azure SQL Database",

      "roles": ["SQL DB Contributor", "Contributor"],

      "defaultInstance": "S0",

      "access": "write"

    },

    {

      "name": "Azure Virtual Machines (VMs)",

      "roles": ["Virtual Machine Contributor"],

      "defaultInstance": "B2s",

      "access": "write",

      "note": "IaaS SQL Server path — license may apply depending on image"

    },

    {

      "name": "Azure Blob Storage",

      "roles": ["Storage Account Contributor", "Storage Blob Data Contributor"],

      "defaultInstance": "Hot",

      "access": "write"

    }

  ]'::jsonb,

  '[

    "SQL DB Contributor / Contributor on Microsoft.Sql/servers",

    "Virtual Machine Contributor (SQL on Azure VM / IaaS)",

    "Storage Account Contributor",

    "Note: SQL Managed Instance uses Contributor on SQL resources when available in subscription"

  ]'::jsonb,

  NULL,

  'eastus',

  40,

  8000.00,

  true

),

(

  'Cosmos DB Developer Specialty',

  'DP-420',

  'azure',

  '[

    {

      "name": "Azure Cosmos DB",

      "roles": ["Cosmos DB Operator", "Contributor"],

      "defaultInstance": "Serverless",

      "access": "write"

    },

    {

      "name": "Azure Functions",

      "roles": ["Contributor"],

      "defaultInstance": "Consumption Plan",

      "access": "write"

    }

  ]'::jsonb,

  '[

    "Cosmos DB Operator / Contributor on Microsoft.DocumentDB/databaseAccounts",

    "Contributor on Microsoft.Web/sites (Azure Functions)"

  ]'::jsonb,

  NULL,

  'eastus',

  40,

  6000.00,

  true

)

ON CONFLICT (cert_tag) DO UPDATE SET

  name = EXCLUDED.name,

  cloud = EXCLUDED.cloud,

  services = EXCLUDED.services,

  rbac_actions = EXCLUDED.rbac_actions,

  region = EXCLUDED.region,

  duration_hours = EXCLUDED.duration_hours,

  budget_cap_inr = EXCLUDED.budget_cap_inr,

  active = true,

  updated_at = now();


