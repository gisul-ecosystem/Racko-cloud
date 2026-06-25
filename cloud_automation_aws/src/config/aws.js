import { BudgetsClient } from '@aws-sdk/client-budgets';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { CostExplorerClient } from '@aws-sdk/client-cost-explorer';
import { EC2Client } from '@aws-sdk/client-ec2';
import { EKSClient } from '@aws-sdk/client-eks';
import { IAMClient } from '@aws-sdk/client-iam';
import { OrganizationsClient } from '@aws-sdk/client-organizations';
import { PricingClient } from '@aws-sdk/client-pricing';
import { RDSClient } from '@aws-sdk/client-rds';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient } from '@aws-sdk/client-sts';

export {
  formatIdentityCenterError,
  IDENTITY_STORE_ID,
  identityStoreClient,
  initializeIdentityCenter,
  isIdentityCenterNotFoundError,
  SSO_INSTANCE_ARN,
  SSO_REGION,
  ssoAdminClient,
  validateIdentityCenterConfig,
} from './ssoConfig.js';

const region = process.env.AWS_REGION || 'ap-south-1';

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
};

const regionalConfig = { region, credentials };
const globalConfig = { region: 'us-east-1', credentials };

export const MASTER_ACCOUNT_ID = process.env.MASTER_ACCOUNT_ID;

export const ec2Client = new EC2Client(regionalConfig);
export const iamClient = new IAMClient(regionalConfig);
export const stsClient = new STSClient(regionalConfig);
export const cloudFormationClient = new CloudFormationClient(regionalConfig);
export const budgetsClient = new BudgetsClient(globalConfig);
export const costExplorerClient = new CostExplorerClient(globalConfig);
export const orgsClient = new OrganizationsClient(globalConfig);
export const cloudWatchClient = new CloudWatchClient(regionalConfig);
export const s3Client = new S3Client(regionalConfig);
export const eksClient = new EKSClient(regionalConfig);
export const rdsClient = new RDSClient(regionalConfig);
export const pricingClient = new PricingClient({
  region: 'us-east-1',
  credentials,
});
