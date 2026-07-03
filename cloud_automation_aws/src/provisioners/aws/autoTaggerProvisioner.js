import {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  UpdateFunctionConfigurationCommand,
  AddPermissionCommand,
} from '@aws-sdk/client-lambda';
import {
  CloudWatchEventsClient,
  PutRuleCommand,
  PutTargetsCommand,
} from '@aws-sdk/client-cloudwatch-events';
import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand,
} from '@aws-sdk/client-iam';
import { AssumeRoleCommand } from '@aws-sdk/client-sts';
import AdmZip from 'adm-zip';
import { iamClient, stsClient, MASTER_ACCOUNT_ID, lambdaClient } from '../../config/aws.js';
import { LAMBDA_CODE } from './autoTaggerLambda.js';

const LAB_ADMIN_ROLE_NAME = process.env.RACKO_LAB_ADMIN_ROLE_NAME || 'RackoLabAdmin';
const REGION = process.env.AWS_REGION || 'ap-south-1';

const regionalConfig = {
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

const LAMBDA_EXECUTION_POLICIES = [
  'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
  'arn:aws:iam::aws:policy/AmazonEC2FullAccess',
  'arn:aws:iam::aws:policy/AmazonRDSFullAccess',
  'arn:aws:iam::aws:policy/AmazonS3FullAccess',
  'arn:aws:iam::aws:policy/AWSLambda_FullAccess',
  'arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess',
];

async function getClientsForAccount(accountId) {
  const normalizedAccountId = String(accountId).trim();

  if (normalizedAccountId === String(MASTER_ACCOUNT_ID || '').trim()) {
    return {
      lambda: lambdaClient,
      events: new CloudWatchEventsClient(regionalConfig),
      iam: iamClient,
      accountId: normalizedAccountId,
    };
  }

  const roleArn = `arn:aws:iam::${normalizedAccountId}:role/${LAB_ADMIN_ROLE_NAME}`;
  const { Credentials } = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'RackoAutoTagger',
      DurationSeconds: 3600,
    })
  );

  if (!Credentials) {
    throw new Error(`Failed to assume ${roleArn}`);
  }

  const credentials = {
    accessKeyId: Credentials.AccessKeyId,
    secretAccessKey: Credentials.SecretAccessKey,
    sessionToken: Credentials.SessionToken,
  };
  const clientConfig = { region: REGION, credentials };

  return {
    lambda: new LambdaClient(clientConfig),
    events: new CloudWatchEventsClient(clientConfig),
    iam: new IAMClient(clientConfig),
    accountId: normalizedAccountId,
  };
}

async function createLambdaRole(iam) {
  const roleName = 'RackoAutoTaggerRole';

  try {
    const { Role } = await iam.send(new GetRoleCommand({ RoleName: roleName }));
    return Role.Arn;
  } catch (err) {
    if (err.name !== 'NoSuchEntityException') throw err;
  }

  const { Role } = await iam.send(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      }),
    })
  );

  for (const policyArn of LAMBDA_EXECUTION_POLICIES) {
    await iam.send(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: policyArn,
      })
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 10000));
  return Role.Arn;
}

function buildResourceSuffix(requestId) {
  return String(requestId).replace(/[^a-zA-Z0-9-]/g, '').slice(-12);
}

export async function deployAutoTagger(accountId, requestId) {
  const { lambda, events, iam } = await getClientsForAccount(accountId);
  const roleArn = await createLambdaRole(iam);
  const suffix = buildResourceSuffix(requestId);

  const zip = new AdmZip();
  zip.addFile('index.js', Buffer.from(LAMBDA_CODE));
  const zipBuffer = zip.toBuffer();

  const functionName = `RackoAutoTagger-${suffix}`;
  const ruleName = `RackoAutoTag-${suffix}`;

  let functionExists = false;
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
    functionExists = true;
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
  }

  if (!functionExists) {
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs20.x',
        Role: roleArn,
        Handler: 'index.handler',
        Code: { ZipFile: zipBuffer },
        Timeout: 30,
        Environment: {
          Variables: {
            RACKO_REQUEST_ID: String(requestId),
          },
        },
        Tags: {
          'racko:request': String(requestId),
          'racko:managed': 'true',
        },
      })
    );
    console.log(`[AutoTagger] Deployed Lambda ${functionName} in account ${accountId}`);
  } else {
    await lambda.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: functionName,
        Environment: { Variables: { RACKO_REQUEST_ID: String(requestId) } },
      })
    );
  }

  const { Configuration } = await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
  const lambdaArn = Configuration.FunctionArn;

  const { RuleArn } = await events.send(
    new PutRuleCommand({
      Name: ruleName,
      EventPattern: JSON.stringify({
        source: [
          'aws.ec2',
          'aws.rds',
          'aws.s3',
          'aws.lambda',
          'aws.dynamodb',
          'aws.elasticache',
          'aws.redshift',
          'aws.es',
          'aws.kinesis',
          'aws.sqs',
          'aws.sns',
        ],
        'detail-type': ['AWS API Call via CloudTrail'],
        detail: {
          eventName: [
            'RunInstances',
            'CreateVolume',
            'CreateSecurityGroup',
            'CreateDBInstance',
            'CreateBucket',
            'CreateFunction20150331',
            'CreateTable',
            'CreateCacheCluster',
            'CreateCluster',
            'CreateDomain',
            'CreateStream',
            'CreateQueue',
            'CreateTopic',
          ],
        },
      }),
      State: 'ENABLED',
    })
  );

  try {
    await lambda.send(
      new AddPermissionCommand({
        FunctionName: functionName,
        StatementId: `AllowEventBridge-${suffix}`.slice(0, 100),
        Action: 'lambda:InvokeFunction',
        Principal: 'events.amazonaws.com',
        SourceArn: RuleArn,
      })
    );
  } catch (err) {
    if (err.name !== 'ResourceConflictException') throw err;
  }

  await events.send(
    new PutTargetsCommand({
      Rule: ruleName,
      Targets: [{ Id: 'AutoTagger', Arn: lambdaArn }],
    })
  );

  console.log(`[AutoTagger] EventBridge rule active for account ${accountId}`);
  return { functionName, lambdaArn, ruleName, ruleArn: RuleArn };
}
