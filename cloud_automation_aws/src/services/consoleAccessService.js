import { GetRoleCommand } from '@aws-sdk/client-iam';
import { AssumeRoleCommand } from '@aws-sdk/client-sts';
import https from 'https';
import { iamClient, stsClient } from '../config/aws.js';
import { magicLinkSessionSeconds } from '../utils/magicLinkSession.js';
import { startMagicLinkSession } from './sessionTrackingService.js';

async function resolveSessionDuration(roleArn, requestedSeconds) {
  const roleName = roleArn.split('/').pop();
  if (!roleName) return requestedSeconds;

  try {
    const role = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
    const maxDuration = role.Role?.MaxSessionDuration;
    if (maxDuration && requestedSeconds > maxDuration) {
      return maxDuration;
    }
  } catch (err) {
    console.warn(`[consoleAccess] Could not fetch role max session duration: ${err.message}`);
  }

  return requestedSeconds;
}

export function buildConsoleHomeUrl(region) {
  const normalized = String(region || '').trim();
  if (!normalized) {
    return 'https://console.aws.amazon.com/';
  }

  return `https://${normalized}.console.aws.amazon.com/console/home?region=${encodeURIComponent(normalized)}`;
}

async function getSigninToken(credentials) {
  const sessionJson = JSON.stringify({
    sessionId: credentials.AccessKeyId,
    sessionKey: credentials.SecretAccessKey,
    sessionToken: credentials.SessionToken,
  });

  return new Promise((resolve, reject) => {
    const url = `https://signin.aws.amazon.com/federation?Action=getSigninToken&Session=${encodeURIComponent(sessionJson)}`;

    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.SigninToken);
          } catch {
            reject(new Error('Failed to parse signin token'));
          }
        });
      })
      .on('error', reject);
  });
}

export async function generateConsoleUrl(roleArn, sessionName, durationSeconds, options = {}) {
  const requestedDuration = durationSeconds ?? magicLinkSessionSeconds();
  const resolvedDuration = await resolveSessionDuration(roleArn, requestedDuration);
  const assumed = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: sessionName.slice(0, 64),
      DurationSeconds: resolvedDuration,
    })
  );

  const credentials = assumed.Credentials;
  if (!credentials) throw new Error('Failed to assume role');

  const signinToken = await getSigninToken(credentials);

  const destination = encodeURIComponent(buildConsoleHomeUrl(options.region));
  const consoleUrl = `https://signin.aws.amazon.com/federation?Action=login&Issuer=racko.ai&Destination=${destination}&SigninToken=${signinToken}`;

  return {
    consoleUrl,
    expiresAt: new Date(Date.now() + resolvedDuration * 1000),
    roleArn,
    sessionName,
  };
}

export async function generateAllConsoleUrls(labRoles, requestId, region) {
  const urls = [];

  for (const role of labRoles) {
    try {
      const sessionName = `racko-lab-u${role.userIndex + 1}-${String(requestId).slice(-6)}`;
      const result = await generateConsoleUrl(role.roleArn, sessionName, undefined, { region });
      urls.push({
        userIndex: role.userIndex,
        username: `labuser${role.userIndex + 1}`,
        roleName: role.roleName,
        roleArn: role.roleArn,
        consoleUrl: result.consoleUrl,
        expiresAt: result.expiresAt,
      });
    } catch (err) {
      console.error(`[consoleAccess] Failed to generate URL for role ${role.roleName}:`, err.message);
    }
  }

  return urls;
}

export async function generateAndLogConsoleUrl(
  requestId,
  userIndex,
  roleArn,
  sessionName,
  durationSeconds,
  options = {}
) {
  const result = await generateConsoleUrl(roleArn, sessionName, durationSeconds, options);

  await startMagicLinkSession(
    requestId,
    userIndex,
    roleArn,
    sessionName,
    result.expiresAt
  );

  return result;
}
