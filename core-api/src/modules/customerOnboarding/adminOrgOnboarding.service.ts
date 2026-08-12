import mongoose from 'mongoose';
import { User } from '../../models/user.model';
import { OrganizationAccessRequestModel } from '../../models/organizationAccessRequest.model';
import { AdminWallet } from '../../models/adminWallet.model';
import { AdminWalletTransaction } from '../../models/adminWalletTransaction.model';
import { AdminServiceConfig } from '../../models/adminServiceConfig.model';
import { ProjectModel } from '../../models/project.model';
import { OrgRbacRoleModel } from '../../models/orgRbacRole.model';
import { OrgRbacAssignmentModel } from '../../models/orgRbacAssignment.model';
import { Token } from '../../models/token.model';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';
import { sendOrgAdminInviteEmail } from '../../utils/email/sender';
import { generateInvitePassword } from '../../utils/generateInvitePassword';
import { logger } from '../../utils/logger';
import { adminServicesService } from '../adminServices/adminServices.service';
import { adminBillingService } from '../adminBilling/adminBilling.service';
import { AuditLog } from '../../models/auditLog.model';
import { encryptTaxId, serializeOrganizationRequest } from './organizationSensitiveFields';

export type OrgDetailsInput = {
  contactName: string;
  companyName: string;
  companyWebsite?: string;
  phone: string;
  designation: string;
  companySize: string;
  registeredAddress: string;
  taxId: string;
  useCase: string;
  expectedUsage: string;
};

export type AdminCreateOrgInput = {
  email: string;
  sendInvite?: boolean;
  /** When true and no organization payload, mark org_approved so console access is unlocked. */
  skipOrgOnboarding?: boolean;
  organization?: OrgDetailsInput;
};

export type AuditRequestContext = {
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string;
};

