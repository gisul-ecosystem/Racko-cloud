/** Per-service IAM actions for lab inline policies — full vs read-only. */
export const INLINE_POLICY_ACTIONS = {
  ec2: {
    full: [
      'ec2:*',
      'elasticloadbalancing:*',
      'cloudwatch:*',
      'autoscaling:*',
      'ec2:CreateKeyPair',
      'ec2:DeleteKeyPair',
      'ec2:DescribeKeyPairs',
      'ec2:ImportKeyPair',
      'ecr:*',
    ],
    readOnly: [
      'ec2:Describe*',
      'ec2:Get*',
      'ec2:List*',
      'elasticloadbalancing:Describe*',
    ],
  },
  lightsail: {
    full: ['lightsail:*'],
    readOnly: ['lightsail:Get*', 'lightsail:IsVpcPeered'],
  },
  rds: {
    full: [
      'rds:*',
      'secretsmanager:GetSecretValue',
      'secretsmanager:CreateSecret',
      'secretsmanager:DescribeSecret',
      'kms:CreateGrant',
      'kms:DescribeKey',
      'kms:ListKeys',
    ],
    readOnly: ['rds:Describe*', 'rds:List*', 'rds:Download*'],
  },
  s3: {
    full: ['s3:*'],
    readOnly: ['s3:Get*', 's3:List*', 's3:HeadBucket', 's3:HeadObject'],
  },
  eks: {
    full: [
      'eks:*',
      'ec2:*',
      'ecr:GetAuthorizationToken',
      'ecr:BatchCheckLayerAvailability',
      'ecr:GetDownloadUrlForLayer',
      'ecr:BatchGetImage',
      'iam:CreateServiceLinkedRole',
      'iam:PassRole',
      'cloudformation:*',
    ],
    readOnly: ['eks:Describe*', 'eks:List*'],
  },
  lambda: {
    full: [
      'lambda:*',
      'iam:PassRole',
      'iam:CreateRole',
      'iam:AttachRolePolicy',
      'iam:GetRole',
      'logs:CreateLogGroup',
      'logs:CreateLogStream',
      'logs:PutLogEvents',
      'logs:DescribeLogGroups',
      'logs:DescribeLogStreams',
      'apigateway:*',
    ],
    readOnly: ['lambda:Get*', 'lambda:List*', 'logs:Describe*', 'logs:Get*'],
  },
  dynamodb: {
    full: ['dynamodb:*', 'application-autoscaling:*', 'cloudwatch:GetMetricStatistics'],
    readOnly: [
      'dynamodb:BatchGet*',
      'dynamodb:Describe*',
      'dynamodb:Get*',
      'dynamodb:List*',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
  },
  elasticache: {
    full: [
      'elasticache:*',
      'ec2:Describe*',
      'ec2:CreateSecurityGroup',
      'ec2:AuthorizeSecurityGroupIngress',
    ],
    readOnly: ['elasticache:Describe*', 'elasticache:List*'],
  },
  redshift: {
    full: [
      'redshift:*',
      'redshift-data:*',
      'redshift-serverless:*',
      'ec2:Describe*',
      'ec2:CreateSecurityGroup',
      'ec2:AuthorizeSecurityGroupIngress',
      's3:GetObject',
      's3:ListBucket',
      'iam:PassRole',
    ],
    readOnly: [
      'redshift:Describe*',
      'redshift:ViewQueriesInConsole',
      'redshift-data:Describe*',
      'redshift-data:List*',
    ],
  },
  emr: {
    full: [
      'elasticmapreduce:*',
      'ec2:*',
      'iam:PassRole',
      'iam:CreateServiceLinkedRole',
      's3:*',
      'cloudwatch:*',
    ],
    readOnly: [
      'elasticmapreduce:Describe*',
      'elasticmapreduce:List*',
      'elasticmapreduce:View*',
    ],
  },
  opensearch: {
    full: [
      'es:*',
      'aoss:*',
      'ec2:Describe*',
      'ec2:CreateSecurityGroup',
      'ec2:AuthorizeSecurityGroupIngress',
      'iam:CreateServiceLinkedRole',
      'cognito-idp:*',
      'cognito-identity:*',
    ],
    readOnly: ['es:Describe*', 'es:List*', 'es:ESHttpGet', 'es:ESHttpHead'],
  },
  sagemaker: {
    full: [
      'sagemaker:*',
      's3:*',
      'iam:PassRole',
      'iam:GetRole',
      'iam:CreateRole',
      'iam:AttachRolePolicy',
      'ecr:*',
      'logs:*',
      'cloudwatch:*',
      'ec2:Describe*',
      'ec2:CreateNetworkInterface',
      'ec2:CreateNetworkInterfacePermission',
      'ec2:DeleteNetworkInterface',
    ],
    readOnly: ['sagemaker:Describe*', 'sagemaker:List*', 'sagemaker:Get*'],
  },
  vpc: {
    full: [
      'ec2:*Vpc*',
      'ec2:*Subnet*',
      'ec2:*InternetGateway*',
      'ec2:*RouteTable*',
      'ec2:*SecurityGroup*',
      'ec2:*NetworkAcl*',
      'ec2:*NatGateway*',
      'ec2:*VpcEndpoint*',
      'ec2:*Peering*',
      'ec2:AllocateAddress',
      'ec2:ReleaseAddress',
      'ec2:DescribeAvailabilityZones',
      'ec2:DescribeRegions',
    ],
    readOnly: ['ec2:Describe*'],
  },
  cloudfront: {
    full: [
      'cloudfront:*',
      's3:GetObject',
      's3:ListBucket',
      'acm:ListCertificates',
      'acm:DescribeCertificate',
      'wafv2:*',
    ],
    readOnly: ['cloudfront:Get*', 'cloudfront:List*'],
  },
  sqs: {
    full: ['sqs:*'],
    readOnly: [
      'sqs:GetQueueAttributes',
      'sqs:GetQueueUrl',
      'sqs:ListQueues',
      'sqs:ListQueueTags',
      'sqs:ReceiveMessage',
    ],
  },
  sns: {
    full: ['sns:*'],
    readOnly: ['sns:GetSubscriptionAttributes', 'sns:GetTopicAttributes', 'sns:List*'],
  },
  kinesis: {
    full: ['kinesis:*', 'firehose:*', 'cloudwatch:GetMetricStatistics'],
    readOnly: ['kinesis:Describe*', 'kinesis:Get*', 'kinesis:List*'],
  },
};

/** Baseline permissions always included — prevents common console navigation errors. */
export const BASELINE_ACTIONS = [
  'iam:GetAccountSummary',
  'iam:GetAccountPasswordPolicy',
  'iam:ListAccountAliases',
  'iam:GetUser',
  'iam:GetUserPolicy',
  'iam:ListAttachedUserPolicies',
  'iam:ListUserPolicies',
  'iam:ChangePassword',
  'support:*',
  'ce:GetCostAndUsage',
  'ce:GetCostForecast',
  'ce:GetDimensionValues',
  'ce:GetTags',
  'ce:UpdateCostAllocationTagsStatus',
  'billing:GetBillingData',
  'billing:GetBillingDetails',
  'billing:ViewBilling',
  'budgets:ViewBudget',
  'cloudwatch:GetMetricData',
  'cloudwatch:GetMetricStatistics',
  'cloudwatch:ListMetrics',
  'cloudwatch:DescribeAlarms',
  'logs:DescribeLogGroups',
  'logs:DescribeLogStreams',
  'logs:GetLogEvents',
  'logs:FilterLogEvents',
  'servicequotas:Get*',
  'servicequotas:List*',
  'tag:GetResources',
  'tag:GetTagKeys',
  'tag:GetTagValues',
  'tag:TagResources',
  'tag:UntagResources',
  'resource-groups:*',
  'health:Describe*',
  'pricing:GetProducts',
  'pricing:DescribeServices',
];

const TAGGING_ACTIONS = [
  'ec2:CreateTags',
  'ec2:DeleteTags',
  'rds:AddTagsToResource',
  'rds:RemoveTagsFromResource',
  's3:PutObjectTagging',
  's3:DeleteObjectTagging',
  's3:PutBucketTagging',
  'elasticache:AddTagsToResource',
  'elasticache:RemoveTagsFromResource',
  'eks:TagResource',
  'eks:UntagResource',
  'lambda:TagResource',
  'lambda:UntagResource',
  'dynamodb:TagResource',
  'dynamodb:UntagResource',
  'redshift:CreateTags',
  'sqs:TagQueue',
  'sns:TagResource',
  'kinesis:AddTagsToStream',
  'sagemaker:AddTags',
  'sagemaker:DeleteTags',
  'es:AddTags',
  'lightsail:TagResource',
];

/** Catalog service display name → INLINE_POLICY_ACTIONS key. */
export const CATALOG_SERVICE_TO_KEY = {
  EC2: 'ec2',
  Lightsail: 'lightsail',
  RDS: 'rds',
  DynamoDB: 'dynamodb',
  ElastiCache: 'elasticache',
  Redshift: 'redshift',
  S3: 's3',
  EKS: 'eks',
  Lambda: 'lambda',
  VPC: 'vpc',
  CloudFront: 'cloudfront',
  SQS: 'sqs',
  SNS: 'sns',
  Kinesis: 'kinesis',
  EMR: 'emr',
  OpenSearch: 'opensearch',
  SageMaker: 'sagemaker',
};

function resolveServiceKey(permission) {
  const fromName = CATALOG_SERVICE_TO_KEY[permission.serviceName];
  if (fromName) return fromName;

  const lowered = String(permission.serviceName || permission.serviceId || '').toLowerCase();
  if (INLINE_POLICY_ACTIONS[lowered]) return lowered;

  return null;
}

function isReadOnlyPolicy(policies = []) {
  return policies.some((policy) => /ReadOnly/i.test(String(policy)));
}

function dedupeActions(actions = []) {
  return [...new Set(actions)];
}

const SERVICE_MANAGED_POLICIES = {
  ec2: ['arn:aws:iam::aws:policy/AmazonEC2FullAccess'],
  s3: ['arn:aws:iam::aws:policy/AmazonS3FullAccess'],
  rds: ['arn:aws:iam::aws:policy/AmazonRDSFullAccess'],
  eks: [
    'arn:aws:iam::aws:policy/AmazonEKSClusterPolicy',
    'arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy',
  ],
  lambda: ['arn:aws:iam::aws:policy/AWSLambda_FullAccess'],
  dynamodb: ['arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess'],
  elasticache: ['arn:aws:iam::aws:policy/AmazonElastiCacheFullAccess'],
  redshift: ['arn:aws:iam::aws:policy/AmazonRedshiftFullAccess'],
  opensearch: ['arn:aws:iam::aws:policy/AmazonOpenSearchServiceFullAccess'],
  sagemaker: ['arn:aws:iam::aws:policy/AmazonSageMakerFullAccess'],
  kinesis: ['arn:aws:iam::aws:policy/AmazonKinesisFullAccess'],
  sqs: ['arn:aws:iam::aws:policy/AmazonSQSFullAccess'],
  sns: ['arn:aws:iam::aws:policy/AmazonSNSFullAccess'],
  emr: ['arn:aws:iam::aws:policy/AmazonEMRFullAccessPolicy_v2'],
  cloudfront: ['arn:aws:iam::aws:policy/CloudFrontFullAccess'],
  lightsail: ['arn:aws:iam::aws:policy/AmazonLightsailFullAccess'],
  vpc: ['arn:aws:iam::aws:policy/AmazonVPCFullAccess'],
};

const SERVICE_READONLY_POLICIES = {
  ec2: ['arn:aws:iam::aws:policy/AmazonEC2ReadOnlyAccess'],
  s3: ['arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess'],
  rds: ['arn:aws:iam::aws:policy/AmazonRDSReadOnlyAccess'],
  dynamodb: ['arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess'],
};

export function getManagedPoliciesForRequest(request) {
  const arns = [];

  for (const permission of request.permissions || []) {
    const serviceKey =
      resolveServiceKey(permission) ||
      permission.serviceId ||
      permission.serviceName?.toLowerCase();
    const isReadOnly = permission.policies?.some((policy) => /ReadOnly/i.test(String(policy)));

    const policies = isReadOnly
      ? SERVICE_READONLY_POLICIES[serviceKey] || SERVICE_MANAGED_POLICIES[serviceKey] || []
      : SERVICE_MANAGED_POLICIES[serviceKey] || [];

    arns.push(...policies);
  }

  return [...new Set(arns)];
}

/** S3 read/delete actions allowed outside the lab region only for racko-tagged resources. */
export const S3_TAG_AWARE_REGION_ACTIONS = [
  's3:DeleteBucket',
  's3:DeleteObject',
  's3:DeleteObjectVersion',
  's3:ListBucket',
  's3:ListBucketVersions',
  's3:ListObject*',
  's3:GetObject',
  's3:GetObjectVersion',
  's3:PutBucketVersioning',
];

/** Global or console-navigation actions exempt from the lab region deny. */
export const REGION_EXEMPT_NOT_ACTIONS = [
  'iam:*',
  'organizations:*',
  'account:*',
  'route53:*',
  'cloudfront:*',
  'support:*',
  'ce:*',
  'billing:*',
  'budgets:*',
  'health:*',
  'pricing:*',
  'tag:*',
  'resource-groups:*',
  'sts:*',
  'aws-portal:*',
  's3:ListAllMyBuckets',
  's3:ListBuckets',
  's3:GetBucketLocation',
  's3:HeadBucket',
  's3:GetBucketTagging',
  ...S3_TAG_AWARE_REGION_ACTIONS,
  'cloudwatch:Get*',
  'cloudwatch:List*',
  'cloudwatch:Describe*',
  'logs:Describe*',
  'logs:Get*',
  'logs:Filter*',
  'servicequotas:Get*',
  'servicequotas:List*',
];

function buildS3RegionDenyStatement(labRegion) {
  if (labRegion === 'us-east-1') {
    return {
      Sid: 'DenyS3CreateOutsideLabRegion',
      Effect: 'Deny',
      Action: 's3:CreateBucket',
      Resource: 'arn:aws:s3:::*',
      Condition: {
        Null: {
          's3:LocationConstraint': 'false',
        },
      },
    };
  }

  return {
    Sid: 'DenyS3CreateOutsideLabRegion',
    Effect: 'Deny',
    Action: 's3:CreateBucket',
    Resource: 'arn:aws:s3:::*',
    Condition: {
      StringNotLike: {
        's3:LocationConstraint': labRegion,
      },
    },
  };
}

function buildRegionalDenyStatement(labRegion) {
  return {
    Sid: 'DenyOutsideLabRegion',
    Effect: 'Deny',
    NotAction: REGION_EXEMPT_NOT_ACTIONS,
    Resource: '*',
    Condition: {
      StringNotEquals: {
        'aws:RequestedRegion': labRegion,
      },
    },
  };
}

function buildS3TaggedCleanupRegionDenyStatement(requestId, labRegion) {
  return {
    Sid: 'DenyS3TaggedCleanupOutsideLabRegion',
    Effect: 'Deny',
    Action: S3_TAG_AWARE_REGION_ACTIONS,
    Resource: ['arn:aws:s3:::*', 'arn:aws:s3:::*/*'],
    Condition: {
      StringNotEquals: {
        'aws:RequestedRegion': labRegion,
      },
      StringNotEqualsIfExists: {
        'aws:ResourceTag/racko:request': String(requestId),
      },
    },
  };
}

export function buildRegionRestrictionStatements(labRegion, requestId = '') {
  const region = String(labRegion || '').trim();
  if (!region) return [];

  const statements = [buildRegionalDenyStatement(region), buildS3RegionDenyStatement(region)];

  if (requestId) {
    statements.push(buildS3TaggedCleanupRegionDenyStatement(requestId, region));
  }

  return statements;
}

export function buildPermissionPolicy(request, username) {
  const statements = [];
  const labRegion = String(request.region || '').trim();

  for (const regionStatement of buildRegionRestrictionStatements(labRegion, request._id).reverse()) {
    statements.unshift(regionStatement);
  }

  statements.unshift({
    Sid: 'EnforceRackoTagOnCreate',
    Effect: 'Deny',
    Action: [
      'ec2:RunInstances',
      'rds:CreateDBInstance',
      's3:CreateBucket',
      'lambda:CreateFunction',
      'dynamodb:CreateTable',
      'eks:CreateCluster',
      'elasticache:CreateCacheCluster',
      'redshift:CreateCluster',
      'es:CreateDomain',
      'kinesis:CreateStream',
      'sqs:CreateQueue',
      'sns:CreateTopic',
      'sagemaker:CreateNotebookInstance',
      'sagemaker:CreateTrainingJob',
    ],
    Resource: '*',
    Condition: {
      Null: {
        'aws:RequestTag/racko:request': 'true',
      },
    },
  });

  statements.push({
    Sid: 'RackoBaseline',
    Effect: 'Allow',
    Action: BASELINE_ACTIONS,
    Resource: '*',
  });

  for (const permission of request.permissions || []) {
    const serviceKey = resolveServiceKey(permission);
    if (!serviceKey) continue;

    const accessLevel = isReadOnlyPolicy(permission.policies) ? 'readOnly' : 'full';
    const actions = INLINE_POLICY_ACTIONS[serviceKey]?.[accessLevel];
    if (!actions?.length) continue;

    statements.push({
      Sid: `Racko${permission.serviceName}${accessLevel === 'full' ? 'Full' : 'Read'}`,
      Effect: 'Allow',
      Action: dedupeActions(actions),
      Resource: '*',
    });
  }

  if (statements.length === 1) {
    statements.push({
      Sid: 'RackoDefaultReadOnly',
      Effect: 'Allow',
      Action: ['*:Describe*', '*:List*', '*:Get*'],
      Resource: '*',
    });
  }

  statements.push({
    Sid: 'RackoTagging',
    Effect: 'Allow',
    Action: TAGGING_ACTIONS,
    Resource: '*',
  });

  statements.push({
    Sid: 'AllowTagOnCreate',
    Effect: 'Allow',
    Action: [
      'ec2:RunInstances',
      'rds:CreateDBInstance',
      's3:CreateBucket',
      'lambda:CreateFunction',
      'dynamodb:CreateTable',
    ],
    Resource: '*',
    Condition: {
      StringEquals: {
        'aws:RequestTag/racko:request': String(request._id),
      },
    },
  });

  return {
    Version: '2012-10-17',
    Statement: statements,
  };
}

/** Build policy from catalog policy names (e.g. EC2FullAccess) — used by org admin updates. */
export function buildPermissionPolicyFromPolicyNames(policyNames = [], requestContext = {}) {
  const permissions = [];

  for (const policyName of policyNames) {
    const resolved = INLINE_IAM_POLICY_ALIASES[policyName] || policyName;
    const match = resolved.match(/^([A-Za-z]+)(FullAccess|ReadOnlyAccess)$/);
    if (!match) continue;

    const serviceName = match[1];
    permissions.push({
      serviceName,
      policies: [resolved],
    });
  }

  return buildPermissionPolicy({
    _id: requestContext._id,
    region: requestContext.region,
    permissions,
  });
}

function buildInlinePolicyDocument(actions) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: dedupeActions(actions),
        Resource: '*',
      },
    ],
  };
}

