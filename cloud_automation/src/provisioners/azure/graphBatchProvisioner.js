const AppError = require('../../utils/AppError');

const GRAPH_BATCH_SIZE = 20;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chunkArray = (items, size = GRAPH_BATCH_SIZE) => {
  const chunks = [];
  const array = Array.isArray(items) ? items : [];

  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }

  return chunks;
};

const isRetryableError = (error) => {
  const statusCode = Number(error?.statusCode || error?.status || error?.response?.status);
  const errorCode = String(error?.code || '').toUpperCase();

  return (
    RETRYABLE_STATUS_CODES.has(statusCode) ||
    ['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'REQUESTTIMEOUT'].includes(errorCode)
  );
};

const getRetryDelayMs = (error, attempt) => {
  const retryAfterHeader =
    error?.response?.headers?.get?.('retry-after') ||
    error?.headers?.['retry-after'] ||
    error?.responseHeaders?.['retry-after'];

  const retryAfterSeconds = Number(retryAfterHeader);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 30000);
  }

  return Math.min(500 * 2 ** (attempt - 1), 30000);
};

const sendBatch = async (graphClient, requests) => {
  if (!requests.length) {
    return { responses: [] };
  }

  return graphClient.api('/$batch').post({ requests });
};

const executeBatchWithRetry = async (graphClient, requests, context, options = {}) => {
  let pendingRequests = requests;
  let lastError;
  const successStatuses = new Set(
    Array.isArray(options.successStatuses) ? options.successStatuses : []
  );

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && pendingRequests.length > 0; attempt += 1) {
    try {
      const batchResponse = await sendBatch(graphClient, pendingRequests);
      const responses = Array.isArray(batchResponse?.responses) ? batchResponse.responses : [];
      const failedRequests = [];

      const responseMap = new Map(responses.map((response) => [String(response.id), response]));
      const results = [];

      for (const request of pendingRequests) {
        const response = responseMap.get(String(request.id));

        if (!response) {
          failedRequests.push(request);
          continue;
        }

        if (
          (response.status >= 200 && response.status < 300) ||
          successStatuses.has(Number(response.status))
        ) {
          results.push({
            request,
            response
          });
          continue;
        }

        if (isRetryableError(response)) {
          failedRequests.push(request);
          continue;
        }

        // Soft-fail non-retryable item errors so one bad user doesn't abort the lab delete.
        if (options.continueOnItemError) {
          results.push({
            request,
            response,
            softFailed: true
          });
          continue;
        }

        const error = new AppError(
          `Graph batch operation failed for ${context || 'request'} ${request.id} with status ${response.status}.`,
          response.status >= 400 ? response.status : 500
        );
        error.graphResponse = response;
        throw error;
      }

      if (failedRequests.length === 0) {
        return {
          responses,
          failedRequests: [],
          results
        };
      }

      pendingRequests = failedRequests;
      const retryDelayMs = getRetryDelayMs(null, attempt);
      await sleep(retryDelayMs);
    } catch (error) {
      lastError = error;

      if (attempt === MAX_ATTEMPTS || !isRetryableError(error)) {
        throw error;
      }

      const retryDelayMs = getRetryDelayMs(error, attempt);
      await sleep(retryDelayMs);
    }
  }

  throw lastError || new AppError(`Graph batch operation failed for ${context || 'request'}.`, 502);
};

const createUserUpdateBatchRequests = (users, patchFields = []) =>
  users.map((user, index) => {
    const body = {};

    for (const field of patchFields) {
      if (user[field] !== undefined && user[field] !== null && String(user[field]).trim() !== '') {
        body[field] = user[field];
      }
    }

    return {
      id: String(index + 1),
      method: 'PATCH',
      url: `/users/${user.azureUserId}`,
      headers: {
        'Content-Type': 'application/json'
      },
      body
    };
  });

