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
 * the admin already owns. We store the console password AES-256-CBC encrypted and
 * decrypt it on demand to mint a browser Guacamole session.
 */
class ExternalVMService {
  /** Map a DB document to the API response shape, decrypting the password. */
  private toResponse(doc: IExternalVM): ExternalVMResponse {
    return {
      _id: doc._id.toString(),
      name: doc.name,
      ipAddress: doc.ipAddress,
      protocol: doc.protocol,
      username: doc.username,
      password: decrypt(doc.password),
      adminId: doc.adminId.toString(),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  /** Add a single external VM. Encrypts the password before persisting. */
  async addExternalVM(
    dto: CreateExternalVMDto,
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse> {
    const doc = await ExternalVMModel.create({
      name: dto.name,
      ipAddress: dto.ipAddress,
      protocol: dto.protocol,
      username: dto.username, // pre-validate hook fills protocol default when empty
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

  /** Bulk add external VMs. Each password is encrypted independently. */
  async bulkAddExternalVMs(
    dtos: CreateExternalVMDto[],
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse[]> {
    const created: ExternalVMResponse[] = [];
    for (const dto of dtos) {
      // Sequential create() so each doc runs its pre-validate/pre-save hooks.
      const vm = await this.addExternalVM(dto, adminId);
      created.push(vm);
    }
    return created;
  }

  /** List all external VMs for an admin. Passwords are returned DECRYPTED. */
  async listExternalVMs(adminId: mongoose.Types.ObjectId): Promise<ExternalVMResponse[]> {
    const docs = await ExternalVMModel.find({ adminId }).sort({ createdAt: -1 });
    return docs.map((doc) => this.toResponse(doc));
  }

  /** Get a single external VM (ownership enforced). Password DECRYPTED. */
  async getExternalVM(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMResponse> {
    const doc = await this.findOwned(id, adminId);
    return this.toResponse(doc);
  }

  /** Delete an external VM after an ownership check. */
  async deleteExternalVM(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<void> {
    const doc = await this.findOwned(id, adminId);
    await doc.deleteOne();

    logger.info('[ExternalVM] Deleted external VM', {
      externalVmId: id.toString(),
      adminId: adminId.toString(),
    });
  }

  /**
   * Mint a Guacamole console session for an external VM.
   * Decrypts the stored password and upserts a connection named
   * `externalvm-<id>` so repeat calls reuse the same connection.
   */
  async getConsoleSession(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<ExternalVMConsoleSession> {
    const doc = await this.findOwned(id, adminId);

    const password = decrypt(doc.password);
    const port = doc.protocol === 'rdp' ? 3389 : 22;

    logger.info('[ExternalVM] Opening Guacamole session', {
      externalVmId: id.toString(),
      adminId: adminId.toString(),
      protocol: doc.protocol,
      hostname: doc.ipAddress,
    });

    const session = await guacamoleClient.openConsole(`externalvm-${id.toString()}`, doc.protocol, {
      hostname: doc.ipAddress,
      port,
      username: doc.username,
      password,
      ignoreCert: true,
      securityMode: 'any',
    });

    return {
      protocol: doc.protocol,
      clientUrl: session.clientUrl,
      connectionId: session.connectionId,
    };
  }

  /** Find a VM by id and assert the requesting admin owns it. */
  private async findOwned(
    id: mongoose.Types.ObjectId,
    adminId: mongoose.Types.ObjectId
  ): Promise<IExternalVM> {
    const doc = await ExternalVMModel.findById(id);
    if (!doc) throw new NotFoundError('External VM not found.');
    if (doc.adminId.toString() !== adminId.toString()) {
      throw new ForbiddenError('You do not have permission to access this external VM.');
    }
    return doc;
  }
}

export const externalVMService = new ExternalVMService();
