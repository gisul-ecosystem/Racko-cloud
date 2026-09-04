import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import type { AuthenticatedRequest } from '../../types';
import { vmCatalogService, type CatalogVmPowerAction } from './vmCatalog.service';
import type {
  CreateCatalogVmRequestInput,
  RegisterManualAzureCatalogVmInput,
  AttachManualAzureCatalogVmInput,
  ListSuperAdminAzurePlacementOptionsInput,
  ValidateSuperAdminAzureProvisionQuoteInput,
  CreateSuperAdminAzureCatalogVmInput,
} from './vmCatalog.validation';
import type {
  CalculateVmPricingInput,
  ListVmPricingQuery,
} from './vmCatalog.validation';
import type { VmCatalogStatus } from '../../models/catalogVm.model';
import {
  selectProvider,
  listPricing as listResellerPricing,
} from './resellerClient';
import {
  getUsdToInrRate,
  periodFromHourlyUsd,
  usdToInrPeriod,
  convertUsdAmount,
} from '../../utils/usdToInr';

function success<T>(res: Response, message: string, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

async function overview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const data = await vmCatalogService.getOverview(adminId);
    success(res, 'VM catalog overview retrieved.', data);
  } catch (err) {
    next(err);
  }
}

async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const vms = await vmCatalogService.listForAdmin(adminId);
    success(res, 'VM catalog instances retrieved.', { vms, total: vms.length });
  } catch (err) {
    next(err);
  }
}

async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const vm = await vmCatalogService.getForAdmin(id, adminId);
    success(res, 'Catalog VM retrieved.', { vm });
  } catch (err) {
    next(err);
  }
}

async function openConsole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const adminId = new mongoose.Types.ObjectId(authReq.user.userId);

    const rawWidth = req.query['width'] as string | undefined;
    const rawHeight = req.query['height'] as string | undefined;
    const width = rawWidth ? parseInt(rawWidth, 10) : undefined;
    const height = rawHeight ? parseInt(rawHeight, 10) : undefined;
    const dimensions = {
      width: width && Number.isFinite(width) && width > 0 ? width : undefined,
      height: height && Number.isFinite(height) && height > 0 ? height : undefined,
    };
    const instanceIdRaw = req.query['instanceId'];
    const instanceId =
      typeof instanceIdRaw === 'string' && instanceIdRaw.trim().length > 0
        ? instanceIdRaw.trim()
        : undefined;

    const session = await vmCatalogService.openConsole(
      id,
      adminId,
      dimensions,
      instanceId
    );
    success(res, 'Catalog VM console session created.', session);
  } catch (err) {
    next(err);
  }
}

async function createRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const body = req.body as CreateCatalogVmRequestInput;
    const request = await vmCatalogService.createRequest(body, adminId);
      success(res, 'Catalog VM purchase submitted. Wallet charged; VM is provisioning.', { request }, 201);
  } catch (err) {
    next(err);
  }
}

async function createSuperAdminRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const superAdminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const body = req.body as CreateCatalogVmRequestInput;
    const request = await vmCatalogService.createRequestForSuperAdmin(body, superAdminId);
    success(res, 'Catalog VM request submitted. No wallet deduction applied.', { request }, 201);
  } catch (err) {
    next(err);
  }
}

async function registerManualAzureCatalogVm(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const superAdminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const body = req.body as RegisterManualAzureCatalogVmInput;
    const request = await vmCatalogService.registerManualAzureCatalogVm(body, superAdminId);
    success(res, 'Manual Azure VM registered.', { request }, 201);
  } catch (err) {
    next(err);
  }
}

async function listReadyManualAzureCatalogVms(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const vms = await vmCatalogService.listReadyManualAzureCatalogVms();
    success(res, 'Ready manual Azure VMs retrieved.', { vms, total: vms.length });
  } catch (err) {
    next(err);
  }
}

async function listSuperAdminAzureCatalogVms(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const vms = await vmCatalogService.listSuperAdminAzureCatalogVms();
    success(res, 'Azure catalog VMs retrieved.', { vms, total: vms.length });
  } catch (err) {
    next(err);
  }
}

async function powerSuperAdminAzureCatalogVm(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const body = req.body as { action: CatalogVmPowerAction; instanceId?: string };
    const result = await vmCatalogService.powerAction(id, body.action, body.instanceId);
    success(res, powerActionSuccessMessage(body.action), result);
  } catch (err) {
    next(err);
  }
}

async function attachManualAzureCatalogVm(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const reviewerId = new mongoose.Types.ObjectId(authReq.user.userId);
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const body = req.body as AttachManualAzureCatalogVmInput;
    const request = await vmCatalogService.attachManualAzureCatalogVm(id, reviewerId, body);
    success(res, 'Manual Azure VM attached to customer.', { request });
  } catch (err) {
    next(err);
  }
}

