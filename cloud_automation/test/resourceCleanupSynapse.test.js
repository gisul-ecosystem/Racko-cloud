require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getApiVersion,
  getDeleteOrderIndex,
  sortResourcesForDeletion
} = require('../src/services/resourceCleanupService');

test('getApiVersion resolves Synapse workspace and child resources', () => {
  assert.equal(getApiVersion('Microsoft.Synapse/workspaces'), '2021-06-01');
  assert.equal(getApiVersion('Microsoft.Synapse/workspaces/bigDataPools'), '2021-06-01');
  assert.equal(getApiVersion('Microsoft.Synapse/workspaces/notebooks'), '2021-06-01');
  assert.equal(getApiVersion('Microsoft.Web/connections'), '2016-06-01');
});

test('sortResourcesForDeletion deletes Synapse children before workspaces', () => {
  const resources = [
    {
      id: '/subscriptions/x/resourceGroups/rg/providers/Microsoft.Synapse/workspaces/lab',
      type: 'Microsoft.Synapse/workspaces',
      name: 'lab'
    },
    {
      id: '/subscriptions/x/resourceGroups/rg/providers/Microsoft.Synapse/workspaces/lab/bigDataPools/pool',
      type: 'Microsoft.Synapse/workspaces/bigDataPools',
      name: 'lab/pool'
    },
    {
      id: '/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/connections/sql',
      type: 'Microsoft.Web/connections',
      name: 'sql'
    }
  ];

  const sorted = sortResourcesForDeletion(resources);
  const types = sorted.map((resource) => resource.type);

  assert.deepEqual(types, [
    'Microsoft.Synapse/workspaces/bigDataPools',
    'Microsoft.Web/connections',
    'Microsoft.Synapse/workspaces'
  ]);
});

test('getDeleteOrderIndex keeps unknown Synapse child types before workspace', () => {
  const workspaceIndex = getDeleteOrderIndex('Microsoft.Synapse/workspaces');
  const childIndex = getDeleteOrderIndex('Microsoft.Synapse/workspaces/customChild');

  assert.ok(childIndex < workspaceIndex);
});
