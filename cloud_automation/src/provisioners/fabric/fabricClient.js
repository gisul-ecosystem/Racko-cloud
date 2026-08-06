const { getAzureContext } = require('../../config/azure');
const AppError = require('../../utils/AppError');

const FABRIC_SCOPE = 'https://api.fabric.microsoft.com/.default';
const FABRIC_BASE_URL = 'https://api.fabric.microsoft.com/v1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logFabric = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'fabric-client',
    level,
    event,
    ...details,
  };
  const message = JSON.stringify(entry);
  if (level === 'error') {
    console.error(message);
    return;
  }
  console.log(message);
};

async function getFabricAccessToken() {
  const { credential } = getAzureContext();
  const token = await credential.getToken(FABRIC_SCOPE);
  if (!token?.token) {
    throw new AppError(
      'Unable to acquire Fabric API token. Grant the app Fabric permissions and admin consent.',
      500
    );
  }
  return token.token;
}

async function fabricRequest(method, path, { body, token, allowStatuses = [] } = {}) {
  const accessToken = token || (await getFabricAccessToken());
  const url = path.startsWith('http') ? path : `${FABRIC_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (response.status === 202) {
    return {
      status: 202,
      headers: Object.fromEntries(response.headers.entries()),
      data: null,
      operationLocation:
        response.headers.get('operation-location') ||
        response.headers.get('Location') ||
        response.headers.get('x-ms-operation-id'),
    };
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok && !allowStatuses.includes(response.status)) {
    const message =
      data?.message ||
      data?.error?.message ||
      data?.error_description ||
      `Fabric API ${method} ${path} failed with ${response.status}`;
    const error = new AppError(message, response.status >= 400 && response.status < 600 ? response.status : 500);
    error.fabricStatus = response.status;
    error.fabricBody = data;
    throw error;
  }

  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), data };
}

async function waitForFabricOperation(operationLocation, { token, timeoutMs = 180000 } = {}) {
  if (!operationLocation) return null;

  const accessToken = token || (await getFabricAccessToken());
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const result = await fabricRequest('GET', operationLocation, { token: accessToken });
    const status = String(result.data?.status || '').toLowerCase();

    if (status === 'succeeded' || status === 'success') {
      return result.data;
    }
    if (status === 'failed' || status === 'canceled' || status === 'cancelled') {
      throw new AppError(
        result.data?.error?.message || `Fabric long-running operation ${status}`,
        500
      );
    }

    await sleep(2000);
  }

  throw new AppError('Timed out waiting for Fabric operation to complete.', 504);
}

async function listCapacities(token) {
  const result = await fabricRequest('GET', '/capacities', { token, allowStatuses: [403, 404] });
  if (result.status >= 400) {
    return [];
  }
  return Array.isArray(result.data?.value) ? result.data.value : [];
}

async function resolveCapacityId(token) {
  const configured =
    String(process.env.FABRIC_CAPACITY_ID || '').trim() ||
    String(process.env.FABRIC_CAPACITY_NAME || '').trim();

  const capacities = await listCapacities(token);

  if (configured) {
    const byId = capacities.find(
      (capacity) => String(capacity.id).toLowerCase() === configured.toLowerCase()
    );
    if (byId) return byId.id;

    const byName = capacities.find(
      (capacity) =>
        String(capacity.displayName || capacity.name || '').toLowerCase() ===
        configured.toLowerCase()
    );
    if (byName) return byName.id;

    // Env may already be a capacity GUID even if list is empty/forbidden.
    if (/^[0-9a-f-]{36}$/i.test(configured)) {
      return configured;
    }

    throw new AppError(
      `Configured Fabric capacity "${configured}" was not found. Set FABRIC_CAPACITY_ID to a valid capacity.`,
      400
    );
  }

  if (capacities.length === 1) {
    return capacities[0].id;
  }

  const active = capacities.find(
    (capacity) => String(capacity.state || '').toLowerCase() === 'active'
  );
  if (active) return active.id;

  if (capacities.length > 0) {
    return capacities[0].id;
  }

  throw new AppError(
    'No Fabric capacity available. Set FABRIC_CAPACITY_ID in cloud_automation .env (Fabric Admin → Capacity settings).',
    400
  );
}

async function findWorkspaceByName(displayName, token) {
  const result = await fabricRequest('GET', '/workspaces', { token });
  const workspaces = Array.isArray(result.data?.value) ? result.data.value : [];
  return (
    workspaces.find(
      (workspace) =>
        String(workspace.displayName || '').trim().toLowerCase() ===
        displayName.trim().toLowerCase()
    ) || null
  );
}

async function createWorkspace({ displayName, description, capacityId, token }) {
  const existing = await findWorkspaceByName(displayName, token);
  if (existing) {
    if (capacityId && existing.capacityId !== capacityId) {
      await fabricRequest('POST', `/workspaces/${existing.id}/assignToCapacity`, {
        token,
        body: { capacityId },
        allowStatuses: [400, 409],
      });
    }
    return existing;
  }

  const payload = {
    displayName,
    description: description || undefined,
  };
  if (capacityId) {
    payload.capacityId = capacityId;
  }

  const created = await fabricRequest('POST', '/workspaces', { token, body: payload });
  if (created.status === 202 && created.operationLocation) {
    await waitForFabricOperation(created.operationLocation, { token });
    const found = await findWorkspaceByName(displayName, token);
    if (found) return found;
  }

  if (created.data?.id) {
    return created.data;
  }

  const found = await findWorkspaceByName(displayName, token);
  if (found) return found;

  throw new AppError('Fabric workspace was created but could not be loaded.', 500);
}

async function listWorkspaceItems(workspaceId, token) {
  const result = await fabricRequest('GET', `/workspaces/${workspaceId}/items`, {
    token,
    allowStatuses: [404],
  });
  if (result.status >= 400) return [];
  return Array.isArray(result.data?.value) ? result.data.value : [];
}

async function createWorkspaceItem(workspaceId, { displayName, type }, token) {
  const existing = await listWorkspaceItems(workspaceId, token);
  const match = existing.find(
    (item) =>
      String(item.displayName || '').toLowerCase() === displayName.toLowerCase() &&
      String(item.type || '').toLowerCase() === String(type).toLowerCase()
  );
  if (match) {
    return { ...match, reused: true };
  }

  const created = await fabricRequest('POST', `/workspaces/${workspaceId}/items`, {
    token,
    body: { displayName, type },
    allowStatuses: [400, 403, 404, 409],
  });

  if (created.status === 202 && created.operationLocation) {
    await waitForFabricOperation(created.operationLocation, { token });
    const items = await listWorkspaceItems(workspaceId, token);
    const after = items.find(
      (item) =>
        String(item.displayName || '').toLowerCase() === displayName.toLowerCase() &&
        String(item.type || '').toLowerCase() === String(type).toLowerCase()
    );
    if (after) return after;
  }

  if (created.status >= 400) {
    logFabric('error', 'fabric_item_create_failed', {
      workspaceId,
      displayName,
      type,
      status: created.status,
      body: created.data,
    });
    return {
      displayName,
      type,
      status: 'failed',
      error: created.data?.message || `Failed to create ${type}`,
    };
  }

  return created.data || { displayName, type, status: 'created' };
}

async function listWorkspaceRoleAssignments(workspaceId, token) {
  const result = await fabricRequest('GET', `/workspaces/${workspaceId}/roleAssignments`, {
    token,
    allowStatuses: [404],
  });
  if (result.status >= 400) return [];
  return Array.isArray(result.data?.value) ? result.data.value : [];
}

async function addWorkspaceRoleAssignment(workspaceId, { principalId, role }, token) {
  const existing = await listWorkspaceRoleAssignments(workspaceId, token);
  const match = existing.find(
    (assignment) =>
      String(assignment.principal?.id || '').toLowerCase() === String(principalId).toLowerCase()
  );

  if (match) {
    const currentRole = String(match.role || '');
    if (currentRole.toLowerCase() === String(role).toLowerCase()) {
      return { ...match, reused: true };
    }

    await fabricRequest(
      'PATCH',
      `/workspaces/${workspaceId}/roleAssignments/${match.id || principalId}`,
      {
        token,
        body: { role },
        allowStatuses: [400, 404, 409],
      }
    );
    return { id: match.id, principal: { id: principalId, type: 'User' }, role, updated: true };
  }

  const created = await fabricRequest('POST', `/workspaces/${workspaceId}/roleAssignments`, {
    token,
    body: {
      principal: {
        id: principalId,
        type: 'User',
      },
      role,
    },
    allowStatuses: [409],
  });

  if (created.status === 409) {
    return { principal: { id: principalId, type: 'User' }, role, reused: true };
  }

  return created.data || { principal: { id: principalId, type: 'User' }, role };
}

module.exports = {
  addWorkspaceRoleAssignment,
  createWorkspace,
  createWorkspaceItem,
  getFabricAccessToken,
  listCapacities,
  listWorkspaceItems,
  listWorkspaceRoleAssignments,
  logFabric,
  resolveCapacityId,
};
