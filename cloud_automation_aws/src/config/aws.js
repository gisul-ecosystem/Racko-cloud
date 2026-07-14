import { BudgetsClient } from '@aws-sdk/client-budgets';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { CostExplorerClient } from '@aws-sdk/client-cost-explorer';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { EC2Client } from '@aws-sdk/client-ec2';
import { EKSClient } from '@aws-sdk/client-eks';
import { ElastiCacheClient } from '@aws-sdk/client-elasticache';
import { EMRClient } from '@aws-sdk/client-emr';
import { IAMClient } from '@aws-sdk/client-iam';
import { KinesisClient } from '@aws-sdk/client-kinesis';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { LightsailClient } from '@aws-sdk/client-lightsail';
import { OpenSearchClient } from '@aws-sdk/client-opensearch';
import { OrganizationsClient } from '@aws-sdk/client-organizations';
import { PricingClient } from '@aws-sdk/client-pricing';
import { RDSClient } from '@aws-sdk/client-rds';
import { RedshiftClient } from '@aws-sdk/client-redshift';
import { S3Client } from '@aws-sdk/client-s3';
import { SageMakerClient } from '@aws-sdk/client-sagemaker';
import { SNSClient } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

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
export const s3Client = new S3Client({
  ...regionalConfig,
  followRegionRedirects: true,
});
export const eksClient = new EKSClient(regionalConfig);
export const rdsClient = new RDSClient(regionalConfig);
export const lambdaClient = new LambdaClient(regionalConfig);
export const elastiCacheClient = new ElastiCacheClient(regionalConfig);
export const redshiftClient = new RedshiftClient(regionalConfig);
export const openSearchClient = new OpenSearchClient(regionalConfig);
export const sageMakerClient = new SageMakerClient(regionalConfig);
export const kinesisClient = new KinesisClient(regionalConfig);
export const snsClient = new SNSClient(regionalConfig);
export const dynamoDBClient = new DynamoDBClient(regionalConfig);
export const lightsailClient = new LightsailClient(regionalConfig);
export const cloudFrontClient = new CloudFrontClient(globalConfig);
export const sqsClient = new SQSClient(regionalConfig);
export const pricingClient = new PricingClient({
  region: 'us-east-1',
  credentials,
});

export function createRegionalAwsClients(requestRegion, clientCredentials = credentials) {
  const requestedRegion = String(requestRegion || region).trim() || region;
  const config = { region: requestedRegion, credentials: clientCredentials };
  const regionalEc2Client = new EC2Client(config);

  return {
    EC2: regionalEc2Client,
    VPC: regionalEc2Client,
    RDS: new RDSClient(config),
    S3: new S3Client({ ...config, followRegionRedirects: true }),
    EKS: new EKSClient(config),
    Lambda: new LambdaClient(config),
    ElastiCache: new ElastiCacheClient(config),
    Redshift: new RedshiftClient(config),
    OpenSearch: new OpenSearchClient(config),
    SageMaker: new SageMakerClient(config),
    Kinesis: new KinesisClient(config),
    SNS: new SNSClient(config),
    SQS: new SQSClient(config),
    DynamoDB: new DynamoDBClient(config),
    Lightsail: new LightsailClient(config),
    CloudFront: cloudFrontClient,
    EMR: new EMRClient(config),
  };
}

export async function createRegionalAwsClientsForAccount(requestRegion, accountId) {
  const targetAccountId = String(accountId || MASTER_ACCOUNT_ID || '').trim();
  if (!targetAccountId || targetAccountId === String(MASTER_ACCOUNT_ID || '').trim()) {
    return createRegionalAwsClients(requestRegion);
  }

  const roleName = process.env.RACKO_LAB_ADMIN_ROLE_NAME || 'RackoLabAdmin';
  const { Credentials } = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: `arn:aws:iam::${targetAccountId}:role/${roleName}`,
      RoleSessionName: 'RackoResourceCleanup',
      DurationSeconds: 3600,
    })
  );
  if (!Credentials) {
    throw new Error(`Unable to assume cleanup role in AWS account ${targetAccountId}`);
  }
  return createRegionalAwsClients(requestRegion, {
    accessKeyId: Credentials.AccessKeyId,
    secretAccessKey: Credentials.SecretAccessKey,
    sessionToken: Credentials.SessionToken,
  });
}