async function getAzureProvisionReady(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const status = await vmCatalogService.getAzureProvisionReadyStatus();
    success(res, 'Azure provision readiness retrieved.', status);
  } catch (err) {
    next(err);
  }
}

async function listSuperAdminAzureLocations(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = _req as AuthenticatedRequest;
    const superAdminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const rows = await vmCatalogService.listSuperAdminAzureLocations(superAdminId);
    success(res, 'Azure subscription locations retrieved.', { rows, total: rows.length });
  } catch (err) {
    next(err);
  }
}

async function searchSuperAdminAzureMarketplaceImages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const superAdminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const osTypeRaw = typeof req.query.osType === 'string' ? req.query.osType : undefined;
    const osTypeNormalized = osTypeRaw?.toLowerCase();
    const osType =
      osTypeNormalized === 'linux' || osTypeNormalized === 'windows' || osTypeNormalized === 'all'
        ? (osTypeNormalized as 'linux' | 'windows' | 'all')
        : ('all' as const);
    const skip = req.query.skip ? Number(req.query.skip) : 0;
    const take = req.query.take ? Number(req.query.take) : req.query.limit ? Number(req.query.limit) : 24;
    const result = await vmCatalogService.searchSuperAdminAzureMarketplaceImages(superAdminId, {
      query,
      osType,
      skip,
      take,
    });
    success(res, 'Azure marketplace images retrieved.', result);
  } catch (err) {
    next(err);
  }
}

async function listSuperAdminAzureImageSkuPlans(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const superAdminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const region = typeof req.query.region === 'string' ? req.query.region.trim() : '';
    const publisher = typeof req.query.publisher === 'string' ? req.query.publisher.trim() : '';
    const offer = typeof req.query.offer === 'string' ? req.query.offer.trim() : '';
    if (!region || !publisher || !offer) {
      res.status(400).json({
        success: false,
        message: 'region, publisher, and offer query parameters are required.',
      });
      return;
    }
    const productDisplayName =
      typeof req.query.productDisplayName === 'string'
        ? req.query.productDisplayName
        : typeof req.query.displayName === 'string'
          ? req.query.displayName
          : undefined;
    const rows = await vmCatalogService.listSuperAdminAzureImageSkuPlans(superAdminId, {
      region,
      publisher,
      offer,
      productDisplayName,
    });
    success(res, 'Azure image SKU plans retrieved.', { rows, total: rows.length });
  } catch (err) {
    next(err);
  }
}

async function validateSuperAdminAzureVmImage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const superAdminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const result = await vmCatalogService.validateSuperAdminAzureVmImage(superAdminId, req.body);
    success(res, 'Azure VM image validated.', result);
  } catch (err) {
    next(err);
  }
}

async function listSuperAdminAzureCustomImages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const superAdminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const resourceGroup =
      typeof req.query.resourceGroup === 'string' ? req.query.resourceGroup : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const rows = await vmCatalogService.listSuperAdminAzureCustomImages(
      superAdminId,
      query,
      limit,
      resourceGroup
    );
    success(res, 'Azure custom templates retrieved.', { rows, total: rows.length });
  } catch (err) {
    next(err);
  }
}

async function validateSuperAdminAzureCustomImage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const superAdminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const result = await vmCatalogService.validateSuperAdminAzureCustomImage(
      superAdminId,
      req.body
    );
    success(res, 'Azure custom template validated.', result);
  } catch (err) {
    next(err);
  }
}

async function listSuperAdminAzurePlacementOptions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const superAdminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const body = req.body as ListSuperAdminAzurePlacementOptionsInput;
    const result = await vmCatalogService.listSuperAdminAzurePlacementOptions(body, superAdminId);
    success(res, 'Azure placement options retrieved.', result);
  } catch (err) {
    next(err);
  }
}

async function validateSuperAdminAzureProvisionQuote(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const superAdminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const body = req.body as ValidateSuperAdminAzureProvisionQuoteInput;
    const result = await vmCatalogService.validateSuperAdminAzureProvisionQuote(body, superAdminId);
    success(res, result.valid ? 'Azure provision quote is ready.' : 'Azure provision quote failed.', result);
  } catch (err) {
    next(err);
  }
}

async function createSuperAdminAzureCatalogVm(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const superAdminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const body = req.body as CreateSuperAdminAzureCatalogVmInput;
    const request = await vmCatalogService.createSuperAdminAzureCatalogVm(body, superAdminId);
    success(res, 'Azure VM provisioning started.', { request }, 201);
  } catch (err) {
    next(err);
  }
}

