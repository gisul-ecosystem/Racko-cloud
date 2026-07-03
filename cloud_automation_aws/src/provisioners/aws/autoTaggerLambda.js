export const LAMBDA_CODE = `
const {
  EC2Client, CreateTagsCommand,
} = require('@aws-sdk/client-ec2');

const {
  RDSClient, AddTagsToResourceCommand: RDSAddTags,
} = require('@aws-sdk/client-rds');

const {
  S3Client, PutBucketTaggingCommand,
} = require('@aws-sdk/client-s3');

const {
  LambdaClient, TagResourceCommand: LambdaTag,
} = require('@aws-sdk/client-lambda');

const {
  DynamoDBClient, TagResourceCommand: DynamoTag,
} = require('@aws-sdk/client-dynamodb');

const RESOURCE_EXTRACTORS = {
  'ec2.amazonaws.com:RunInstances': (detail) => ({
    service: 'ec2',
    ids: detail.responseElements?.instancesSet?.items?.map((i) => i.instanceId) || [],
  }),
  'ec2.amazonaws.com:CreateVolume': (detail) => ({
    service: 'ec2',
    ids: [detail.responseElements?.volumeId],
  }),
  'ec2.amazonaws.com:CreateSecurityGroup': (detail) => ({
    service: 'ec2',
    ids: [detail.responseElements?.groupId],
  }),
  'rds.amazonaws.com:CreateDBInstance': (detail) => ({
    service: 'rds',
    arns: [detail.responseElements?.dBInstance?.dBInstanceArn],
  }),
  's3.amazonaws.com:CreateBucket': (detail) => ({
    service: 's3',
    bucket: detail.requestParameters?.bucketName,
  }),
  'lambda.amazonaws.com:CreateFunction20150331': (detail) => ({
    service: 'lambda',
    arn: detail.responseElements?.functionArn,
  }),
  'dynamodb.amazonaws.com:CreateTable': (detail) => ({
    service: 'dynamodb',
    arn: detail.responseElements?.tableDescription?.tableArn,
  }),
};

exports.handler = async (event) => {
  const detail = event.detail;
  const eventKey = detail.eventSource + ':' + detail.eventName;
  const extractor = RESOURCE_EXTRACTORS[eventKey];

  if (!extractor) return;

  const requestId = process.env.RACKO_REQUEST_ID;
  const userIndex = getUserIndexFromIdentity(detail.userIdentity);

  const tags = [
    { Key: 'racko:request', Value: requestId },
    { Key: 'racko:user-index', Value: String(userIndex) },
    { Key: 'racko:managed', Value: 'true' },
    { Key: 'racko:auto-tagged', Value: 'true' },
  ];

  const resource = extractor(detail);
  const region = detail.awsRegion;

  try {
    if (resource.service === 'ec2') {
      const ec2 = new EC2Client({ region });
      for (const id of resource.ids || []) {
        if (!id) continue;
        await ec2.send(new CreateTagsCommand({
          Resources: [id],
          Tags: tags,
        }));
        console.log('Tagged EC2 resource:', id);
      }
    }

    if (resource.service === 'rds') {
      const rds = new RDSClient({ region });
      for (const arn of resource.arns || []) {
        if (!arn) continue;
        await rds.send(new RDSAddTags({
          ResourceName: arn,
          Tags: tags,
        }));
        console.log('Tagged RDS instance:', arn);
      }
    }

    if (resource.service === 's3' && resource.bucket) {
      const s3 = new S3Client({ region });
      await s3.send(new PutBucketTaggingCommand({
        Bucket: resource.bucket,
        Tagging: { TagSet: tags },
      }));
      console.log('Tagged S3 bucket:', resource.bucket);
    }

    if (resource.service === 'lambda' && resource.arn) {
      const lambda = new LambdaClient({ region });
      const tagObj = {};
      tags.forEach((t) => { tagObj[t.Key] = t.Value; });
      await lambda.send(new LambdaTag({
        Resource: resource.arn,
        Tags: tagObj,
      }));
      console.log('Tagged Lambda:', resource.arn);
    }

    if (resource.service === 'dynamodb' && resource.arn) {
      const dynamo = new DynamoDBClient({ region });
      await dynamo.send(new DynamoTag({
        ResourceArn: resource.arn,
        Tags: tags,
      }));
      console.log('Tagged DynamoDB table:', resource.arn);
    }
  } catch (err) {
    console.error('Auto-tagger error:', err.message);
  }
};

function getUserIndexFromIdentity(userIdentity) {
  const arn = userIdentity?.arn || '';

  const userMatch = arn.match(/rackolab(\\d+)-/);
  if (userMatch) return parseInt(userMatch[1], 10);

  const roleMatch = arn.match(/RackoLab-[^/]+-u(\\d+)/);
  if (roleMatch) return parseInt(roleMatch[1], 10);

  return 0;
}
`;
