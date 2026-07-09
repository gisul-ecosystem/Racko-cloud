const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resourceBelongsToUser,
  filterResourcesForUser,
  expandDeploymentResources,
  isDeploymentSibling
} = require('../src/utils/resourceOwnership');

test('resourceBelongsToUser matches owner tags', () => {
  const resource = {
    name: 'vm-1',
    tags: { racko_owner: 'abc-123' }
  };

  assert.equal(resourceBelongsToUser(resource, { entraObjectId: 'abc-123' }), true);
});

test('resourceBelongsToUser matches username patterns', () => {
  const resource = { name: 'cust201user1-vm', tags: {} };

  assert.equal(
    resourceBelongsToUser(resource, { username: 'cust-201-user-1@example.com' }),
    true
  );
});

test('resourceBelongsToUser matches user number patterns', () => {
  const resource = { name: 'azureuser12', tags: {} };

  assert.equal(resourceBelongsToUser(resource, { userNumber: 12 }), true);
});

test('resourceName matching avoids partial user number collisions', () => {
  const resource = { name: 'azureuser12936_z1', tags: {} };

  assert.equal(resourceBelongsToUser(resource, { userNumber: 12 }), false);
});

test('filterResourcesForUser returns only owned resources', () => {
  const resources = [
    { name: 'azureuser12', tags: {} },
    { name: 'other-user-vm', tags: {} }
  ];

  const owned = filterResourcesForUser(resources, { userNumber: 12 });
  assert.equal(owned.length, 1);
  assert.equal(owned[0].name, 'azureuser12');
});

test('isDeploymentSibling links VM stack resources', () => {
  assert.equal(isDeploymentSibling('azureuser12936_z1', 'azureuser12'), true);
  assert.equal(isDeploymentSibling('azureuser12-nsg', 'azureuser12'), true);
  assert.equal(isDeploymentSibling('azureuser12-ip', 'azureuser12'), true);
  assert.equal(isDeploymentSibling('other-vm', 'azureuser12'), false);
});

test('expandDeploymentResources includes VM deployment siblings', () => {
  const resources = [
    { id: '1', name: 'azureuser12', type: 'Microsoft.Compute/virtualMachines' },
    { id: '2', name: 'azureuser12936_z1', type: 'Microsoft.Network/networkInterfaces' },
    { id: '3', name: 'azureuser12-nsg', type: 'Microsoft.Network/networkSecurityGroups' },
    { id: '4', name: 'other-vm', type: 'Microsoft.Compute/virtualMachines' }
  ];

  const expanded = expandDeploymentResources(resources, [resources[0]]);
  assert.equal(expanded.length, 3);
  assert.deepEqual(
    expanded.map((resource) => resource.name).sort(),
    ['azureuser12', 'azureuser12-nsg', 'azureuser12936_z1'].sort()
  );
});