async function listRequesters(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requesters = await vmCatalogService.listRequesterGroups();
    success(res, 'Catalog VM requesters retrieved.', { requesters, total: requesters.length });
  } catch (err) {
    next(err);
  }
}

async function listRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
      const status =
      (req.query['status'] as VmCatalogStatus | 'all' | undefined) ?? 'provisioning';
    const adminIdRaw = req.query['adminId'] as string | undefined;
    const requests = await vmCatalogService.listRequestsForSuperAdmin({
      status,
      adminId: adminIdRaw ? new mongoose.Types.ObjectId(adminIdRaw) : undefined,
    });
    success(res, 'Catalog VM requests retrieved.', { requests, total: requests.length });
  } catch (err) {
    next(err);
  }
}

async function approve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const reviewerId = new mongoose.Types.ObjectId(authReq.user.userId);
    const request = await vmCatalogService.approveRequest(id, reviewerId);
    success(
      res,
      'Fulfillment started. Provider details will appear when Playwright finishes.',
      { request }
    );
  } catch (err) {
    next(err);
  }
}

async function attach(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const reviewerId = new mongoose.Types.ObjectId(authReq.user.userId);
    const request = await vmCatalogService.attachRequest(id, reviewerId);
    success(res, 'VM attached and visible to the requesting admin.', { request });
  } catch (err) {
    next(err);
  }
}

async function retryPostReady(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const reviewerId = new mongoose.Types.ObjectId(authReq.user.userId);
    const request = await vmCatalogService.retryPostReadySetup(id, reviewerId);
    success(res, 'Post-ready install retried. Agent push and software installation resumed.', {
      request,
    });
  } catch (err) {
    next(err);
  }
}

async function fetchDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const reviewerId = new mongoose.Types.ObjectId(authReq.user.userId);
    const request = await vmCatalogService.fetchRequestDetails(id, reviewerId);
    success(
      res,
      'Fetching provider details from Webyne /admin/server (no new purchase).',
      { request }
    );
  } catch (err) {
    next(err);
  }
}

async function reject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const reviewerId = new mongoose.Types.ObjectId(authReq.user.userId);
    const { reason } = req.body as { reason: string };
    const request = await vmCatalogService.rejectRequest(id, reviewerId, reason);
    success(res, 'Catalog VM request rejected.', { request });
  } catch (err) {
    next(err);
  }
}

async function changeTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const reviewerId = new mongoose.Types.ObjectId(authReq.user.userId);
    const body = (req.body || {}) as { template?: string };
    const request = await vmCatalogService.changeTemplateToWindows(id, reviewerId, {
      ...(body.template ? { template: body.template } : {}),
    });
    success(res, 'OS template changed to Windows on Webyne. Ready to attach.', { request });
  } catch (err) {
    next(err);
  }
}

async function powerAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const body = (req.body || {}) as {
      action: 'virtualizor' | 'start' | 'stop' | 'reboot' | 'terminate';
      instanceId?: string;
    };
    const result = await vmCatalogService.powerAction(id, body.action, body.instanceId);
    success(res, powerActionSuccessMessage(body.action), result);
  } catch (err) {
    next(err);
  }
}

async function powerOwnedVm(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const adminId = new mongoose.Types.ObjectId(authReq.user.userId);
    const id = new mongoose.Types.ObjectId(req.params['id'] as string);
    const body = (req.body || {}) as {
      action: 'virtualizor' | 'start' | 'stop' | 'reboot' | 'terminate';
      instanceId?: string;
    };
    const result = await vmCatalogService.powerActionForAdmin(
      id,
      adminId,
      body.action,
      body.instanceId
    );
    success(res, powerActionSuccessMessage(body.action), result);
  } catch (err) {
    next(err);
  }
}

function powerActionSuccessMessage(
  action: 'virtualizor' | 'start' | 'stop' | 'reboot' | 'terminate'
): string {
  switch (action) {
    case 'virtualizor':
      return 'Virtualization control opened.';
    case 'start':
      return 'VM start requested.';
    case 'stop':
      return 'VM stop requested.';
    case 'reboot':
      return 'VM restart requested.';
    case 'terminate':
      return 'VM terminated.';
    default:
      return 'Power action completed.';
  }
}

