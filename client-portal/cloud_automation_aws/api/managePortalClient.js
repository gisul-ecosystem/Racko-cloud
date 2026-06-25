import { apiRequest } from '../../lib/apiClient';
import { AWS_API_BASE } from '../constants';

function awsManagePath(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${AWS_API_BASE}${normalized}`;
}

export class AwsManagePortalError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'AwsManagePortalError';
    this.status = status;
  }
}

async function manageRequest(path, { jwtToken, ...options } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (jwtToken) {
    headers.Authorization = `Bearer ${jwtToken}`;
  }

  try {
    const response = await apiRequest(`${awsManagePath(path)}`, {
      ...options,
      headers,
      skipAuth: true,
    });
    return response;
  } catch (err) {
    throw new AwsManagePortalError(err.message || 'Request failed', err.status || 0);
  }
}

export async function loginAwsManagePortal({ token, username, password }) {
  const result = await manageRequest('/manage/aws/login', {
    method: 'POST',
    body: JSON.stringify({ token, username, password }),
  });

  if (!result.success) {
    throw new AwsManagePortalError(result.message || 'Login failed');
  }

  return result;
}

export async function fetchAwsManagePortalData(requestId, jwtToken) {
  const result = await manageRequest(`/manage/aws/request/${requestId}`, {
    method: 'GET',
    jwtToken,
  });

  if (!result.success || !result.data) {
    throw new AwsManagePortalError(result.message || 'Failed to load portal data');
  }

  return result.data;
}

export async function generateAwsConsoleUrl(requestId, userIndex, jwtToken) {
  const result = await manageRequest(
    `/manage/aws/request/${requestId}/users/${userIndex}/console-url`,
    {
      method: 'POST',
      jwtToken,
    }
  );

  if (!result.success || !result.consoleUrl) {
    throw new AwsManagePortalError(result.message || 'Failed to generate console URL');
  }

  return result;
}

export async function suspendAwsLabUser(requestId, userIndex, jwtToken) {
  return manageRequest(`/manage/aws/request/${requestId}/users/${userIndex}/suspend`, {
    method: 'POST',
    jwtToken,
  });
}

export async function reinstateAwsLabUser(requestId, userIndex, jwtToken) {
  return manageRequest(`/manage/aws/request/${requestId}/users/${userIndex}/reinstate`, {
    method: 'POST',
    jwtToken,
  });
}

export async function cleanupAwsLabUser(requestId, userIndex, jwtToken) {
  const result = await manageRequest(
    `/manage/aws/request/${requestId}/users/${userIndex}/cleanup`,
    {
      method: 'POST',
      jwtToken,
    }
  );

  if (!result.success) {
    throw new AwsManagePortalError(result.message || 'Cleanup failed');
  }

  return result;
}

export async function cleanupAllAwsLabUsers(requestId, jwtToken) {
  const result = await manageRequest(`/manage/aws/request/${requestId}/cleanup-all`, {
    method: 'POST',
    jwtToken,
  });

  if (!result.success) {
    throw new AwsManagePortalError(result.message || 'Cleanup failed');
  }

  return result;
}

export async function updateAwsCleanupSettings(requestId, jwtToken, settings) {
  const result = await manageRequest(`/manage/aws/request/${requestId}/cleanup-settings`, {
    method: 'PUT',
    jwtToken,
    body: JSON.stringify(settings),
  });

  if (!result.success) {
    throw new AwsManagePortalError(result.message || 'Failed to update cleanup settings');
  }

  return result;
}

export async function syncAwsRequestSpend(requestId, jwtToken) {
  const result = await manageRequest(`/manage/aws/request/${requestId}/sync-spend`, {
    method: 'POST',
    jwtToken,
  });

  if (!result.success) {
    throw new AwsManagePortalError(result.message || 'Failed to sync spend');
  }

  return result;
}

export async function renewAwsLabUserBudget(requestId, userIndex, jwtToken) {
  const result = await manageRequest(
    `/manage/aws/request/${requestId}/users/${userIndex}/renew-budget`,
    {
      method: 'POST',
      jwtToken,
    }
  );

  if (!result.success) {
    throw new AwsManagePortalError(result.message || 'Failed to renew budget');
  }

  return result;
}
