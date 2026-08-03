import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import type { AuthenticatedRequest } from '../../types';
import { vmCatalogService } from './vmCatalog.service';
import type { CreateCatalogVmRequestInput } from './vmCatalog.validation';
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

    const session = await vmCatalogService.openConsole(id, adminId, dimensions);
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
    const body = (req.body || {}) as { action: 'virtualizor' | 'start' | 'stop' | 'reboot' };
    const result = await vmCatalogService.powerAction(id, body.action);
    success(res, `Webyne ${body.action} completed.`, result);
  } catch (err) {
    next(err);
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
  changeTemplate,
  powerAction,
  reject,
  calculatePricing,
  listPricing,
};
