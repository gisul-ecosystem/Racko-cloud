const express = require('express');
const {
  assignCustomRoleToAllUsersInRequest,
  assignCustomRoleToUser,
  createCustomRoleDefinition,
  deleteCustomRoleDefinition,
  getCustomRoleAssignmentsForRequest,
  getCustomRoleDefinitionById,
  listCustomRoleDefinitions,
  revokeCustomRoleAssignment,
  updateCustomRoleDefinition
} = require('../services/customRoleService');
const {
  addCustomServiceToRequest,
  createCustomService,
  deleteCustomService,
  getCustomServicesForRequest,
  listCustomServices,
  removeCustomServiceFromRequest,
  updateCustomService
} = require('../services/customServiceService');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');

const router = express.Router();

router.get('/custom-roles', requireSuperAdmin, async (req, res, next) => {
  try {
    const roles = await listCustomRoleDefinitions();
    res.json({ success: true, roles });
  } catch (error) {
    next(error);
  }
});

router.post('/custom-roles', requireSuperAdmin, async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    if (!permissions?.length) {
      return res.status(400).json({ success: false, message: 'Permissions are required' });
    }

    const role = await createCustomRoleDefinition({
      name,
      description,
      permissions,
      createdBy: req.headers['x-user-id']
    });

    res.json({ success: true, role });
  } catch (error) {
    next(error);
  }
});

router.put('/custom-roles/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const role = await updateCustomRoleDefinition(Number(req.params.id), req.body);
    res.json({ success: true, role });
  } catch (error) {
    next(error);
  }
});

router.delete('/custom-roles/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    await deleteCustomRoleDefinition(Number(req.params.id));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/resource-groups/:requestId/custom-role-assignments',
  requireSuperAdmin,
  async (req, res, next) => {
    try {
      const assignments = await getCustomRoleAssignmentsForRequest(Number(req.params.requestId));
      res.json({ success: true, assignments });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/resource-groups/:requestId/assign-custom-role-to-all',
  requireSuperAdmin,
  async (req, res, next) => {
    try {
      const { customRoleDefId, permissions, skipExisting } = req.body;

      if (!permissions?.length && !customRoleDefId) {
        return res.status(400).json({
          success: false,
          message: 'Either customRoleDefId or permissions required'
        });
      }

      const result = await assignCustomRoleToAllUsersInRequest({
        requestId: Number(req.params.requestId),
        customRoleDefId: customRoleDefId || null,
        permissions: permissions || null,
        assignedBy: req.headers['x-user-id'],
        skipExisting: skipExisting !== false
      });

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/resource-groups/:requestId/users/:userId/assign-custom-role',
  requireSuperAdmin,
  async (req, res, next) => {
    try {
      const { customRoleDefId, permissions, resourceGroupName } = req.body;

      if (!permissions?.length && !customRoleDefId) {
        return res.status(400).json({
          success: false,
          message: 'Either customRoleDefId or permissions required'
        });
      }

      let resolvedPermissions = permissions;

      if (customRoleDefId && !permissions?.length) {
        const roleDefinition = await getCustomRoleDefinitionById(Number(customRoleDefId));

        if (!roleDefinition) {
          return res.status(404).json({
            success: false,
            message: 'Custom role definition not found'
          });
        }

        resolvedPermissions = roleDefinition.permissions;
      }

      const assignment = await assignCustomRoleToUser({
        requestId: Number(req.params.requestId),
        azureUserId: req.params.userId,
        username: req.body.username,
        customRoleDefId: customRoleDefId || null,
        permissions: resolvedPermissions,
        resourceGroupName,
        assignedBy: req.headers['x-user-id']
      });

      res.json({ success: true, assignment });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/custom-role-assignments/:assignmentId',
  requireSuperAdmin,
  async (req, res, next) => {
    try {
      await revokeCustomRoleAssignment(Number(req.params.assignmentId));
      res.json({ success: true, message: 'Custom role revoked' });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/custom-services', requireSuperAdmin, async (req, res, next) => {
  try {
    const services = await listCustomServices();
    res.json({ success: true, services });
  } catch (error) {
    next(error);
  }
});

router.post('/custom-services', requireSuperAdmin, async (req, res, next) => {
  try {
    const { name, description, category, pricePerUser, icon } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const service = await createCustomService({
      name,
      description,
      category,
      pricePerUser,
      icon,
      createdBy: req.headers['x-user-id']
    });

    res.json({ success: true, service });
  } catch (error) {
    next(error);
  }
});

router.put('/custom-services/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const service = await updateCustomService(Number(req.params.id), req.body);
    res.json({ success: true, service });
  } catch (error) {
    next(error);
  }
});

router.delete('/custom-services/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    await deleteCustomService(Number(req.params.id));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/resource-groups/:requestId/custom-services/:serviceId',
  requireSuperAdmin,
  async (req, res, next) => {
    try {
      await addCustomServiceToRequest(
        Number(req.params.requestId),
        Number(req.params.serviceId),
        req.headers['x-user-id']
      );
      res.json({ success: true, message: 'Custom service added to request' });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/resource-groups/:requestId/custom-services/:serviceId',
  requireSuperAdmin,
  async (req, res, next) => {
    try {
      await removeCustomServiceFromRequest(
        Number(req.params.requestId),
        Number(req.params.serviceId)
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
  }
  }
);

router.get(
  '/resource-groups/:requestId/custom-services',
  requireSuperAdmin,
  async (req, res, next) => {
    try {
      const services = await getCustomServicesForRequest(Number(req.params.requestId));
      res.json({ success: true, services });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