function buildCatalogIamPolicies() {
  const inlinePolicies = {};
  const servicePolicies = {};
  const defaults = {};

  for (const [serviceName, serviceKey] of Object.entries(CATALOG_SERVICE_TO_KEY)) {
    const fullName = `${serviceName}FullAccess`;
    const readName = `${serviceName}ReadOnlyAccess`;
    const fullActions = INLINE_POLICY_ACTIONS[serviceKey]?.full || [];
    const readActions = INLINE_POLICY_ACTIONS[serviceKey]?.readOnly || [];

    inlinePolicies[fullName] = buildInlinePolicyDocument(fullActions);
    inlinePolicies[readName] = buildInlinePolicyDocument(readActions);
    servicePolicies[serviceName] = [fullName, readName];
    defaults[serviceName] = fullName;
  }

  return { inlinePolicies, servicePolicies, defaults };
}

const catalogIamPolicies = buildCatalogIamPolicies();

export const SERVICE_IAM_POLICIES = catalogIamPolicies.servicePolicies;

/** Inline policies attached to Identity Center permission sets. */
export const INLINE_IAM_POLICIES = catalogIamPolicies.inlinePolicies;

export const DEFAULT_IAM_POLICIES = catalogIamPolicies.defaults;

/** Legacy AWS managed policy names → inline catalog policy keys. */
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

/** @deprecated Use SERVICE_IAM_ACTIONS alias — kept for imports that reference old name. */
export const SERVICE_IAM_ACTIONS = Object.fromEntries(
  Object.entries(CATALOG_SERVICE_TO_KEY).map(([service, key]) => [
    service,
    INLINE_POLICY_ACTIONS[key]?.full || [],
  ])
);
