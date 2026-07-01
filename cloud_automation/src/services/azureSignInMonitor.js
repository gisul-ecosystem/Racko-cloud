const { Client } = require('@microsoft/microsoft-graph-client');
const { createAzureCredential } = require('../config/azure');
const db = require('../db/postgres');
const { evaluateUsageAccess } = require('./usageAccessEvaluator');
const usageEnforcementService = require('./usageEnforcementService');
const usageService = require('./usageService');
const { resetDailyCountersIfNeeded } = require('./usageMiddlewareHelper');
const {
  loadUsageWindowsByRequest,
  evaluateWindowDailyLimitAccess
} = require('./usageWindowAccessService');

/**
 * Create Microsoft Graph client with app-only authentication
 */
const createGraphClient = () => {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      '[SIGNIN_MONITOR] Missing required Azure credentials: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET'
    );
  }

  const credential = createAzureCredential({ tenantId, clientId, clientSecret });

  const client = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential.getToken('https://graph.microsoft.com/.default');
        return token.token;
      }
    }
  });

  return client;
};

// Sign-in failures that still mean the user reached Azure Portal auth (temp password / force-change flow).
const PASSWORD_INDEPENDENT_ERROR_CODES = new Set([
  50055, // Password expired
  50125, // Sign-in interrupted (password reset or registration)
  50056 // Invalid or expired password
]);

const isTrackableSignIn = (signIn) => {
  const errorCode = Number(signIn.status?.errorCode ?? -1);
  return errorCode === 0 || PASSWORD_INDEPENDENT_ERROR_CODES.has(errorCode);
};

