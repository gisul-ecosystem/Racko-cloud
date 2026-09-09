import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { vmInventoryController } from './vmInventory.controller';
import {
  assignCredentialSchema,
  assignmentIdParamSchema,
  bulkAssignSchema,
  bulkDeleteServersSchema,
  bulkResetServersSchema,
  bulkSetOverrideSchema,
  bulkUnassignServersSchema,
  credentialIdParamSchema,
  importRowsSchema,
  installSoftwareSchema,
  listVmInventorySchema,
  mapOwnerSchema,
  ownerQuerySchema,
  pushAgentSchema,
  resolveLoginsSchema,
  serverIdParamSchema,
  setLockSchema,
  setOverrideSchema,
  updateNotificationSettingsSchema,
  updateServerSchema,
  upsertCredentialSchema,
} from './vmInventory.validation';

const router = Router();

router.use(requireAuth);
/** Read gate for the whole surface. `super_admin` bypasses permission checks. */
router.use(requirePermission('vm_inventory.read'));

const canWrite = requirePermission('vm_inventory.write');
/** Decrypting a stored credential is gated separately from ordinary writes. */
const canReveal = requirePermission('vm_inventory.reveal_credentials');

router.get('/', validateRequest(listVmInventorySchema), (req, res, next) =>
  vmInventoryController.list(req, res, next)
);

router.get('/filter-options', (req, res, next) =>
  vmInventoryController.filterOptions(req, res, next)
);

router.get('/assignees', validateRequest(ownerQuerySchema), (req, res, next) =>
  vmInventoryController.listAssignees(req, res, next)
);

router.get('/projects', validateRequest(ownerQuerySchema), (req, res, next) =>
  vmInventoryController.listProjects(req, res, next)
);

router.get('/notification-settings', (req, res, next) =>
  vmInventoryController.getNotificationSettings(req, res, next)
);

router.put(
  '/notification-settings',
  canWrite,
  validateRequest(updateNotificationSettingsSchema),
  (req, res, next) => vmInventoryController.updateNotificationSettings(req, res, next)
);

router.get(
  '/credentials/:credentialId/password',
  canReveal,
  validateRequest(credentialIdParamSchema),
  (req, res, next) => vmInventoryController.revealPassword(req, res, next)
);

router.post('/import', canWrite, validateRequest(importRowsSchema), (req, res, next) =>
  vmInventoryController.importRows(req, res, next)
);

router.post('/map-owner', canWrite, validateRequest(mapOwnerSchema), (req, res, next) =>
  vmInventoryController.mapOwner(req, res, next)
);

router.post('/bulk-assign', canWrite, validateRequest(bulkAssignSchema), (req, res, next) =>
  vmInventoryController.bulkAssign(req, res, next)
);

// Write-gated even though it reads: confirming a supplied VM password is a
// weaker form of revealing it, so ordinary read access is not enough.
router.post('/resolve-logins', canWrite, validateRequest(resolveLoginsSchema), (req, res, next) =>
  vmInventoryController.resolveLogins(req, res, next)
);

router.post('/assignments', canWrite, validateRequest(assignCredentialSchema), (req, res, next) =>
  vmInventoryController.assign(req, res, next)
);

router.patch(
  '/assignments/:assignmentId/override',
  canWrite,
  validateRequest(setOverrideSchema),
  (req, res, next) => vmInventoryController.setOverride(req, res, next)
);

router.delete(
  '/assignments/:assignmentId',
  canWrite,
  validateRequest(assignmentIdParamSchema),
  (req, res, next) => vmInventoryController.unassign(req, res, next)
);

// Registered before the /servers/:serverId routes so the literal path wins.
router.post(
  '/servers/bulk-unassign',
  canWrite,
  validateRequest(bulkUnassignServersSchema),
  (req, res, next) => vmInventoryController.bulkUnassignServers(req, res, next)
);

// Registered before the /servers/:serverId routes so the literal path wins.
router.post(
  '/servers/bulk-delete',
  canWrite,
  validateRequest(bulkDeleteServersSchema),
  (req, res, next) => vmInventoryController.bulkDeleteServers(req, res, next)
);

router.post(
  '/servers/bulk-reset',
  canWrite,
  validateRequest(bulkResetServersSchema),
  (req, res, next) => vmInventoryController.bulkResetServers(req, res, next)
);

router.post('/push-agent', canWrite, validateRequest(pushAgentSchema), (req, res, next) =>
  vmInventoryController.pushAgent(req, res, next)
);

router.post(
  '/install-software',
  canWrite,
  validateRequest(installSoftwareSchema),
  (req, res, next) => vmInventoryController.installSoftware(req, res, next)
);

router.post(
  '/servers/bulk-override',
  canWrite,
  validateRequest(bulkSetOverrideSchema),
  (req, res, next) => vmInventoryController.bulkSetOverride(req, res, next)
);

router.patch(
  '/servers/:serverId/lock',
  canWrite,
  validateRequest(setLockSchema),
  (req, res, next) => vmInventoryController.setLock(req, res, next)
);

router.post(
  '/servers/:serverId/credentials',
  canWrite,
  validateRequest(upsertCredentialSchema),
  (req, res, next) => vmInventoryController.upsertCredential(req, res, next)
);

router.patch(
  '/servers/:serverId',
  canWrite,
  validateRequest(updateServerSchema),
  (req, res, next) => vmInventoryController.updateServer(req, res, next)
);

router.delete(
  '/servers/:serverId',
  canWrite,
  validateRequest(serverIdParamSchema),
  (req, res, next) => vmInventoryController.deleteServer(req, res, next)
);

export default router;
