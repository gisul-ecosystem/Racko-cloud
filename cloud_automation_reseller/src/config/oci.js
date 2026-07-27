/**
 * OCI config for reseller pricing + Compute provisioning.
 * Pricing uses Oracle's public list-price API (no OCI auth).
 * Provisioning needs API key credentials below.
 */

import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const ociConfig = {
  tenancyId: process.env.OCI_TENANCY_OCID || '',
  userId: process.env.OCI_USER_OCID || '',
  fingerprint: process.env.OCI_FINGERPRINT || '',
  privateKey:
    process.env.OCI_PRIVATE_KEY ||
    (process.env.OCI_PRIVATE_KEY_PATH
      ? fs.readFileSync(process.env.OCI_PRIVATE_KEY_PATH, 'utf8')
      : ''),
  region: process.env.OCI_REGION || 'ap-mumbai-1',
  compartmentId: process.env.OCI_COMPARTMENT_OCID || '',
  subnetId: process.env.OCI_SUBNET_OCID || '',
  /** Canonical Ubuntu image OCID for the region (optional — resolved at launch if empty). */
  imageId: process.env.OCI_IMAGE_OCID || '',
  sshPublicKey: process.env.OCI_SSH_PUBLIC_KEY || '',
  availabilityDomain: process.env.OCI_AVAILABILITY_DOMAIN || '',
};

export function validateOciConfig({ forProvision = false } = {}) {
  if (forProvision) {
    const missing = [];
    if (!ociConfig.tenancyId) missing.push('OCI_TENANCY_OCID');
    if (!ociConfig.userId) missing.push('OCI_USER_OCID');
    if (!ociConfig.fingerprint) missing.push('OCI_FINGERPRINT');
    if (!ociConfig.privateKey) missing.push('OCI_PRIVATE_KEY or OCI_PRIVATE_KEY_PATH');
    if (!ociConfig.compartmentId) missing.push('OCI_COMPARTMENT_OCID');
    if (!ociConfig.subnetId) missing.push('OCI_SUBNET_OCID');
    if (missing.length) {
      throw new Error(`OCI provision requires: ${missing.join(', ')}`);
    }
  }
}

export function getOciAuth() {
  const common = require('oci-common');
  const provider = new common.SimpleAuthenticationDetailsProvider(
    ociConfig.tenancyId,
    ociConfig.userId,
    ociConfig.fingerprint,
    ociConfig.privateKey,
    null,
    common.Region.fromRegionId(ociConfig.region)
  );
  return { common, provider };
}