const isSignInAlreadyProcessed = async (signInId) => {
  if (!signInId) {
    return false;
  }

  try {
    const result = await db.query(
      'SELECT 1 FROM processed_azure_signins WHERE signin_id = $1 LIMIT 1',
      [signInId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.warn('[SIGNIN_MONITOR] Sign-in dedupe unavailable:', error.message);
    return false;
  }
};

const markSignInProcessed = async ({ signInId, azureUserId, requestId, userId }) => {
  if (!signInId) {
    return;
  }

  try {
    await db.query(
      `
      INSERT INTO processed_azure_signins (signin_id, azure_user_id, request_id, user_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (signin_id) DO NOTHING
      `,
      [signInId, azureUserId, requestId, userId]
    );
  } catch (error) {
    console.warn('[SIGNIN_MONITOR] Could not record processed sign-in:', error.message);
  }
};

/**
 * Monitor Azure sign-ins and create sessions automatically
 * Only tracks users created by our provisioning automation
 */
const monitorAzureSignIns = async () => {
  let fetchedCount = 0;
  let trackedCount = 0;
  let azurePortalCount = 0;
  let sessionsCreated = 0;

  try {
    console.log('[SIGNIN_MONITOR] Starting Azure sign-in detection...');

    // STEP 1: Load tracked users once (created by our automation)
    console.log('[SIGNIN_MONITOR] Loading tracked users from provisioning...');
    
    const trackedUsersResult = await db.query(
      `
      SELECT
        au.id,
        au.request_id,
        au.username,
        au.azure_user_id,
        au.blocked_until,
        au.used_today_minutes,
        au.last_reset_date,
        r.enable_daily_usage,
        r.daily_limit_minutes,
        r.usage_schedule,
        r.enforce_in_azure,
        EXISTS (
          SELECT 1
          FROM request_usage_windows ruw
          WHERE ruw.request_id = r.id
        ) AS has_usage_windows
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE COALESCE(au.is_deleted, false) = false
        AND r.status = 'Completed'
        AND COALESCE(r.expired, false) = false
        AND (
          r.enable_daily_usage = true
          OR EXISTS (
            SELECT 1
            FROM request_usage_windows ruw
            WHERE ruw.request_id = r.id
          )
        )
      `
    );

    // Build map for fast lookup: azure_user_id (lowercase) -> user data
    const trackedUsersMap = new Map();
    for (const user of trackedUsersResult.rows) {
      if (user.azure_user_id) {
        trackedUsersMap.set(String(user.azure_user_id).toLowerCase(), user);
      }
    }

    const usageWindowsByRequest = await loadUsageWindowsByRequest(
      [...new Set(trackedUsersResult.rows.map((user) => user.request_id))]
    );

    console.log(`[SIGNIN_MONITOR] Tracking ${trackedUsersMap.size} provisioned user(s).`);

    if (trackedUsersMap.size === 0) {
      console.log('[SIGNIN_MONITOR] No provisioned users to track. Exiting.');
      return;
    }

    const client = createGraphClient();

    // Fetch recent sign-ins (time window avoids missing events when the tenant has heavy traffic)
    const lookbackMinutes = Number(process.env.SIGNIN_MONITOR_LOOKBACK_MINUTES || 60);
    const since = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();
    console.log(`[SIGNIN_MONITOR] Fetching sign-ins since ${since}...`);

    const signIns = await client
      .api('/auditLogs/signIns')
      .filter(`createdDateTime ge ${since}`)
      .top(999)
      .orderby('createdDateTime desc')
      .get();

    if (!signIns || !signIns.value || signIns.value.length === 0) {
      console.log('[SIGNIN_MONITOR] No sign-ins returned from Graph API.');
      return;
    }

    fetchedCount = signIns.value.length;
    console.log(`[SIGNIN_MONITOR] Fetched ${fetchedCount} sign-in(s) from Graph API.`);

    // Process each sign-in
    for (const signIn of signIns.value) {
      const azureUserId = signIn.userId;
      const normalizedUserId = azureUserId ? String(azureUserId).toLowerCase() : null;

      // STEP 2: Immediately filter - only process tracked users
      if (!normalizedUserId || !trackedUsersMap.has(normalizedUserId)) {
        continue;
      }

      const errorCode = Number(signIn.status?.errorCode ?? -1);
      const signInSucceeded = errorCode === 0;

      if (!isTrackableSignIn(signIn)) {
        console.log(
          `[SIGNIN_FAILED] ${signIn.userPrincipalName || 'Unknown'} | ` +
          `errorCode=${errorCode} | ` +
          `reason=${signIn.status?.failureReason || 'unknown'} | ` +
          `app=${signIn.appDisplayName || 'Unknown'}`
        );
        continue;
      }

      trackedCount++;

      // STEP 3: Log tracked user sign-ins (success or password-change flow)
      if (signInSucceeded) {
        console.log(
          `[SIGNIN] ${signIn.userPrincipalName || 'Unknown'} | ` +
          `${signIn.createdDateTime} | ` +
          `App: ${signIn.appDisplayName || 'Unknown'} | ` +
          `Resource: ${signIn.resourceDisplayName || 'Unknown'}`
        );
      } else {
        console.log(
          `[SIGNIN_PASSWORD_FLOW] ${signIn.userPrincipalName || 'Unknown'} | ` +
          `${signIn.createdDateTime} | ` +
          `errorCode=${errorCode} | ` +
          `reason=${signIn.status?.failureReason || 'unknown'} | ` +
          `App: ${signIn.appDisplayName || 'Unknown'}`
        );
      }

      // STEP 4: Filter Azure Portal logins only
      const allowedApps = [
        'Microsoft Azure Portal',
        'Azure Portal',
        'Azure Resource Manager',
        'Azure CLI',
        'Azure PowerShell',
        'Microsoft Azure',
        'Windows Azure Service Management API'
      ];

      const allowedResourceKeywords = ['Azure', 'Windows Azure'];
      
      const rejectedKeywords = [
        'Outlook',
        'Exchange',
        'Office',
        'Teams',
        'Microsoft Graph',
        'My Profile'
      ];

      const appDisplayName = signIn.appDisplayName || '';
      const resourceDisplayName = signIn.resourceDisplayName || '';

      // Check if rejected
      const isRejected = rejectedKeywords.some(
        keyword => 
          appDisplayName.includes(keyword) || 
          resourceDisplayName.includes(keyword)
      );

      if (isRejected) {
        console.log(
          `[IGNORED_NON_AZURE_LOGIN] ${signIn.userPrincipalName} - ` +
          `App: "${appDisplayName}" not Azure-related. Skipping.`
        );
        continue;
      }

      // Check if allowed Azure app
      const isAllowedApp = allowedApps.some(app => appDisplayName.includes(app));
      const isAllowedResource = allowedResourceKeywords.some(
        keyword => resourceDisplayName.includes(keyword)
      );

      if (!isAllowedApp && !isAllowedResource) {
        console.log(
          `[IGNORED_NON_AZURE_LOGIN] ${signIn.userPrincipalName} - ` +
          `App: "${appDisplayName}", Resource: "${resourceDisplayName}" not Azure-related. Skipping.`
        );
        continue;
      }

      azurePortalCount++;

      const userPrincipalName = signIn.userPrincipalName;
      const loginTime = new Date(signIn.createdDateTime);
      const signInId = signIn.id || null;

      // Get user from map
      const user = trackedUsersMap.get(normalizedUserId);
      const usageWindows = usageWindowsByRequest.get(user.request_id) || [];

      if (await isSignInAlreadyProcessed(signInId)) {
        continue;
      }

      let access;

      if (user.enable_daily_usage) {
        const request = {
          enable_daily_usage: user.enable_daily_usage,
          daily_limit_minutes: user.daily_limit_minutes,
          usage_schedule: user.usage_schedule
        };
        const refreshedUser = await resetDailyCountersIfNeeded(request, user, user.id, user.request_id);
        access = evaluateUsageAccess({
          request,
          user: refreshedUser,
          currentSessionMinutes: 0,
          at: loginTime
        });
      } else if (user.has_usage_windows) {
        access = await evaluateWindowDailyLimitAccess({
          requestId: user.request_id,
          userId: user.id,
          windows: usageWindows,
          at: loginTime
        });
      } else {
        access = { allowed: true, reason: 'ok' };
      }

      if (!access.allowed) {
        console.log(
          `[SIGNIN_MONITOR] User ${user.id} denied Azure session (${access.reason}): ${access.message}`
        );

        if (user.enable_daily_usage && user.enforce_in_azure) {
          if (access.reason === 'limit_exceeded' || access.reason === 'daily_hour_limit_reached') {
            usageEnforcementService
              .enforceUsageLimit({ requestId: user.request_id, userId: user.id })
              .catch((error) => console.error('[SIGNIN_MONITOR] Enforcement error:', error.message));
          } else {
            usageEnforcementService
              .enforceScheduleViolation({
                requestId: user.request_id,
                userId: user.id,
                reason: access.reason,
                blockedUntil: access.blockedUntil,
                message: access.message
              })
              .catch((error) => console.error('[SIGNIN_MONITOR] Schedule enforcement error:', error.message));
          }
        } else if (user.has_usage_windows && access.reason === 'limit_exceeded') {
          usageEnforcementService
            .enforceUsageLimit({ requestId: user.request_id, userId: user.id })
            .catch((error) => console.error('[SIGNIN_MONITOR] Window limit enforcement error:', error.message));
        }

        await markSignInProcessed({
          signInId,
          azureUserId,
          requestId: user.request_id,
          userId: user.id
        });
        continue;
      }

      // STEP 5: Log tracked user match
      console.log(
        `[TRACKED_USER] username=${user.username}, request=${user.request_id}`
      );

      // Check if active session already exists
      const sessionCheck = await db.query(
        `
        SELECT id
        FROM user_usage_sessions
        WHERE request_id = $1
          AND user_id = $2
          AND logout_at IS NULL
        LIMIT 1
        `,
        [user.request_id, user.id]
      );

      if (sessionCheck.rows.length > 0) {
        // New Azure sign-in while a DB session is still open = user logged out and back in.
        // Close the prior stretch so used_today_minutes accumulates across sessions.
        console.log(
          `[SESSION_CONTINUATION] User ${user.id} re-authenticated in Azure. ` +
          `Closing session ${sessionCheck.rows[0].id} before starting a new one.`
        );

        try {
          await usageService.endUsageSessionIfActive({
            requestId: user.request_id,
            userId: user.id
          });
        } catch (error) {
          console.error(
            `[SESSION_CONTINUATION] Failed to close prior session for user ${user.id}:`,
            error.message
          );
          await markSignInProcessed({
            signInId,
            azureUserId,
            requestId: user.request_id,
            userId: user.id
          });
          continue;
        }
      }

      // Create new session
      const sessionResult = await db.query(
        `
        INSERT INTO user_usage_sessions (
          request_id,
          user_id,
          login_at
        )
        VALUES ($1, $2, $3)
        RETURNING id
        `,
        [user.request_id, user.id, loginTime]
      );

      const sessionId = sessionResult.rows[0].id;

      // Update last sign-in time
      await db.query(
        `
        UPDATE azure_users
        SET last_signin_at = NOW()
        WHERE id = $1
        `,
        [user.id]
      );

      sessionsCreated++;

      console.log(
        `[SESSION_CREATED] Session ${sessionId} created for user ${user.id} (${user.username}) from Azure sign-in at ${loginTime.toISOString()}`
      );

      await markSignInProcessed({
        signInId,
        azureUserId,
        requestId: user.request_id,
        userId: user.id
      });
    }

    // STEP 7: Summary
    console.log(
      `[SIGNIN_MONITOR] Completed. Fetched=${fetchedCount}, Tracked=${trackedCount}, AzurePortal=${azurePortalCount}, SessionsCreated=${sessionsCreated}`
    );

    if (fetchedCount > 0 && trackedCount === 0) {
      const sampleSignIns = signIns.value.slice(0, 5).map((signIn) => ({
        upn: signIn.userPrincipalName,
        userId: signIn.userId,
        app: signIn.appDisplayName,
        resource: signIn.resourceDisplayName
      }));
      console.log(
        '[SIGNIN_MONITOR] Fetched sign-ins did not match any tracked provisioned users. Sample:',
        JSON.stringify(sampleSignIns)
      );
    }
  } catch (error) {
    console.error('[SIGNIN_MONITOR] Error monitoring Azure sign-ins:', error.message);

    // Log specific Graph API errors
    if (error.statusCode === 403) {
      console.error(
        '[SIGNIN_MONITOR] Permission denied. Ensure the Azure app has AuditLog.Read.All, ' +
        'Directory.Read.All, User.RevokeSessions.All, and User.ReadWrite.All (application) with admin consent.'
      );
    } else if (error.statusCode === 401) {
      console.error(
        '[SIGNIN_MONITOR] Authentication failed. Check AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET.'
      );
    } else {
      console.error('[SIGNIN_MONITOR] Full error:', error);
    }

    console.log(
      `[SIGNIN_MONITOR] Completed with error. Fetched=${fetchedCount}, Tracked=${trackedCount}, AzurePortal=${azurePortalCount}, SessionsCreated=${sessionsCreated}`
    );
  }
};

module.exports = {
  monitorAzureSignIns
};
