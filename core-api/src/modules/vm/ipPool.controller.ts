import type { Request, Response, NextFunction } from 'express';
import { IpAddress } from './ipAddress.model';
import { releaseIP } from './ipAllocator.service';
import { logger } from '../../utils/logger';
import { VM } from './vm.model';

function success<T>(res: Response, message: string, data?: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, ...(data !== undefined && { data }) });
}

/** Parse a CIDR string like "103.99.38.0/24" into an array of host IP strings. */
function parseCidr(cidr: string): string[] {
  const [networkStr, prefixStr] = cidr.split('/');
  if (!networkStr || !prefixStr) throw new Error('Invalid CIDR format. Expected x.x.x.x/prefix.');

  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 1 || prefix > 32) throw new Error('Invalid prefix length.');

  const parts = networkStr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error('Invalid IP address in CIDR.');
  }

  const networkInt =
    ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;

  const totalHosts = Math.pow(2, 32 - prefix);
  const firstHost = (networkInt + 1) >>> 0;
  const lastHost = (networkInt + totalHosts - 2) >>> 0;

  const ips: string[] = [];
  for (let i = firstHost; i <= lastHost; i++) {
    ips.push([
      (i >>> 24) & 0xff,
      (i >>> 16) & 0xff,
      (i >>> 8) & 0xff,
      i & 0xff,
    ].join('.'));
  }
  return ips;
}

export class IpPoolController {
  /**
   * POST /api/v1/ip-pool/subnet
   * Body: { cidr: "103.99.38.0/24", excludedIps?: ["103.99.38.1", "103.99.38.169"] }
   */
  async addSubnet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cidr, gateway, excludedIps = [] } = req.body as {
        cidr: string;
        gateway: string;
        excludedIps?: string[];
      };

      if (!cidr) {
        res.status(400).json({ success: false, message: 'cidr is required.' });
        return;
      }
      if (!gateway) {
        res.status(400).json({ success: false, message: 'gateway is required.' });
        return;
      }

      const excludedSet = new Set<string>(excludedIps);
      let allIps: string[];
      try {
        allIps = parseCidr(cidr);
      } catch (err) {
        res.status(400).json({
          success: false,
          message: err instanceof Error ? err.message : 'Invalid CIDR.',
        });
        return;
      }

      const ips = allIps.filter((ip) => !excludedSet.has(ip));

      const ops = ips.map((ip) => ({
        updateOne: {
          filter: { ip },
          update: { $setOnInsert: { ip, gateway, status: 'available' as const } },
          upsert: true,
        },
      }));

      const result = await IpAddress.bulkWrite(ops, { ordered: false });

      logger.info('[IPPool] Subnet added', {
        cidr,
        gateway,
        total: allIps.length,
        excluded: excludedIps.length,
        inserted: result.upsertedCount,
        alreadyExisted: result.matchedCount,
      });

      success(res, 'Subnet IPs added to pool.', {
        cidr,
        gateway,
        totalGenerated: allIps.length,
        excluded: excludedIps.length,
        inserted: result.upsertedCount,
        alreadyExisted: result.matchedCount,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/ip-pool/stats
   */
  async getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [total, available, assigned, reserved] = await Promise.all([
        IpAddress.countDocuments(),
        IpAddress.countDocuments({ status: 'available' }),
        IpAddress.countDocuments({ status: 'assigned' }),
        IpAddress.countDocuments({ status: 'reserved' }),
      ]);

      success(res, 'IP pool stats retrieved.', { total, available, assigned, reserved });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/ip-pool/list?page=1&limit=50&status=assigned
   */
  async listIPs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt((req.query['page'] as string) ?? '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt((req.query['limit'] as string) ?? '50', 10)));
      const statusFilter = req.query['status'] as string | undefined;
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {};
      if (statusFilter && ['available', 'assigned', 'reserved'].includes(statusFilter)) {
        filter['status'] = statusFilter;
      }

      const [records, total] = await Promise.all([
        IpAddress.find(filter).sort({ ip: 1 }).skip(skip).limit(limit).lean(),
        IpAddress.countDocuments(filter),
      ]);

      // Enrich assigned/reserved records with VM name — only for valid MongoDB ObjectIds
      const vmIds = records
        .filter((r) => r.vmId && /^[a-f\d]{24}$/i.test(r.vmId))
        .map((r) => r.vmId as string);

      const vmNameMap = new Map<string, string>();
      if (vmIds.length > 0) {
        const vms = await VM.find(
          { _id: { $in: vmIds } },
          { _id: 1, name: 1 }
        ).lean();
        for (const vm of vms) {
          vmNameMap.set(vm._id.toString(), vm.name);
        }
      }

      const enriched = records.map((r) => ({
        ...r,
        vmName: r.vmId ? (vmNameMap.get(r.vmId) ?? null) : null,
      }));

      success(res, 'IP list retrieved.', {
        ips: enriched,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/ip-pool/:ip/release
   * Manual override — force-release a stuck reserved or assigned IP.
   */
  async releaseIP(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = req.params['ip'] as string;
      const record = await IpAddress.findOne({ ip });

      if (!record) {
        res.status(404).json({ success: false, message: `IP ${ip} not found in pool.` });
        return;
      }

      if (record.status === 'available') {
        success(res, 'IP is already available.', { ip });
        return;
      }

      const vmId = record.vmId;

      // Use releaseIP by vmId if we have one, otherwise do a direct update
      if (vmId) {
        await releaseIP(vmId);
      } else {
        await IpAddress.findOneAndUpdate(
          { ip },
          {
            $set: { status: 'available' },
            $unset: { vmId: 1, reservedAt: 1, assignedAt: 1 },
          }
        );
      }

      logger.info('[IPPool] Manual IP release', { ip, previousVmId: vmId ?? null });
      success(res, `IP ${ip} released successfully.`, { ip });
    } catch (error) {
      next(error);
    }
  }
}

export const ipPoolController = new IpPoolController();
