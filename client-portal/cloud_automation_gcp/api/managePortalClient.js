import { apiRequest } from '../../lib/apiClient';
import { GCP_API_BASE } from '../constants';

function gcpManagePath(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${GCP_API_BASE}${normalized}`;
}

export class GcpManagePortalError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'GcpManagePortalError';
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
    const response = await apiRequest(`${gcpManagePath(path)}`, {
      ...options,
      headers,
      skipAuth: true,
    });
    return response;
  } catch (err) {
    throw new GcpManagePortalError(err.message || 'Request failed', err.status || 0);
  }
}

export async function loginGcpManagePortal({ token, username, password }) {
  const result = await manageRequest('/manage/gcp/login', {
    method: 'POST',
    body: JSON.stringify({ token, username, password }),
  });

  if (!result.success) {
    throw new GcpManagePortalError(result.message || 'Login failed');
  }

  return result;
}

export async function fetchGcpManagePortalData(requestId, jwtToken) {
  const result = await manageRequest(`/manage/gcp/request/${requestId}`, {
    method: 'GET',
    jwtToken,
  });

  if (!result.success || !result.data) {
    throw new GcpManagePortalError(result.message || 'Failed to load portal data');
  }

  return result.data;
}

export async function generateGcpConsoleUrl(requestId, userIndex, jwtToken) {
  const result = await manageRequest(
    `/manage/gcp/request/${requestId}/users/${userIndex}/console-url`,
    {
      method: 'POST',
      jwtToken,
    }
  );

  if (!result.success || !result.consoleUrl) {
    throw new GcpManagePortalError(result.message || 'Failed to generate console URL');
  }

  return result;
}

export async function suspendGcpLabUser(requestId, userIndex, jwtToken) {
  return manageRequest(`/manage/gcp/request/${requestId}/users/${userIndex}/suspend`, {
    method: 'POST',
    jwtToken,
  });
}

export async function reinstateGcpLabUser(requestId, userIndex, jwtToken) {
  return manageRequest(`/manage/gcp/request/${requestId}/users/${userIndex}/reinstate`, {
    method: 'POST',
    jwtToken,
  });
}

export async function cleanupGcpLabUser(requestId, userIndex, jwtToken) {
  const result = await manageRequest(
    `/manage/gcp/request/${requestId}/users/${userIndex}/cleanup`,
    {
      method: 'POST',
      jwtToken,
    }
  );

  if (!result.success) {
    throw new GcpManagePortalError(result.message || 'Cleanup failed');
  }

  return result;
}

export async function cleanupAllGcpLabUsers(requestId, jwtToken) {
  const result = await manageRequest(`/manage/gcp/request/${requestId}/cleanup-all`, {
    method: 'POST',
    jwtToken,
  });

  if (!result.success) {
    throw new GcpManagePortalError(result.message || 'Cleanup failed');
  }

  return result;
}

export async function updateGcpCleanupSettings(requestId, jwtToken, settings) {
  const result = await manageRequest(`/manage/gcp/request/${requestId}/cleanup-settings`, {
    method: 'PUT',
    jwtToken,
    body: JSON.stringify(settings),
  });

  if (!result.success) {
    throw new GcpManagePortalError(result.message || 'Failed to update cleanup settings');
  }

  return result;
}

export async function syncGcpRequestSpend(requestId, jwtToken) {
  const result = await manageRequest(`/manage/gcp/request/${requestId}/sync-spend`, {
    method: 'POST',
    jwtToken,
  });

  if (!result.success) {
    throw new GcpManagePortalError(result.message || 'Failed to sync spend');
  }

  return result;
}

export async function renewGcpLabUserBudget(requestId, userIndex, jwtToken) {
  const result = await manageRequest(
    `/manage/gcp/request/${requestId}/users/${userIndex}/renew-budget`,
    {
      method: 'POST',
      jwtToken,
    }
  );

  if (!result.success) {
    throw new GcpManagePortalError(result.message || 'Failed to renew budget');
  }

  return result;
}
