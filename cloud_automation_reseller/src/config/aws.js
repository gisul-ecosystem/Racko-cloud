import { EC2Client } from '@aws-sdk/client-ec2';
import { PricingClient } from '@aws-sdk/client-pricing';
 
const region = process.env.AWS_REGION || 'ap-south-1';

const credentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

/** Pricing API is only available in us-east-1 / ap-south-1. */
export const pricingClient = new PricingClient({
  region: 'us-east-1',
  ...(credentials ? { credentials } : {}),
});

export const ec2ClientForRegion = (regionCode = region) =>
  new EC2Client({
    region: regionCode,
    ...(credentials ? { credentials } : {}),
  });

export const awsConfig = {
  defaultRegion: region,
  defaultAmiId: process.env.AWS_DEFAULT_AMI_ID || '',
  subnetId: process.env.AWS_SUBNET_ID || '',
  securityGroupId: process.env.AWS_SECURITY_GROUP_ID || '',
  keyName: process.env.AWS_KEY_NAME || '',
  instanceProfileArn: process.env.AWS_INSTANCE_PROFILE_ARN || '',
};

export function validateAwsConfig({ forProvision = false } = {}) {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn('[aws] AWS credentials not set — pricing/provision may fail');
  }
  if (forProvision && (!awsConfig.defaultAmiId || !awsConfig.subnetId || !awsConfig.securityGroupId)) {
    throw new Error(
      'AWS provision requires AWS_DEFAULT_AMI_ID, AWS_SUBNET_ID, and AWS_SECURITY_GROUP_ID'
    );
  }
}
