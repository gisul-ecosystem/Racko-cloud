const {
  getDependencyRolesForService,
  getAllDependencyRoles
} = require('../config/serviceRoleDependencies');
const { optionalTableQuery } = require('../utils/transactionQuery');

const loadDependencyRowsFromDb = async (client, serviceNames) => {
  if (!Array.isArray(serviceNames) || serviceNames.length === 0) {
    return null;
  }

  return optionalTableQuery(
    client,
    async () => {
      const result = await client.query(
        `
        SELECT service_name, dependency_role, reason
        FROM service_role_dependencies
        WHERE service_name = ANY($1::text[])
        ORDER BY service_name, dependency_role
      `,
        [serviceNames]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows.map((row) => ({
        serviceName: row.service_name,
        role: row.dependency_role,
        reason: row.reason
      }));
    },
    null
  );
};

const getDependencyRolesForServices = async (client, serviceNames = []) => {
  const uniqueNames = [...new Set(serviceNames.filter(Boolean))];
  const fromDb = await loadDependencyRowsFromDb(client, uniqueNames);

  if (fromDb) {
    return fromDb;
  }

  return uniqueNames.flatMap((serviceName) =>
    getDependencyRolesForService(serviceName).map((dep) => ({
      serviceName,
      role: dep.role,
      reason: dep.reason
    }))
  );
};

const getUniqueDependencyRoles = async (client, serviceNames = []) => {
  const deps = await getDependencyRolesForServices(client, serviceNames);
  const roleSet = new Map();

  for (const dep of deps) {
    if (!roleSet.has(dep.role)) {
      roleSet.set(dep.role, dep.reason);
    }
  }

  return Array.from(roleSet.entries()).map(([role, reason]) => ({ role, reason }));
};

const getUniqueDependencyRolesFromConfig = (serviceNames = []) => getAllDependencyRoles(serviceNames);

module.exports = {
  getDependencyRolesForServices,
  getUniqueDependencyRoles,
  getUniqueDependencyRolesFromConfig
};
