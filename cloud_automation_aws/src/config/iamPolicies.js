/** IAM action prefixes per catalog service — source of truth for inline permission-set policies. */
export const SERVICE_IAM_ACTIONS = {
  EC2: ['ec2:*', 'elasticloadbalancing:*', 'autoscaling:*', 'ecr:*'],
  Lightsail: ['lightsail:*'],
  RDS: ['rds:*'],
  DynamoDB: ['dynamodb:*'],
  ElastiCache: ['elasticache:*'],
  Redshift: ['redshift:*', 'redshift-data:*'],
  S3: ['s3:*'],
  EKS: ['eks:*'],
  Lambda: ['lambda:*'],
  VPC: [
    'ec2:Describe*',
    'ec2:CreateVpc',
    'ec2:DeleteVpc',
    'ec2:ModifyVpcAttribute',
    'ec2:CreateSubnet',
    'ec2:DeleteSubnet',
    'ec2:ModifySubnetAttribute',
    'ec2:CreateNatGateway',
    'ec2:DeleteNatGateway',
    'ec2:CreateInternetGateway',
    'ec2:DeleteInternetGateway',
    'ec2:AttachInternetGateway',
    'ec2:DetachInternetGateway',
    'ec2:CreateRouteTable',
    'ec2:DeleteRouteTable',
    'ec2:CreateRoute',
    'ec2:DeleteRoute',
    'ec2:AssociateRouteTable',
    'ec2:DisassociateRouteTable',
    'ec2:AllocateAddress',
    'ec2:ReleaseAddress',
    'ec2:AssociateAddress',
    'ec2:DisassociateAddress',
    'ec2:CreateSecurityGroup',
    'ec2:DeleteSecurityGroup',
    'ec2:AuthorizeSecurityGroupIngress',
    'ec2:AuthorizeSecurityGroupEgress',
    'ec2:RevokeSecurityGroupIngress',
    'ec2:RevokeSecurityGroupEgress',
    'ec2:CreateNetworkAcl',
    'ec2:DeleteNetworkAcl',
    'ec2:CreateNetworkAclEntry',
    'ec2:DeleteNetworkAclEntry',
    'ec2:ReplaceNetworkAclEntry',
    'ec2:ReplaceNetworkAclAssociation',
    'ec2:CreateNetworkInterface',
    'ec2:DeleteNetworkInterface',
    'ec2:ModifyNetworkInterfaceAttribute',
    'ec2:AttachNetworkInterface',
    'ec2:DetachNetworkInterface',
    'ec2:CreateVpcPeeringConnection',
    'ec2:DeleteVpcPeeringConnection',
    'ec2:AcceptVpcPeeringConnection',
    'ec2:RejectVpcPeeringConnection',
    'ec2:CreateFlowLogs',
    'ec2:DeleteFlowLogs',
  ],
  CloudFront: ['cloudfront:*'],
  SQS: ['sqs:*'],
  SNS: ['sns:*'],
  Kinesis: ['kinesis:*', 'firehose:*'],
  EMR: ['elasticmapreduce:*'],
  OpenSearch: ['es:*', 'aoss:*'],
  SageMaker: ['sagemaker:*'],
};

const READ_ONLY_SUFFIXES = ['Get*', 'List*', 'Describe*', 'BatchGet*', 'View*', 'Is*'];

function buildReadOnlyActions(fullActions) {
  const actions = [];

  for (const action of fullActions) {
    if (action.endsWith(':*')) {
      const prefix = action.slice(0, -1);
      for (const suffix of READ_ONLY_SUFFIXES) {
        actions.push(`${prefix}${suffix}`);
      }
      continue;
    }

    if (/:(Get|List|Describe|View|BatchGet|Is)/.test(action)) {
      actions.push(action);
    }
  }

  return [...new Set(actions)];
}

function buildInlinePolicyDocument(actions) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: actions,
        Resource: '*',
      },
    ],
  };
}

function buildCatalogIamPolicies() {
  const inlinePolicies = {};
  const servicePolicies = {};
  const defaults = {};

  for (const [service, actions] of Object.entries(SERVICE_IAM_ACTIONS)) {
    const fullName = `${service}FullAccess`;
    const readName = `${service}ReadOnlyAccess`;

    inlinePolicies[fullName] = buildInlinePolicyDocument(actions);
    inlinePolicies[readName] = buildInlinePolicyDocument(buildReadOnlyActions(actions));
    servicePolicies[service] = [fullName, readName];
    defaults[service] = fullName;
  }

  return { inlinePolicies, servicePolicies, defaults };
}