async function calculatePricing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as CalculateVmPricingInput;
    const providers = body.providers ?? body.provider;
    const mode = body.mode ?? 'vm';
    const data = await selectProvider({
      category: body.category,
      mode,
      durationDays: body.durationDays,
      specs: body.specs
        ? {
            cpu: body.specs.cpu != null ? String(body.specs.cpu) : undefined,
            ram: body.specs.ram != null ? String(body.specs.ram) : undefined,
            disk: body.specs.disk != null ? String(body.specs.disk) : undefined,
            diskType: body.specs.diskType,
          }
        : undefined,
      canonicalSpec: body.canonicalSpec,
      nestedVirtualization: body.nestedVirtualization === true,
      ...(providers !== undefined ? { providers } : {}),
    });

    const fx = await getUsdToInrRate();
    const usd = periodFromHourlyUsd(data.rawTotalPricePerHr);
    const inr = usdToInrPeriod(usd, fx.usdToInr);

    success(res, mode === 'storage_only' ? 'Storage pricing calculated.' : 'VM pricing calculated.', {
      ...data,
      mode: data.mode ?? mode,
      currency: data.currency || 'USD',
      usdToInr: fx.usdToInr,
      fxSource: fx.source,
      pricingUsd: usd,
      pricingInr: inr,
      rawComputePricePerHrInr: convertUsdAmount(data.rawComputePricePerHr, fx.usdToInr),
      rawStoragePricePerHrInr: convertUsdAmount(data.rawStoragePricePerHr, fx.usdToInr),
      rawIpPricePerHrInr: convertUsdAmount(data.rawIpPricePerHr, fx.usdToInr),
      rawPublicIpPricePerHrInr: convertUsdAmount(data.rawPublicIpPricePerHr, fx.usdToInr),
      rawPrivateIpPricePerHrInr: convertUsdAmount(data.rawPrivateIpPricePerHr, fx.usdToInr),
      rawTotalPricePerHrInr: convertUsdAmount(data.rawTotalPricePerHr, fx.usdToInr),
      rawTotalWithPublicIpPerHrInr: convertUsdAmount(
        data.rawTotalWithPublicIpPerHr ?? data.rawTotalPricePerHr,
        fx.usdToInr
      ),
      rawTotalWithPrivateIpPerHrInr: convertUsdAmount(
        data.rawTotalWithPrivateIpPerHr,
        fx.usdToInr
      ),
    });
  } catch (err) {
    next(err);
  }
}

async function listPricing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as ListVmPricingQuery;
    const data = await listResellerPricing({
      providers: query.providers,
      provider: query.provider,
      category: query.category,
      canonicalSpec: query.canonicalSpec,
      limit: query.limit,
      nestedVirtualization: query.nestedVirtualization,
    });

    const fx = await getUsdToInrRate();
    const rows = (data.rows || []).map((row) => {
      const usd = periodFromHourlyUsd(row.rawTotalPricePerHr);
      const inr = usdToInrPeriod(usd, fx.usdToInr);
      return {
        ...row,
        currency: row.currency || 'USD',
        pricingUsd: usd,
        pricingInr: inr,
        rawTotalPricePerHrInr: convertUsdAmount(row.rawTotalPricePerHr, fx.usdToInr),
        rawComputePricePerHrInr: convertUsdAmount(row.rawComputePricePerHr, fx.usdToInr),
        rawStoragePricePerHrInr: convertUsdAmount(row.rawStoragePricePerHr, fx.usdToInr),
        rawIpPricePerHrInr: convertUsdAmount(row.rawIpPricePerHr, fx.usdToInr),
      };
    });

    success(res, 'VM pricing rows retrieved.', {
      ...data,
      rows,
      usdToInr: fx.usdToInr,
      fxSource: fx.source,
    });
  } catch (err) {
    next(err);
  }
}

async function listSoftwareOptions(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const catalog = await vmCatalogService.listSoftwareOptions();
    success(res, 'Software options retrieved.', { catalog, total: catalog.length });
  } catch (err) {
    next(err);
  }
}

export const vmCatalogController = {
  overview,
  list,
  getOne,
  openConsole,
  createRequest,
  listRequesters,
  listRequests,
  approve,
  fetchDetails,
  attach,
  retryPostReady,
  changeTemplate,
  powerAction,
  powerOwnedVm,
  reject,
  calculatePricing,
  listPricing,
  listSoftwareOptions,
  createSuperAdminRequest,
  registerManualAzureCatalogVm,
  listReadyManualAzureCatalogVms,
  listSuperAdminAzureCatalogVms,
  powerSuperAdminAzureCatalogVm,
  attachManualAzureCatalogVm,
  getAzureProvisionReady,
  listSuperAdminAzureLocations,
  searchSuperAdminAzureMarketplaceImages,
  listSuperAdminAzureImageSkuPlans,
  validateSuperAdminAzureVmImage,
  listSuperAdminAzureCustomImages,
  validateSuperAdminAzureCustomImage,
  listSuperAdminAzurePlacementOptions,
  validateSuperAdminAzureProvisionQuote,
  createSuperAdminAzureCatalogVm,
};
