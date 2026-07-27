/** AWS service names mapped to SCP deny action prefixes for lab restrictions. */
export const SERVICE_SCP_ACTIONS = {
  EC2: ['ec2:*', 'elasticloadbalancing:*', 'autoscaling:*'],
  Lightsail: ['lightsail:*'],
  RDS: ['rds:*'],
  DynamoDB: ['dynamodb:*'],
  ElastiCache: ['elasticache:*'],
  Redshift: ['redshift:*'],
  S3: ['s3:*'],
  EKS: ['eks:*'],
  Lambda: ['lambda:*'],
  VPC: ['ec2:CreateVpc', 'ec2:ModifyVpc*', 'ec2:CreateSubnet', 'ec2:CreateNatGateway'],
  CloudFront: ['cloudfront:*'],
  SQS: ['sqs:*'],
  SNS: ['sns:*'],
  Kinesis: ['kinesis:*', 'firehose:*'],
  EMR: ['elasticmapreduce:*'],
  OpenSearch: ['es:*', 'aoss:*'],
  SageMaker: ['sagemaker:*'],
};

export const ALL_CATALOG_SERVICES = Object.keys(SERVICE_SCP_ACTIONS);

export function buildScpDocument(selectedServiceNames) {
  const allowed = new Set(selectedServiceNames);
  const denyActions = [];

  for (const serviceName of ALL_CATALOG_SERVICES) {
    if (allowed.has(serviceName)) continue;
    denyActions.push(...(SERVICE_SCP_ACTIONS[serviceName] || []));
  }

  if (denyActions.length === 0) {
    return {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyAllExceptExplicitAllow',
          Effect: 'Deny',
          NotAction: ['*'],
          Resource: '*',
        },
      ],
    };
  }

  return {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'DenyUnselectedServices',
        Effect: 'Deny',
        Action: [...new Set(denyActions)],
        Resource: '*',
      },
    ],
  };
}

export function deriveRequestAccountName(request, userIndex = null) {
  const requestSuffix = String(request._id).slice(-6);

  if (request.requestName?.trim() && userIndex === null) {
    return request.requestName.trim().slice(0, 50);
  }

  const emailPrefix = String(request.customerEmail || 'lab')
    .split('@')[0]
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .slice(0, 30);

  if (userIndex !== null) {
    return `Racko-Lab-${emailPrefix}-u${userIndex + 1}-${requestSuffix}`.slice(0, 50);
  }

  return `Racko-Lab-${emailPrefix}-${requestSuffix}`.slice(0, 50);
}

/** Unique email for each AWS member account in per-user mode (+userN aliases). */
export function deriveMemberAccountEmail(request, index) {
  const base = String(request.customerEmail || '').trim().toLowerCase();
  const [local, domain] = base.split('@');
  const slot = index + 1;

  if (!domain) {
    return `${local}+user${slot}@racko.local`;
  }

  return `${local}+user${slot}@${domain}`;
}

/** Identity Center user email — +alias to customer inbox so AWS activation emails are deliverable. */
export function deriveAccountEmail(request, index = 0) {
  const customerEmail = String(request.customerEmail || '').trim();
  const [localPart, domain] = customerEmail.split('@');
  const idSuffix = String(request._id).slice(-6);

  if (!domain) {
    return `${localPart}+lab${index + 1}-${idSuffix}@racko.local`;
  }

  return `${localPart}+lab${index + 1}-${idSuffix}@${domain}`;
}

export function deriveUsername(request, index) {
  const requestId = String(request._id).slice(-6);
  return `labuser${index + 1}-${requestId}`;
}
