import { AssumeRoleCommand } from '@aws-sdk/client-sts';
import https from 'https';
import { stsClient } from '../config/aws.js';

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

export async function generateConsoleUrl(roleArn, sessionName, durationSeconds = 28800) {
  const assumed = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: sessionName.slice(0, 64),
      DurationSeconds: durationSeconds,
    })
  );

  const credentials = assumed.Credentials;
  if (!credentials) throw new Error('Failed to assume role');

  const signinToken = await getSigninToken(credentials);

  const destination = encodeURIComponent('https://console.aws.amazon.com/');
  const consoleUrl = `https://signin.aws.amazon.com/federation?Action=login&Issuer=racko.ai&Destination=${destination}&SigninToken=${signinToken}`;

  return {
    consoleUrl,
    expiresAt: new Date(Date.now() + durationSeconds * 1000),
    roleArn,
    sessionName,
  };
}

export async function generateAllConsoleUrls(labRoles, requestId) {
  const urls = [];

  for (const role of labRoles) {
    try {
      const sessionName = `racko-lab-u${role.userIndex + 1}-${String(requestId).slice(-6)}`;
      const result = await generateConsoleUrl(role.roleArn, sessionName);
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