const createGroupMembershipBatchRequests = (groupId, users) =>
  users.map((user, index) => ({
    id: String(index + 1),
    method: 'POST',
    url: `/groups/${groupId}/members/$ref`,
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${user.azureUserId}`
    }
  }));

const batchAddUsersToGroups = async (graphClient, groupId, users, context = 'group membership') => {
  const chunks = chunkArray(users, GRAPH_BATCH_SIZE);
  const allResponses = [];

  for (const chunk of chunks) {
    const batchRequests = createGroupMembershipBatchRequests(groupId, chunk);
    const batchResult = await executeBatchWithRetry(graphClient, batchRequests, context);
    allResponses.push(...(batchResult?.responses || []));
  }

  return allResponses;
};

const batchPatchUsers = async (graphClient, users, patchFields, context = 'user updates') => {
  const chunks = chunkArray(users, GRAPH_BATCH_SIZE);
  const allResponses = [];

  for (const chunk of chunks) {
    const batchRequests = createUserUpdateBatchRequests(chunk, patchFields);
    const batchResult = await executeBatchWithRetry(graphClient, batchRequests, context);
    allResponses.push(...(batchResult?.responses || []));
  }

  return allResponses;
};

const batchEnableUsers = async (graphClient, azureUserIds, context = 'bulk enable users') => {
  const uniqueIds = [...new Set((azureUserIds || []).filter(Boolean))];
  const enabled = [];
  const failed = [];

  if (!uniqueIds.length) {
    return { enabled, failed };
  }

  const chunks = chunkArray(uniqueIds, GRAPH_BATCH_SIZE);

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    const batchRequests = chunk.map((azureUserId) => ({
      id: String(azureUserId),
      method: 'PATCH',
      url: `/users/${azureUserId}`,
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        accountEnabled: true
      }
    }));

    try {
      const batchResult = await executeBatchWithRetry(graphClient, batchRequests, context);
      const responses = Array.isArray(batchResult?.responses) ? batchResult.responses : [];
      const responseById = new Map(responses.map((response) => [String(response.id), response]));

      for (const azureUserId of chunk) {
        const response = responseById.get(String(azureUserId));

        if (response && response.status >= 200 && response.status < 300) {
          enabled.push(azureUserId);
          continue;
        }

        failed.push({
          azureUserId,
          status: response?.status || null,
          error:
            response?.body?.error?.message ||
            response?.body?.message ||
            'Failed to enable Azure account'
        });
      }
    } catch (error) {
      for (const azureUserId of chunk) {
        failed.push({
          azureUserId,
          status: Number(error?.statusCode || error?.status || 502),
          error: error?.message || 'Graph batch enable failed'
        });
      }
    }

    if (chunkIndex < chunks.length - 1) {
      await sleep(750);
    }
  }

  return { enabled, failed };
};

const batchDisableUsers = async (graphClient, azureUserIds, context = 'bulk disable users') => {
  const uniqueIds = [...new Set((azureUserIds || []).filter(Boolean))];
  const disabled = [];
  const failed = [];

  if (!uniqueIds.length) {
    return { disabled, failed };
  }

  const chunks = chunkArray(uniqueIds, GRAPH_BATCH_SIZE);

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    const batchRequests = chunk.map((azureUserId) => ({
      id: String(azureUserId),
      method: 'PATCH',
      url: `/users/${azureUserId}`,
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        accountEnabled: false
      }
    }));

    try {
      const batchResult = await executeBatchWithRetry(graphClient, batchRequests, context);
      const responses = Array.isArray(batchResult?.responses) ? batchResult.responses : [];
      const responseById = new Map(responses.map((response) => [String(response.id), response]));

      for (const azureUserId of chunk) {
        const response = responseById.get(String(azureUserId));

        if (response && response.status >= 200 && response.status < 300) {
          disabled.push(azureUserId);
          continue;
        }

        failed.push({
          azureUserId,
          status: response?.status || null,
          error:
            response?.body?.error?.message ||
            response?.body?.message ||
            'Failed to disable Azure account'
        });
      }
    } catch (error) {
      for (const azureUserId of chunk) {
        failed.push({
          azureUserId,
          status: Number(error?.statusCode || error?.status || 502),
          error: error?.message || 'Graph batch disable failed'
        });
      }
    }

    if (chunkIndex < chunks.length - 1) {
      await sleep(750);
    }
  }

  return { disabled, failed };
};

/**
 * Delete Entra users via Graph /$batch (20/request). Much faster and gentler
 * than one DELETE per user when tearing down large labs (52–500 users).
 */
const batchDeleteUsers = async (graphClient, azureUserIds, context = 'bulk delete users') => {
  const uniqueIds = [...new Set((azureUserIds || []).filter(Boolean).map(String))];
  const deleted = [];
  const failed = [];

  if (!uniqueIds.length) {
    return { deleted, failed };
  }

  const chunks = chunkArray(uniqueIds, GRAPH_BATCH_SIZE);

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    const batchRequests = chunk.map((azureUserId) => ({
      id: String(azureUserId),
      method: 'DELETE',
      url: `/users/${encodeURIComponent(azureUserId)}`
    }));

    try {
      const batchResult = await executeBatchWithRetry(graphClient, batchRequests, context, {
        successStatuses: [404],
        continueOnItemError: true
      });
      const responses = Array.isArray(batchResult?.responses) ? batchResult.responses : [];
      const responseById = new Map(responses.map((response) => [String(response.id), response]));
      // Prefer per-request results (includes soft-failed items).
      const resultById = new Map(
        (batchResult?.results || []).map((entry) => [String(entry.request.id), entry])
      );

      for (const azureUserId of chunk) {
        const entry = resultById.get(String(azureUserId));
        const response = entry?.response || responseById.get(String(azureUserId));
        const status = Number(response?.status || 0);

        // 204/200 = deleted; 404 = already gone — both OK for teardown.
        if ((status >= 200 && status < 300) || status === 404) {
          deleted.push(azureUserId);
          continue;
        }

        failed.push({
          azureUserId,
          status: status || null,
          error:
            response?.body?.error?.message ||
            response?.body?.message ||
            'Failed to delete Azure user'
        });
      }
    } catch (error) {
      for (const azureUserId of chunk) {
        failed.push({
          azureUserId,
          status: Number(error?.statusCode || error?.status || 502),
          error: error?.message || 'Graph batch delete failed'
        });
      }
    }

    // Pace batches so Graph throttling stays rare on 500-user deletes.
    if (chunkIndex < chunks.length - 1) {
      await sleep(400);
    }
  }

  return { deleted, failed };
};

module.exports = {
  GRAPH_BATCH_SIZE,
  batchAddUsersToGroups,
  batchPatchUsers,
  batchEnableUsers,
  batchDisableUsers,
  batchDeleteUsers,
  chunkArray,
  executeBatchWithRetry,
  isRetryableError,
  getRetryDelayMs
};