export class AdminOrgOnboardingService {
  async createOrganization(
    input: AdminCreateOrgInput,
    actorId: string,
    auditCtx: AuditRequestContext
  ) {
    const email = input.email.toLowerCase().trim();
    const existing = await User.findOne({ email });
    if (existing) {
      throw new ConflictError('Email already in use.');
    }

    const temporaryPassword = generateInvitePassword();
    const hasOrgDetails = Boolean(input.organization);
    const onboardingStatus = hasOrgDetails || input.skipOrgOnboarding
      ? 'org_approved'
      : 'org_details_pending';

    const user = await User.create({
      email,
      password: temporaryPassword,
      role: 'admin',
      accountType: 'b2b',
      onboardingStatus,
      isEmailVerified: true,
      isActive: true,
      mustSetPassword: true,
      createdBy: new mongoose.Types.ObjectId(actorId),
    });

    try {
      await adminServicesService.seedDefaultsForNewAdmin(
        user._id,
        new mongoose.Types.ObjectId(actorId)
      );
    } catch (seedErr) {
      logger.warn('[AdminOrgOnboarding] Failed to seed admin services', {
        userId: user._id.toString(),
        error: seedErr instanceof Error ? seedErr.message : String(seedErr),
      });
    }

    try {
      await adminBillingService.getOrCreateWallet(user._id.toString());
    } catch (walletErr) {
      logger.warn('[AdminOrgOnboarding] Failed to create wallet', {
        userId: user._id.toString(),
        error: walletErr instanceof Error ? walletErr.message : String(walletErr),
      });
    }

    let organizationRequest = null;
    if (input.organization) {
      const org = input.organization;
      organizationRequest = await OrganizationAccessRequestModel.create({
        userId: user._id,
        contactName: org.contactName,
        companyName: org.companyName,
        companyWebsite: org.companyWebsite || undefined,
        phone: org.phone,
        designation: org.designation,
        companySize: org.companySize,
        registeredAddress: org.registeredAddress,
        taxId: encryptTaxId(org.taxId),
        useCase: org.useCase,
        expectedUsage: org.expectedUsage,
        status: 'approved',
        ndaStatus: 'not_started',
        reviewedBy: new mongoose.Types.ObjectId(actorId),
        reviewedAt: new Date(),
        reviewerNotes: 'Created directly by Super Admin (auto-approved).',
      });
    }

    let inviteSent = false;
    if (input.sendInvite !== false) {
      try {
        await sendOrgAdminInviteEmail({
          to: email,
          email,
          temporaryPassword,
          companyName: input.organization?.companyName,
        });
        inviteSent = true;
      } catch (emailErr) {
        logger.warn('[AdminOrgOnboarding] Invite email failed', {
          userId: user._id.toString(),
          error: emailErr instanceof Error ? emailErr.message : String(emailErr),
        });
      }
    }

    await AuditLog.create({
      userId: new mongoose.Types.ObjectId(actorId),
      event: 'ORG_ADMIN_ONBOARDED',
      ipAddress: auditCtx.ipAddress,
      userAgent: auditCtx.userAgent,
      deviceFingerprint: auditCtx.deviceFingerprint,
      metadata: {
        createdUserId: user._id.toString(),
        email,
        hasOrgDetails,
        skipOrgOnboarding: Boolean(input.skipOrgOnboarding) && !hasOrgDetails,
        inviteSent,
      },
    });

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        accountType: user.accountType,
        onboardingStatus: user.onboardingStatus,
        isEmailVerified: user.isEmailVerified,
        isActive: user.isActive,
      },
      organizationRequest: serializeOrganizationRequest(organizationRequest),
      inviteSent,
    };
  }

  async sendInvite(
    userId: string,
    actorId: string,
    auditCtx: AuditRequestContext
  ) {
    if (!mongoose.isValidObjectId(userId)) {
      throw new ValidationError('Invalid user id.');
    }

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User not found.');
    if (user.accountType !== 'b2b' || user.role !== 'admin') {
      throw new ValidationError('Invite can only be sent to organization (B2B) admin accounts.');
    }
    if (user.orgOwnerId) {
      throw new ValidationError('Invite is for organization owner admins, not operators.');
    }

    const temporaryPassword = generateInvitePassword();
    user.password = temporaryPassword;
    user.mustSetPassword = true;
    user.isEmailVerified = true;
    if (!user.isActive) user.isActive = true;
    await user.save();

    const orgRequest = await OrganizationAccessRequestModel.findOne({ userId: user._id })
      .select('companyName')
      .lean();

    await sendOrgAdminInviteEmail({
      to: user.email,
      email: user.email,
      temporaryPassword,
      companyName: orgRequest?.companyName,
    });

    await AuditLog.create({
      userId: new mongoose.Types.ObjectId(actorId),
      event: 'ORG_ADMIN_INVITE_SENT',
      ipAddress: auditCtx.ipAddress,
      userAgent: auditCtx.userAgent,
      deviceFingerprint: auditCtx.deviceFingerprint,
      metadata: {
        targetUserId: user._id.toString(),
        email: user.email,
      },
    });

    return {
      userId: user._id.toString(),
      email: user.email,
      inviteSent: true,
    };
  }

  /**
   * Hard-delete a B2B organization owner admin and related platform records.
   * Does not tear down cloud-provider resources (Azure/AWS labs, VMs, etc.).
   */
  async deleteOrganization(
    userId: string,
    actorId: string,
    auditCtx: AuditRequestContext
  ): Promise<{ email: string; deleted: Record<string, number> }> {
    if (!mongoose.isValidObjectId(userId)) {
      throw new ValidationError('Invalid user id.');
    }
    if (userId === actorId) {
      throw new ForbiddenError('You cannot delete your own account.');
    }

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User not found.');
    if (user.role === 'super_admin') {
      throw new ForbiddenError('Cannot delete a super admin account.');
    }
    if (user.accountType !== 'b2b' || user.role !== 'admin') {
      throw new ValidationError('Only organization (B2B) admin accounts can be deleted here.');
    }
    if (user.orgOwnerId) {
      throw new ValidationError('Delete the organization owner account, not an org operator.');
    }

    const ownerId = user._id;
    const orgId = ownerId.toString();
    const email = user.email;

    const teamUsers = await User.find({
      $or: [{ orgOwnerId: ownerId }, { createdBy: ownerId, role: 'user' }],
    })
      .select('_id')
      .lean();
    const teamIds = teamUsers.map((u) => u._id);
    const allUserIds = [ownerId, ...teamIds];

    const [
      orgRequests,
      serviceConfigs,
      walletTxs,
      wallets,
      projects,
      orgRoles,
      orgAssignments,
      tokens,
      teamDeleted,
    ] = await Promise.all([
      OrganizationAccessRequestModel.deleteMany({ userId: ownerId }),
      AdminServiceConfig.deleteMany({ adminId: ownerId }),
      AdminWalletTransaction.deleteMany({ userId: ownerId }),
      AdminWallet.deleteMany({ userId: ownerId }),
      ProjectModel.deleteMany({ ownerType: 'org', orgId }),
      OrgRbacRoleModel.deleteMany({ scope: 'platform', orgId }),
      OrgRbacAssignmentModel.deleteMany({ scope: 'platform', orgId }),
      Token.deleteMany({ userId: { $in: allUserIds } }),
      teamIds.length > 0 ? User.deleteMany({ _id: { $in: teamIds } }) : Promise.resolve({ deletedCount: 0 }),
    ]);

    await user.deleteOne();

    const deleted: Record<string, number> = {
      organization: 1,
      organizationAccessRequests: orgRequests.deletedCount ?? 0,
      adminServiceConfigs: serviceConfigs.deletedCount ?? 0,
      adminWalletTransactions: walletTxs.deletedCount ?? 0,
      adminWallets: wallets.deletedCount ?? 0,
      projects: projects.deletedCount ?? 0,
      orgRbacRoles: orgRoles.deletedCount ?? 0,
      orgRbacAssignments: orgAssignments.deletedCount ?? 0,
      tokens: tokens.deletedCount ?? 0,
      teamUsers: teamDeleted.deletedCount ?? 0,
    };

    await AuditLog.create({
      userId: new mongoose.Types.ObjectId(actorId),
      event: 'ORG_ADMIN_DELETED',
      ipAddress: auditCtx.ipAddress,
      userAgent: auditCtx.userAgent,
      deviceFingerprint: auditCtx.deviceFingerprint,
      metadata: {
        deletedUserId: orgId,
        email,
        deleted,
      },
    });

    logger.info('[AdminOrgOnboarding] Organization admin hard-deleted', {
      deletedUserId: orgId,
      email,
      actorId,
      deleted,
    });

    return { email, deleted };
  }
}

export const adminOrgOnboardingService = new AdminOrgOnboardingService();
