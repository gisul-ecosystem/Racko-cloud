import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  ApiCredentialModel,
  type IApiCredential,
} from '../../models/apiCredential.model';
import { hashPassword } from '../../utils/argon2';
import { ConflictError, NotFoundError } from '../../utils/errors';
import type { ApiCredentialActor } from './requireApiCredentialActor.middleware';
import { resolveApiCredentialScopes } from './apiCredentialScopes';
import { apiCredentialUsageService } from '../publicApi/apiCredentialUsage.service';

function generateClientId(): string {
  return `rk_live_${crypto.randomBytes(16).toString('base64url')}`;
}

function generateClientSecret(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function ownerFilter(actor: ApiCredentialActor): Record<string, unknown> {
  if (actor.ownerType === 'tenant') {
    return { ownerType: 'tenant', tenantId: actor.tenantId };
  }
  return { ownerType: 'platform', adminId: actor.adminId };
}

export interface ApiCredentialListItem {
  id: string;
  clientId: string;
  name: string;
  ownerType: IApiCredential['ownerType'];
  tenantId: string | null;
  adminId: string | null;
  scopes: string[];
  rateLimitPerMin: number | null;
  status: IApiCredential['status'];
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateApiCredentialResult {
  credential: ApiCredentialListItem;
  clientSecret: string;
}

function toListItem(doc: IApiCredential): ApiCredentialListItem {
  return {
    id: doc._id.toString(),
    clientId: doc.clientId,
    name: doc.name,
    ownerType: doc.ownerType,
    tenantId: doc.tenantId?.toString() ?? null,
    adminId: doc.adminId?.toString() ?? null,
    scopes: doc.scopes,
    rateLimitPerMin: doc.rateLimitPerMin ?? null,
    status: doc.status,
    lastUsedAt: doc.lastUsedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}

export interface CreateApiCredentialInput {
  name: string;
  scopes?: string[];
  rateLimitPerMin?: number | null;
}

export class ApiCredentialsService {
  async create(
    actor: ApiCredentialActor,
    input: CreateApiCredentialInput
  ): Promise<CreateApiCredentialResult> {
    const scopes = resolveApiCredentialScopes(input.scopes);
    const clientSecret = generateClientSecret();
    const clientSecretHash = await hashPassword(clientSecret);

    for (let attempt = 0; attempt < 5; attempt++) {
      const clientId = generateClientId();
      try {
        const doc = await ApiCredentialModel.create({
          clientId,
          clientSecretHash,
          name: input.name,
          ownerType: actor.ownerType,
          tenantId: actor.ownerType === 'tenant' ? actor.tenantId : null,
          adminId: actor.ownerType === 'platform' ? actor.adminId : null,
          scopes,
          rateLimitPerMin: input.rateLimitPerMin ?? null,
          status: 'active',
          createdBy: actor.createdBy,
        });

        return {
          credential: toListItem(doc),
          clientSecret,
        };
      } catch (err) {
        if (
          err instanceof Error &&
          'code' in err &&
          (err as { code?: number }).code === 11000
        ) {
          continue;
        }
        throw err;
      }
    }

    throw new ConflictError('Could not allocate a unique client ID. Please retry.');
  }

  async list(actor: ApiCredentialActor): Promise<ApiCredentialListItem[]> {
    const docs = await ApiCredentialModel.find(ownerFilter(actor))
      .sort({ createdAt: -1 })
      .lean(false);
    return docs.map((d) => toListItem(d));
  }

  async revoke(actor: ApiCredentialActor, id: mongoose.Types.ObjectId): Promise<ApiCredentialListItem> {
    const doc = await ApiCredentialModel.findOne({
      _id: id,
      ...ownerFilter(actor),
    });

    if (!doc) {
      throw new NotFoundError('API credential not found.');
    }

    if (doc.status === 'revoked') {
      return toListItem(doc);
    }

    await ApiCredentialModel.updateOne(
      { _id: doc._id, ...ownerFilter(actor) },
      { $set: { status: 'revoked' } }
    );
    doc.status = 'revoked';
    return toListItem(doc);
  }

  async getUsage(actor: ApiCredentialActor, id: mongoose.Types.ObjectId) {
    const doc = await ApiCredentialModel.findOne({
      _id: id,
      ...ownerFilter(actor),
    })
      .select('_id')
      .lean();

    if (!doc) {
      throw new NotFoundError('API credential not found.');
    }

    const summary = await apiCredentialUsageService.getUsageSummary(id);
    if (!summary) {
      throw new NotFoundError('API credential not found.');
    }

    return summary;
  }
}

export const apiCredentialsService = new ApiCredentialsService();
