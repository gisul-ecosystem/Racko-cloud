import mongoose from 'mongoose';
import { ExternalVMModel, type IExternalVM } from './external-vm.model';
import type {
  CreateExternalVMDto,
  ExternalVMConsoleSession,
  ExternalVMResponse,
} from './external-vm.types';
import { encrypt, decrypt } from '../../utils/crypto';
import { guacamoleClient } from '../../utils/guacamoleClient';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { logger } from '../../utils/logger';

/**
 * External VM (a.k.a. "Elastic Server") service.
 *
 * Unlike platform-provisioned VPS instances, external VMs are arbitrary servers
 * the owner already runs. We store the console password AES-256-CBC encrypted and
 * decrypt it on demand to mint a browser Guacamole session.
 *
 * Ownership is either platform `adminId` or workspace `tenantId` — never both.
 */
class ExternalVMService {
  private toResponse(doc: IExternalVM): ExternalVMResponse {
    return {
      _id: doc._id.toString(),
      name: doc.name,
      ipAddress: doc.ipAddress,
      protocol: doc.protocol,
      username: doc.username,
      password: decrypt(doc.password),
      ...(doc.adminId ? { adminId: doc.adminId.toString() } : {}),
      ...(doc.tenantId ? { tenantId: doc.tenantId.toString() } : {}),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  async addExternalVM(
    dto: CreateExternalVMDto,
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse> {
    const doc = await ExternalVMModel.create({
      name: dto.name,
      ipAddress: dto.ipAddress,
      protocol: dto.protocol,
      username: dto.username,
      password: encrypt(dto.password),
      adminId,
    });

    logger.info('[ExternalVM] Added external VM', {
      externalVmId: doc._id.toString(),
      adminId: adminId.toString(),
      protocol: doc.protocol,
    });

    return this.toResponse(doc);
  }

  async bulkAddExternalVMs(
    dtos: CreateExternalVMDto[],
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse[]> {
    const created: ExternalVMResponse[] = [];
    for (const dto of dtos) {
      const vm = await this.addExternalVM(dto, adminId);
      created.push(vm);
    }
    return created;
  }

  async listExternalVMs(adminId: mongoose.Types.ObjectId): Promise<ExternalVMResponse[]> {
    const docs = await ExternalVMModel.find({ adminId }).sort({ createdAt: -1 });
    return docs.map((doc) => this.toResponse(doc));
  }

  async getExternalVM(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse> {
    const doc = await this.findOwnedByAdmin(id, adminId);
    return this.toResponse(doc);
  }

  async deleteExternalVM(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<void> {
    const doc = await this.findOwnedByAdmin(id, adminId);
    await doc.deleteOne();

    logger.info('[ExternalVM] Deleted external VM', {
      externalVmId: id.toString(),
      adminId: adminId.toString(),
    });
  }

  async getConsoleSession(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMConsoleSession> {
    const doc = await this.findOwnedByAdmin(id, adminId);
    return this.openGuacamole(doc, { adminId: adminId.toString() });
  }

  // ─── Tenant-scoped operations ───────────────────────────────────────────────

  async addTenantExternalVM(
    dto: CreateExternalVMDto,
    tenantId: mongoose.Types.ObjectId,
    createdByTenantUserId?: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse> {
    const doc = await ExternalVMModel.create({
      name: dto.name,
      ipAddress: dto.ipAddress,
      protocol: dto.protocol,
      username: dto.username,
      password: encrypt(dto.password),
      tenantId,
      ...(createdByTenantUserId ? { createdByTenantUserId } : {}),
    });

    logger.info('[ExternalVM] Added tenant external VM', {
      externalVmId: doc._id.toString(),
      tenantId: tenantId.toString(),
      protocol: doc.protocol,
    });

    return this.toResponse(doc);
  }

  async bulkAddTenantExternalVMs(
    dtos: CreateExternalVMDto[],
    tenantId: mongoose.Types.ObjectId,
    createdByTenantUserId?: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse[]> {
    const created: ExternalVMResponse[] = [];
    for (const dto of dtos) {
      created.push(await this.addTenantExternalVM(dto, tenantId, createdByTenantUserId));
    }
    return created;
  }

  async listTenantExternalVMs(tenantId: mongoose.Types.ObjectId): Promise<ExternalVMResponse[]> {
    const docs = await ExternalVMModel.find({ tenantId }).sort({ createdAt: -1 });
    return docs.map((doc) => this.toResponse(doc));
  }

  async getTenantExternalVM(
    id: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse> {
    const doc = await this.findOwnedByTenant(id, tenantId);
    return this.toResponse(doc);
  }

  async deleteTenantExternalVM(
    id: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId
  ): Promise<void> {
    const doc = await this.findOwnedByTenant(id, tenantId);
    await doc.deleteOne();

    logger.info('[ExternalVM] Deleted tenant external VM', {
      externalVmId: id.toString(),
      tenantId: tenantId.toString(),
    });
  }

  async getTenantConsoleSession(
    id: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId
  ): Promise<ExternalVMConsoleSession> {
    const doc = await this.findOwnedByTenant(id, tenantId);
    return this.openGuacamole(doc, { tenantId: tenantId.toString() });
  }

  private async openGuacamole(
    doc: IExternalVM,
    logContext: Record<string, string>
  ): Promise<ExternalVMConsoleSession> {
    const password = decrypt(doc.password);
    const port = doc.protocol === 'rdp' ? 3389 : 22;

    logger.info('[ExternalVM] Opening Guacamole session', {
      externalVmId: doc._id.toString(),
      protocol: doc.protocol,
      hostname: doc.ipAddress,
      ...logContext,
    });

    const session = await guacamoleClient.openConsole(
      `externalvm-${doc._id.toString()}`,
      doc.protocol,
      {
        hostname: doc.ipAddress,
        port,
        username: doc.username,
        password,
        ignoreCert: true,
        securityMode: 'any',
      }
    );

    return {
      protocol: doc.protocol,
      clientUrl: session.clientUrl,
      connectionId: session.connectionId,
    };
  }

  private async findOwnedByAdmin(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<IExternalVM> {
    const doc = await ExternalVMModel.findById(id);
    if (!doc) throw new NotFoundError('External VM not found.');
    if (!doc.adminId || doc.adminId.toString() !== adminId.toString()) {
      throw new ForbiddenError('You do not have permission to access this external VM.');
    }
    return doc;
  }

  private async findOwnedByTenant(
    id: mongoose.Types.ObjectId,
    tenantId: mongoose.Types.ObjectId
  ): Promise<IExternalVM> {
    const doc = await ExternalVMModel.findById(id);
    if (!doc) throw new NotFoundError('External VM not found.');
    if (!doc.tenantId || doc.tenantId.toString() !== tenantId.toString()) {
      throw new ForbiddenError('You do not have permission to access this external VM.');
    }
    return doc;
  }
}

export const externalVMService = new ExternalVMService();
