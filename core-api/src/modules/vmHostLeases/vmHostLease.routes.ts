import { Router } from 'express';
import { vmHostLeaseController } from './vmHostLease.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { vmHostLeaseUpload } from '../../middleware/vmHostLeaseUpload.middleware';
import {
  createVmHostLeaseSchema,
  listVmHostLeasesQuerySchema,
  updateVmHostLeaseSchema,
  vmHostLeaseIdParamSchema,
} from './vmHostLease.validation';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('vm_host_leases.manage'));

/** POST /api/v1/vm-host-leases/upload — Excel import */
router.post('/upload', vmHostLeaseUpload.single('file'), (req, res, next) =>
  vmHostLeaseController.upload(req, res, next)
);

/** GET /api/v1/vm-host-leases */
router.get('/', validateRequest(listVmHostLeasesQuerySchema), (req, res, next) =>
  vmHostLeaseController.list(req, res, next)
);

/** POST /api/v1/vm-host-leases */
router.post('/', validateRequest(createVmHostLeaseSchema), (req, res, next) =>
  vmHostLeaseController.create(req, res, next)
);

/** GET /api/v1/vm-host-leases/:id */
router.get('/:id', validateRequest(vmHostLeaseIdParamSchema), (req, res, next) =>
  vmHostLeaseController.getOne(req, res, next)
);

/** PATCH /api/v1/vm-host-leases/:id */
router.patch('/:id', validateRequest(updateVmHostLeaseSchema), (req, res, next) =>
  vmHostLeaseController.update(req, res, next)
);

/** DELETE /api/v1/vm-host-leases/:id */
router.delete('/:id', validateRequest(vmHostLeaseIdParamSchema), (req, res, next) =>
  vmHostLeaseController.remove(req, res, next)
);

export default router;
