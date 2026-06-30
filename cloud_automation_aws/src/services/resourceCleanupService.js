import {
  DescribeInstancesCommand,
  TerminateInstancesCommand,
  DeleteNatGatewayCommand,
  DescribeNatGatewaysCommand,
  DescribeVpcsCommand,
  DeleteVpcCommand,
  DescribeSubnetsCommand,
  DeleteSubnetCommand,
  DescribeInternetGatewaysCommand,
  DetachInternetGatewayCommand,
  DeleteInternetGatewayCommand,
} from '@aws-sdk/client-ec2';
import {
  DescribeDBInstancesCommand,
  DeleteDBInstanceCommand,
} from '@aws-sdk/client-rds';
import {
  ListBucketsCommand,
  GetBucketTaggingCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import {
  ListClustersCommand as ListEKSClustersCommand,
  DeleteClusterCommand as DeleteEKSClusterCommand,
  ListTagsForResourceCommand as EKSListTagsCommand,
} from '@aws-sdk/client-eks';
import {
  ListFunctionsCommand,
  DeleteFunctionCommand,
  ListTagsCommand as LambdaListTagsCommand,
} from '@aws-sdk/client-lambda';
import {
  DescribeCacheClustersCommand,
  DeleteCacheClusterCommand,
} from '@aws-sdk/client-elasticache';
import {
  DescribeClustersCommand as RedshiftDescribeClustersCommand,
  DeleteClusterCommand as RedshiftDeleteClusterCommand,
} from '@aws-sdk/client-redshift';
import {
  ListDomainNamesCommand,
  DescribeDomainCommand,
  DeleteDomainCommand,
} from '@aws-sdk/client-opensearch';
import {
  ListNotebookInstancesCommand,
  DeleteNotebookInstanceCommand,
  StopNotebookInstanceCommand,
  ListTrainingJobsCommand,
  StopTrainingJobCommand,
} from '@aws-sdk/client-sagemaker';
import {
  ListStreamsCommand,
  DeleteStreamCommand,
  ListTagsForStreamCommand,
} from '@aws-sdk/client-kinesis';
import {
  ListTopicsCommand,
  DeleteTopicCommand,
  ListTagsForResourceCommand as SNSListTagsCommand,
} from '@aws-sdk/client-sns';
import {
  ListTablesCommand,
  DeleteTableCommand,
  ListTagsOfResourceCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  GetInstancesCommand,
  DeleteInstanceCommand,
  GetRelationalDatabasesCommand,
  DeleteRelationalDatabaseCommand,
} from '@aws-sdk/client-lightsail';
import {
  ListDistributionsCommand,
  DeleteDistributionCommand,
  GetDistributionCommand,
  UpdateDistributionCommand,
} from '@aws-sdk/client-cloudfront';
import {
  ListQueuesCommand,
  DeleteQueueCommand,
  ListQueueTagsCommand,
} from '@aws-sdk/client-sqs';

import {
  ec2Client,
  rdsClient,
  s3Client,
  eksClient,
  lambdaClient,
  elastiCacheClient,
  redshiftClient,
  openSearchClient,
  sageMakerClient,
  kinesisClient,
  snsClient,
  dynamoDBClient,
  lightsailClient,
  cloudFrontClient,
  sqsClient,
  MASTER_ACCOUNT_ID,
} from '../config/aws.js';
import Request from '../models/Request.js';

function hasMatchingTags(tags = [], requestId, userIndex) {
  const hasRequest = tags.some(
    (t) =>
      (t.Key === 'racko:request' || t.key === 'racko:request') &&
      (t.Value === String(requestId) || t.value === String(requestId))
  );
  const hasUser = tags.some(
    (t) =>
      (t.Key === 'racko:user-index' || t.key === 'racko:user-index') &&
      (t.Value === String(userIndex + 1) || t.value === String(userIndex + 1))
  );
  return hasRequest && hasUser;
}

function logResult(service, action, count, errors = []) {
  if (count > 0) {
    console.log(`[cleanup] ${service}: ${action} ${count} resource(s)`);
  }
  if (errors.length > 0) {
    errors.forEach((e) => console.error(`[cleanup] ${service} error:`, e));
  }
}

async function cleanupEC2(requestId, userIndex) {
  const result = { terminated: 0, errors: [] };
  try {
    const response = await ec2Client.send(
      new DescribeInstancesCommand({
        Filters: [
          { Name: 'tag:racko:request', Values: [String(requestId)] },
          { Name: 'tag:racko:user-index', Values: [String(userIndex + 1)] },
          {
            Name: 'instance-state-name',
            Values: ['running', 'stopped', 'pending', 'stopping'],
          },
        ],
      })
    );

    const instanceIds =
      response.Reservations?.flatMap((r) => r.Instances || [])
        .map((i) => i.InstanceId)
        .filter(Boolean) || [];

    if (instanceIds.length > 0) {
      await ec2Client.send(new TerminateInstancesCommand({ InstanceIds: instanceIds }));
      result.terminated = instanceIds.length;
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('EC2', 'terminated', result.terminated, result.errors);
  return result;
}

async function cleanupRDS(requestId, userIndex) {
  const result = { deleted: 0, errors: [] };
  try {
    const response = await rdsClient.send(new DescribeDBInstancesCommand({}));
    const labDbs = (response.DBInstances || []).filter((db) =>
      hasMatchingTags(db.TagList || [], requestId, userIndex)
    );

    for (const db of labDbs) {
      try {
        await rdsClient.send(
          new DeleteDBInstanceCommand({
            DBInstanceIdentifier: db.DBInstanceIdentifier,
            SkipFinalSnapshot: true,
            DeleteAutomatedBackups: true,
          })
        );
        result.deleted++;
      } catch (err) {
        result.errors.push(`${db.DBInstanceIdentifier}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('RDS', 'deleted', result.deleted, result.errors);
  return result;
}

async function cleanupS3(requestId, userIndex) {
  const result = { bucketsEmptied: 0, bucketsDeleted: 0, errors: [] };
  try {
    const { Buckets = [] } = await s3Client.send(new ListBucketsCommand({}));

    for (const bucket of Buckets) {
      try {
        const tagging = await s3Client.send(
          new GetBucketTaggingCommand({ Bucket: bucket.Name })
        );
        if (!hasMatchingTags(tagging.TagSet || [], requestId, userIndex)) continue;

        let truncated = true;
        let continuationToken;
        while (truncated) {
          const objects = await s3Client.send(
            new ListObjectsV2Command({
              Bucket: bucket.Name,
              ContinuationToken: continuationToken,
            })
          );
          if (objects.Contents?.length > 0) {
            await s3Client.send(
              new DeleteObjectsCommand({
                Bucket: bucket.Name,
                Delete: {
                  Objects: objects.Contents.map((o) => ({ Key: o.Key })),
                  Quiet: true,
                },
              })
            );
            result.bucketsEmptied++;
          }
          truncated = objects.IsTruncated || false;
          continuationToken = objects.NextContinuationToken;
        }

        await s3Client.send(new DeleteBucketCommand({ Bucket: bucket.Name }));
        result.bucketsDeleted++;
      } catch (err) {
        if (err.name !== 'NoSuchTagSet') {
          result.errors.push(`${bucket.Name}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('S3', 'deleted buckets', result.bucketsDeleted, result.errors);
  return result;
}

async function cleanupEKS(requestId, userIndex) {
  const result = { deleted: 0, errors: [] };
  try {
    const { clusters = [] } = await eksClient.send(new ListEKSClustersCommand({}));

    for (const clusterName of clusters) {
      try {
        const { tags = {} } = await eksClient.send(
          new EKSListTagsCommand({
            resourceArn: `arn:aws:eks:${process.env.AWS_REGION}:${MASTER_ACCOUNT_ID}:cluster/${clusterName}`,
          })
        );

        const tagArray = Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));
        if (!hasMatchingTags(tagArray, requestId, userIndex)) continue;

        await eksClient.send(new DeleteEKSClusterCommand({ name: clusterName }));
        result.deleted++;
      } catch (err) {
        result.errors.push(`${clusterName}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('EKS', 'deleted clusters', result.deleted, result.errors);
  return result;
}

async function cleanupLambda(requestId, userIndex) {
  const result = { deleted: 0, errors: [] };
  try {
    let marker;
    do {
      const response = await lambdaClient.send(
        new ListFunctionsCommand({ Marker: marker })
      );

      for (const fn of response.Functions || []) {
        try {
          const { Tags = {} } = await lambdaClient.send(
            new LambdaListTagsCommand({ Resource: fn.FunctionArn })
          );
          const tagArray = Object.entries(Tags).map(([Key, Value]) => ({ Key, Value }));
          if (!hasMatchingTags(tagArray, requestId, userIndex)) continue;

          await lambdaClient.send(
            new DeleteFunctionCommand({ FunctionName: fn.FunctionName })
          );
          result.deleted++;
        } catch (err) {
          result.errors.push(`${fn.FunctionName}: ${err.message}`);
        }
      }

      marker = response.NextMarker;
    } while (marker);
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('Lambda', 'deleted functions', result.deleted, result.errors);
  return result;
}

async function cleanupElastiCache(requestId, userIndex) {
  const result = { deleted: 0, errors: [] };
  try {
    const response = await elastiCacheClient.send(
      new DescribeCacheClustersCommand({ ShowCacheClustersNotInReplicationGroups: true })
    );

    for (const cluster of response.CacheClusters || []) {
      try {
        const tags = cluster.TagList || [];
        if (!hasMatchingTags(tags, requestId, userIndex)) continue;

        await elastiCacheClient.send(
          new DeleteCacheClusterCommand({
            CacheClusterId: cluster.CacheClusterId,
          })
        );
        result.deleted++;
      } catch (err) {
        result.errors.push(`${cluster.CacheClusterId}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('ElastiCache', 'deleted clusters', result.deleted, result.errors);
  return result;
}

async function cleanupRedshift(requestId, userIndex) {
  const result = { deleted: 0, errors: [] };
  try {
    const response = await redshiftClient.send(new RedshiftDescribeClustersCommand({}));

    for (const cluster of response.Clusters || []) {
      try {
        const tags = cluster.Tags || [];
        if (!hasMatchingTags(tags, requestId, userIndex)) continue;

        await redshiftClient.send(
          new RedshiftDeleteClusterCommand({
            ClusterIdentifier: cluster.ClusterIdentifier,
            SkipFinalClusterSnapshot: true,
          })
        );
        result.deleted++;
      } catch (err) {
        result.errors.push(`${cluster.ClusterIdentifier}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('Redshift', 'deleted clusters', result.deleted, result.errors);
  return result;
}

async function cleanupOpenSearch(requestId, userIndex) {
  const result = { deleted: 0, errors: [] };
  try {
    const { DomainNames = [] } = await openSearchClient.send(new ListDomainNamesCommand({}));

    for (const domain of DomainNames) {
      try {
        const { DomainStatus } = await openSearchClient.send(
          new DescribeDomainCommand({ DomainName: domain.DomainName })
        );

        const tagArray = Object.entries(DomainStatus?.Tags || {}).map(([Key, Value]) => ({
          Key,
          Value,
        }));
        if (!hasMatchingTags(tagArray, requestId, userIndex)) continue;

        await openSearchClient.send(
          new DeleteDomainCommand({ DomainName: domain.DomainName })
        );
        result.deleted++;
      } catch (err) {
        result.errors.push(`${domain.DomainName}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('OpenSearch', 'deleted domains', result.deleted, result.errors);
  return result;
}

async function cleanupSageMaker(requestId, userIndex) {
  const result = { notebooksDeleted: 0, trainingJobsStopped: 0, errors: [] };
  const namePattern = String(requestId).slice(-6);

  try {
    const notebooks = await sageMakerClient.send(new ListNotebookInstancesCommand({}));

    for (const nb of notebooks.NotebookInstances || []) {
      try {
        if (!nb.NotebookInstanceName.includes(namePattern)) continue;

        if (nb.NotebookInstanceStatus === 'InService') {
          await sageMakerClient.send(
            new StopNotebookInstanceCommand({
              NotebookInstanceName: nb.NotebookInstanceName,
            })
          );
        }
        await sageMakerClient.send(
          new DeleteNotebookInstanceCommand({
            NotebookInstanceName: nb.NotebookInstanceName,
          })
        );
        result.notebooksDeleted++;
      } catch (err) {
        result.errors.push(`notebook ${nb.NotebookInstanceName}: ${err.message}`);
      }
    }

    const trainingJobs = await sageMakerClient.send(
      new ListTrainingJobsCommand({ StatusEquals: 'InProgress' })
    );

    for (const job of trainingJobs.TrainingJobSummaries || []) {
      try {
        if (!job.TrainingJobName.includes(namePattern)) continue;
        await sageMakerClient.send(
          new StopTrainingJobCommand({ TrainingJobName: job.TrainingJobName })
        );
        result.trainingJobsStopped++;
      } catch (err) {
        result.errors.push(`training ${job.TrainingJobName}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('SageMaker', 'deleted notebooks', result.notebooksDeleted, result.errors);
  return result;
}

async function cleanupKinesis(requestId, userIndex) {
  const result = { deleted: 0, errors: [] };
  try {
    const { StreamNames = [] } = await kinesisClient.send(new ListStreamsCommand({}));

    for (const streamName of StreamNames) {
      try {
        const { Tags = [] } = await kinesisClient.send(
          new ListTagsForStreamCommand({ StreamName: streamName })
        );
        if (!hasMatchingTags(Tags, requestId, userIndex)) continue;

        await kinesisClient.send(new DeleteStreamCommand({ StreamName: streamName }));
        result.deleted++;
      } catch (err) {
        result.errors.push(`${streamName}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('Kinesis', 'deleted streams', result.deleted, result.errors);
  return result;
}

async function cleanupSNS(requestId, userIndex) {
  const result = { deleted: 0, errors: [] };
  try {
    const { Topics = [] } = await snsClient.send(new ListTopicsCommand({}));

    for (const topic of Topics) {
      try {
        const { Tags = [] } = await snsClient.send(
          new SNSListTagsCommand({ ResourceArn: topic.TopicArn })
        );
        if (!hasMatchingTags(Tags, requestId, userIndex)) continue;

        await snsClient.send(new DeleteTopicCommand({ TopicArn: topic.TopicArn }));
        result.deleted++;
      } catch (err) {
        result.errors.push(`${topic.TopicArn}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('SNS', 'deleted topics', result.deleted, result.errors);
  return result;
}

async function cleanupSQS(requestId, userIndex) {
  const result = { deleted: 0, errors: [] };
  try {
    const { QueueUrls = [] } = await sqsClient.send(new ListQueuesCommand({}));

    for (const queueUrl of QueueUrls) {
      try {
        const { Tags = {} } = await sqsClient.send(
          new ListQueueTagsCommand({ QueueUrl: queueUrl })
        );
        const tagArray = Object.entries(Tags).map(([Key, Value]) => ({ Key, Value }));
        if (!hasMatchingTags(tagArray, requestId, userIndex)) continue;

        await sqsClient.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
        result.deleted++;
      } catch (err) {
        result.errors.push(`${queueUrl}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('SQS', 'deleted queues', result.deleted, result.errors);
  return result;
}

async function cleanupDynamoDB(requestId, userIndex) {
  const result = { deleted: 0, errors: [] };
  try {
    const { TableNames = [] } = await dynamoDBClient.send(new ListTablesCommand({}));

    for (const tableName of TableNames) {
      try {
        const { Table } = await dynamoDBClient.send(
          new DescribeTableCommand({ TableName: tableName })
        );
        const { Tags = [] } = await dynamoDBClient.send(
          new ListTagsOfResourceCommand({ ResourceArn: Table.TableArn })
        );
        if (!hasMatchingTags(Tags, requestId, userIndex)) continue;

        await dynamoDBClient.send(new DeleteTableCommand({ TableName: tableName }));
        result.deleted++;
      } catch (err) {
        result.errors.push(`${tableName}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('DynamoDB', 'deleted tables', result.deleted, result.errors);
  return result;
}

async function cleanupLightsail(requestId, userIndex) {
  const result = { instancesDeleted: 0, dbsDeleted: 0, errors: [] };
  try {
    const { instances = [] } = await lightsailClient.send(new GetInstancesCommand({}));

    for (const instance of instances) {
      try {
        const tags = instance.tags || [];
        if (!hasMatchingTags(tags, requestId, userIndex)) continue;

        await lightsailClient.send(
          new DeleteInstanceCommand({
            instanceName: instance.name,
            forceDeleteAddOns: true,
          })
        );
        result.instancesDeleted++;
      } catch (err) {
        result.errors.push(`instance ${instance.name}: ${err.message}`);
      }
    }

    const { relationalDatabases = [] } = await lightsailClient.send(
      new GetRelationalDatabasesCommand({})
    );

    for (const db of relationalDatabases) {
      try {
        const tags = db.tags || [];
        if (!hasMatchingTags(tags, requestId, userIndex)) continue;

        await lightsailClient.send(
          new DeleteRelationalDatabaseCommand({
            relationalDatabaseName: db.name,
            skipFinalSnapshot: true,
          })
        );
        result.dbsDeleted++;
      } catch (err) {
        result.errors.push(`db ${db.name}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('Lightsail', 'deleted instances', result.instancesDeleted, result.errors);
  return result;
}

async function cleanupCloudFront(requestId, userIndex) {
  const result = { deleted: 0, errors: [] };
  const namePattern = String(requestId).slice(-6);

  try {
    const { DistributionList } = await cloudFrontClient.send(
      new ListDistributionsCommand({})
    );

    for (const dist of DistributionList?.Items || []) {
      try {
        const comment = dist.Comment || '';
        if (!comment.includes(namePattern)) continue;

        const { Distribution, ETag } = await cloudFrontClient.send(
          new GetDistributionCommand({ Id: dist.Id })
        );

        if (Distribution.DistributionConfig.Enabled) {
          const config = Distribution.DistributionConfig;
          config.Enabled = false;
          await cloudFrontClient.send(
            new UpdateDistributionCommand({
              Id: dist.Id,
              IfMatch: ETag,
              DistributionConfig: config,
            })
          );
          console.log(
            `[cleanup] CloudFront ${dist.Id} disabled — will be deleted on next cleanup run`
          );
        } else {
          await cloudFrontClient.send(
            new DeleteDistributionCommand({ Id: dist.Id, IfMatch: ETag })
          );
          result.deleted++;
        }
      } catch (err) {
        result.errors.push(`${dist.Id}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('CloudFront', 'deleted distributions', result.deleted, result.errors);
  return result;
}

async function cleanupVPC(requestId, userIndex) {
  const result = { deleted: 0, errors: [] };
  try {
    const { Vpcs = [] } = await ec2Client.send(
      new DescribeVpcsCommand({
        Filters: [
          { Name: 'tag:racko:request', Values: [String(requestId)] },
          { Name: 'tag:racko:user-index', Values: [String(userIndex + 1)] },
        ],
      })
    );

    for (const vpc of Vpcs) {
      try {
        const { InternetGateways = [] } = await ec2Client.send(
          new DescribeInternetGatewaysCommand({
            Filters: [{ Name: 'attachment.vpc-id', Values: [vpc.VpcId] }],
          })
        );
        for (const igw of InternetGateways) {
          await ec2Client.send(
            new DetachInternetGatewayCommand({
              InternetGatewayId: igw.InternetGatewayId,
              VpcId: vpc.VpcId,
            })
          );
          await ec2Client.send(
            new DeleteInternetGatewayCommand({
              InternetGatewayId: igw.InternetGatewayId,
            })
          );
        }

        const { Subnets = [] } = await ec2Client.send(
          new DescribeSubnetsCommand({
            Filters: [{ Name: 'vpc-id', Values: [vpc.VpcId] }],
          })
        );
        for (const subnet of Subnets) {
          await ec2Client.send(new DeleteSubnetCommand({ SubnetId: subnet.SubnetId }));
        }

        const { NatGateways = [] } = await ec2Client.send(
          new DescribeNatGatewaysCommand({
            Filter: [{ Name: 'vpc-id', Values: [vpc.VpcId] }],
          })
        );
        for (const nat of NatGateways) {
          await ec2Client.send(
            new DeleteNatGatewayCommand({ NatGatewayId: nat.NatGatewayId })
          );
        }

        await ec2Client.send(new DeleteVpcCommand({ VpcId: vpc.VpcId }));
        result.deleted++;
      } catch (err) {
        result.errors.push(`${vpc.VpcId}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('VPC', 'deleted VPCs', result.deleted, result.errors);
  return result;
}

async function cleanupEMR(requestId, userIndex) {
  const result = { terminated: 0, errors: [] };
  try {
    const { EMRClient, ListClustersCommand, DescribeClusterCommand, TerminateJobFlowsCommand } =
      await import('@aws-sdk/client-emr');

    const emrClient = new EMRClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const { Clusters = [] } = await emrClient.send(
      new ListClustersCommand({
        ClusterStates: ['STARTING', 'BOOTSTRAPPING', 'RUNNING', 'WAITING'],
      })
    );

    const clusterIdsToTerminate = [];

    for (const cluster of Clusters) {
      try {
        const { Cluster } = await emrClient.send(
          new DescribeClusterCommand({ ClusterId: cluster.Id })
        );
        const tags = Cluster.Tags || [];
        if (!hasMatchingTags(tags, requestId, userIndex)) continue;
        clusterIdsToTerminate.push(cluster.Id);
      } catch (err) {
        result.errors.push(`describe ${cluster.Id}: ${err.message}`);
      }
    }

    if (clusterIdsToTerminate.length > 0) {
      await emrClient.send(
        new TerminateJobFlowsCommand({ JobFlowIds: clusterIdsToTerminate })
      );
      result.terminated = clusterIdsToTerminate.length;
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  logResult('EMR', 'terminated clusters', result.terminated, result.errors);
  return result;
}

const SERVICE_CLEANERS = {
  EC2: cleanupEC2,
  RDS: cleanupRDS,
  S3: cleanupS3,
  EKS: cleanupEKS,
  Lambda: cleanupLambda,
  ElastiCache: cleanupElastiCache,
  Redshift: cleanupRedshift,
  OpenSearch: cleanupOpenSearch,
  SageMaker: cleanupSageMaker,
  Kinesis: cleanupKinesis,
  SNS: cleanupSNS,
  SQS: cleanupSQS,
  DynamoDB: cleanupDynamoDB,
  Lightsail: cleanupLightsail,
  CloudFront: cleanupCloudFront,
  VPC: cleanupVPC,
  EMR: cleanupEMR,
};

export async function cleanupUserResources(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw new Error('Request not found');

  const field = request.accessType === 'identity_center' ? 'identityUsers' : 'labRoles';
  const user = request[field]?.find((entry) => entry.userIndex === userIndex);
  if (!user) throw new Error(`User not found for userIndex ${userIndex}`);

  const allowedServices = (request.selectedServices || []).map((s) => s.serviceName);

  console.log(`[cleanup] Starting cleanup for request ${requestId} user ${userIndex + 1}`);
  console.log(`[cleanup] Services to clean: ${allowedServices.join(', ')}`);

  const results = {};

  for (const service of allowedServices) {
    const cleaner = SERVICE_CLEANERS[service];
    if (!cleaner) {
      console.warn(`[cleanup] No cleaner for service: ${service}`);
      continue;
    }
    try {
      results[service] = await cleaner(requestId, userIndex);
    } catch (err) {
      console.error(`[cleanup] ${service} cleanup failed:`, err.message);
      results[service] = { error: err.message };
    }
  }

  await Request.findOneAndUpdate(
    { _id: requestId, [`${field}.userIndex`]: userIndex },
    {
      $set: { [`${field}.$.lastCleanupAt`]: new Date() },
      $push: {
        [`${field}.$.cleanupLogs`]: {
          cleanedAt: new Date(),
          results,
        },
      },
    }
  );

  console.log(`[cleanup] Completed for request ${requestId} user ${userIndex + 1}`);
  return results;
}

export async function cleanupAllUsers(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw new Error('Request not found');

  const users =
    request.accessType === 'identity_center'
      ? request.identityUsers || []
      : request.labRoles || [];

  const allResults = [];
  for (const role of users) {
    const result = await cleanupUserResources(requestId, role.userIndex);
    allResults.push({ userIndex: role.userIndex, ...result });
  }
  return allResults;
}