const catalogIamPolicies = buildCatalogIamPolicies();

export const SERVICE_IAM_POLICIES = catalogIamPolicies.servicePolicies;

/** Inline policies attached to Identity Center permission sets (avoids missing AWS managed policies). */
export const INLINE_IAM_POLICIES = catalogIamPolicies.inlinePolicies;

export const DEFAULT_IAM_POLICIES = catalogIamPolicies.defaults;

/** Map legacy AWS managed policy names stored on older requests to inline policy keys. */
export const INLINE_IAM_POLICY_ALIASES = {
  AmazonEC2FullAccess: 'EC2FullAccess',
  AmazonEC2ReadOnlyAccess: 'EC2ReadOnlyAccess',
  AmazonEC2ContainerRegistryFullAccess: 'EC2FullAccess',
  AmazonEC2ContainerRegistryReadOnly: 'EC2ReadOnlyAccess',
  AmazonRDSFullAccess: 'RDSFullAccess',
  AmazonRDSReadOnlyAccess: 'RDSReadOnlyAccess',
  AmazonRDSDataFullAccess: 'RDSFullAccess',
  AmazonS3FullAccess: 'S3FullAccess',
  AmazonS3ReadOnlyAccess: 'S3ReadOnlyAccess',
  AmazonS3ObjectLambdaExecutionRolePolicy: 'S3ReadOnlyAccess',
  AmazonEKSClusterPolicy: 'EKSFullAccess',
  AmazonEKSWorkerNodePolicy: 'EKSFullAccess',
  AmazonEKSAdminPolicy: 'EKSFullAccess',
  AmazonEKSViewPolicy: 'EKSReadOnlyAccess',
  AWSLambdaFullAccess: 'LambdaFullAccess',
  AWSLambdaReadOnlyAccess: 'LambdaReadOnlyAccess',
  AWSLambdaBasicExecutionRole: 'LambdaFullAccess',
  AWSLambdaVPCAccessExecutionRole: 'LambdaFullAccess',
  AmazonDynamoDBFullAccess: 'DynamoDBFullAccess',
  AmazonDynamoDBReadOnlyAccess: 'DynamoDBReadOnlyAccess',
  AmazonElastiCacheFullAccess: 'ElastiCacheFullAccess',
  AmazonElastiCacheReadOnlyAccess: 'ElastiCacheReadOnlyAccess',
  AmazonRedshiftFullAccess: 'RedshiftFullAccess',
  AmazonRedshiftReadOnlyAccess: 'RedshiftReadOnlyAccess',
  AmazonRedshiftDataFullAccess: 'RedshiftFullAccess',
  AmazonSQSFullAccess: 'SQSFullAccess',
  AmazonSQSReadOnlyAccess: 'SQSReadOnlyAccess',
  AmazonSNSFullAccess: 'SNSFullAccess',
  AmazonSNSReadOnlyAccess: 'SNSReadOnlyAccess',
  AmazonKinesisFullAccess: 'KinesisFullAccess',
  AmazonKinesisReadOnlyAccess: 'KinesisReadOnlyAccess',
  AmazonKinesisAnalyticsFullAccess: 'KinesisFullAccess',
  AmazonEMRFullAccessPolicy_v2: 'EMRFullAccess',
  AmazonEMRReadOnlyAccessPolicy_v2: 'EMRReadOnlyAccess',
  AmazonEMRServicePolicy_v2: 'EMRFullAccess',
  AmazonOpenSearchServiceFullAccess: 'OpenSearchFullAccess',
  AmazonOpenSearchServiceReadOnlyAccess: 'OpenSearchReadOnlyAccess',
  AmazonSageMakerFullAccess: 'SageMakerFullAccess',
  AmazonSageMakerReadOnly: 'SageMakerReadOnlyAccess',
  CloudFrontFullAccess: 'CloudFrontFullAccess',
  CloudFrontReadOnlyAccess: 'CloudFrontReadOnlyAccess',
  AmazonVPCFullAccess: 'VPCFullAccess',
  AmazonVPCReadOnlyAccess: 'VPCReadOnlyAccess',
  AmazonLightsailFullAccess: 'LightsailFullAccess',
  AmazonLightsailReadOnlyAccess: 'LightsailReadOnlyAccess',
};
