import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import type { AuthenticatedRequest } from '../../types';
import { User } from '../../models/user.model';
import {
  OrganizationAccessRequestModel,
  nextReadableOrgId,
} from '../../models/organizationAccessRequest.model';
import { ValidationError, NotFoundError } from '../../utils/errors';
import { sendPlainEmail } from '../../utils/email/sender';
import { generateFingerprint, getClientIp } from '../../utils/deviceFingerprint';
import { adminOrgOnboardingService } from './adminOrgOnboarding.service';
import { otpService } from '../otp/otp.service';
import {
  serializeOrganizationRequest,
  serializeOrganizationRequests,
  withEncryptedTaxId,
} from './organizationSensitiveFields';

const router = Router();

const COMPANY_SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;

const contactNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(120, 'Name must be at most 120 characters')
  .regex(/^[A-Za-z][A-Za-z .'-]*$/, 'Name may only include letters, spaces, periods, hyphens, and apostrophes');

const phoneE164Schema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,18}$/, 'Enter a valid phone number with country code');

const optionalWebsiteSchema = z
  .string()
  .trim()
  .max(255)
  .refine((v) => v === '' || /^https?:\/\/.+/i.test(v), {
    message: 'Website must start with http:// or https://',
  })
  .optional()
  .or(z.literal(''));

const organizationDetailsFields = z.object({
  contactName: contactNameSchema,
  companyName: z
    .string()
    .trim()
    .min(2, 'Company name must be at least 2 characters')
    .max(160, 'Company name must be at most 160 characters'),
  companyWebsite: optionalWebsiteSchema,
  phone: phoneE164Schema,
  designation: z
    .string()
    .trim()
    .min(2, 'Designation must be at least 2 characters')
    .max(120, 'Designation must be at most 120 characters'),
  companySize: z.enum(COMPANY_SIZE_OPTIONS, {
    required_error: 'Select a valid company size',
    invalid_type_error: 'Select a valid company size',
  }),
  registeredAddress: z
    .string()
    .trim()
    .min(10, 'Address must be at least 10 characters')
    .max(500, 'Address must be at most 500 characters'),
  taxId: z
    .string()
    .trim()
    .min(5, 'Tax / registration ID must be at least 5 characters')
    .max(120, 'Tax / registration ID must be at most 120 characters')
    .regex(/^[A-Za-z0-9][A-Za-z0-9\-\/]*$/, 'Tax ID may only include letters, numbers, hyphens, and slashes'),
  useCase: z
    .string()
    .trim()
    .min(10, 'Use cases must be at least 10 characters')
    .max(1000, 'Use cases must be at most 1000 characters'),
  expectedUsage: z
    .string()
    .trim()
    .min(10, 'Expected usage must be at least 10 characters')
    .max(1000, 'Expected usage must be at most 1000 characters'),
});

const submitOrganizationDetailsSchema = z.object({
  body: organizationDetailsFields,
});

const reviewOrganizationRequestSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid request id'),
  }),
  body: z.object({
    status: z.enum(['approved', 'rejected']),
    ndaStatus: z.enum(['not_started', 'pending', 'completed']).optional(),
    reviewerNotes: z.string().trim().max(2000).optional(),
  }),
});

const adminCreateOrganizationSchema = z.object({
  body: z.object({
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Invalid email format')
      .max(254, 'Email too long')
      .toLowerCase()
      .trim(),
    sendInvite: z.boolean().optional().default(true),
    skipOrgOnboarding: z.boolean().optional().default(false),
    organization: organizationDetailsFields.optional(),
  }),
});

const adminSendInviteSchema = z.object({
  params: z.object({
    userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user id'),
  }),
  body: z.object({}).optional(),
});

const adminDeleteOrganizationSchema = z.object({
  params: z.object({
    userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user id'),
  }),
});

function success<T>(res: import('express').Response, message: string, data: T, status = 200): void {
  res.status(status).json({ success: true, message, data });
}

function auditCtxFromReq(req: import('express').Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: String(req.headers['user-agent'] ?? 'unknown'),
    deviceFingerprint: generateFingerprint(req),
  };
}

router.use(requireAuth);

router.get('/me', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const request = await OrganizationAccessRequestModel.findOne({
      userId: authReq.user.userId,
    }).lean();
    success(res, 'Onboarding details retrieved.', { request: serializeOrganizationRequest(request) });
  } catch (err) {
    next(err);
  }
});

/**
 * Org admin profile: create/update organization details without re-entering SA review.
 * Allowed for B2B org owners who already have console access (org_approved / active).
 */
router.put(
  '/me/organization',
  validateRequest(submitOrganizationDetailsSchema),
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = await User.findById(authReq.user.userId);
      if (!user) throw new NotFoundError('User not found.');
      if (user.accountType !== 'b2b' || user.role !== 'admin') {
        throw new ValidationError('Only organization admins can update organization profile.');
      }
      if (user.orgOwnerId) {
        throw new ValidationError('Only the organization owner can update organization details.');
      }
      if (!['org_approved', 'active'].includes(user.onboardingStatus)) {
        throw new ValidationError(
          'Complete organization approval before editing profile details here.'
        );
      }

      const body = req.body as z.infer<typeof submitOrganizationDetailsSchema>['body'];
      const encryptedBody = withEncryptedTaxId(body);
      const existing = await OrganizationAccessRequestModel.findOne({ userId: user._id });
      const keepNda = existing?.ndaStatus ?? 'not_started';
      const orgIdForInsert = existing ? undefined : await nextReadableOrgId();

      const requestDoc = await OrganizationAccessRequestModel.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            ...encryptedBody,
            companyWebsite: body.companyWebsite || undefined,
            status: 'approved',
            ndaStatus: keepNda,
            reviewerNotes: existing?.reviewerNotes ?? 'Updated by organization admin from profile.',
          },
          $setOnInsert: {
            ...(orgIdForInsert ? { orgId: orgIdForInsert } : {}),
            reviewedAt: new Date(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (user.onboardingStatus !== 'org_approved' && user.onboardingStatus !== 'active') {
        user.onboardingStatus = 'org_approved';
        await user.save();
      }

      success(res, 'Organization profile saved.', { request: serializeOrganizationRequest(requestDoc) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/organization-request',
  validateRequest(submitOrganizationDetailsSchema),
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = await User.findById(authReq.user.userId);
      if (!user) throw new NotFoundError('User not found.');
      if (user.accountType !== 'b2b') {
        throw new ValidationError('Only B2B users can submit organization details.');
      }

      const body = req.body as z.infer<typeof submitOrganizationDetailsSchema>['body'];
      const encryptedBody = withEncryptedTaxId(body);
      await otpService.assertPhoneVerified(
        authReq.user.userId,
        body.phone,
        'organization_onboarding_phone'
      );
      const existing = await OrganizationAccessRequestModel.findOne({ userId: user._id })
        .select('_id')
        .lean();
      const orgIdForInsert = existing ? undefined : await nextReadableOrgId();
      const requestDoc = await OrganizationAccessRequestModel.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            ...encryptedBody,
            companyWebsite: body.companyWebsite || undefined,
            status: 'pending',
          },
          $setOnInsert: {
            ...(orgIdForInsert ? { orgId: orgIdForInsert } : {}),
            ndaStatus: 'not_started',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      user.onboardingStatus = 'org_review_pending';
      await user.save();

      const superAdmins = await User.find({ role: 'super_admin', isActive: true })
        .select('email')
        .lean();

      await Promise.all(
        superAdmins.map((admin) =>
          sendPlainEmail({
            to: admin.email,
            subject: `New B2B access request: ${body.companyName}`,
            html: `<p>A new B2B access request was submitted.</p>
<p><strong>Company:</strong> ${body.companyName}</p>
<p><strong>Contact:</strong> ${body.contactName}</p>
<p><strong>Email:</strong> ${user.email}</p>`,
            text: `A new B2B access request was submitted.\nCompany: ${body.companyName}\nContact: ${body.contactName}\nEmail: ${user.email}`,
          })
        )
      );

      success(
        res,
        'Organization details submitted for review.',
        { request: serializeOrganizationRequest(requestDoc) },
        201
      );
    } catch (err) {
      next(err);
    }
  }
);

router.get('/organization-requests', requireRole('super_admin'), async (_req, res, next) => {
  try {
    const requests = await OrganizationAccessRequestModel.find()
      .populate('userId', 'email accountType onboardingStatus isEmailVerified')
      .populate('reviewedBy', 'email')
      .sort({ createdAt: -1 })
      .lean();
    success(res, 'Organization requests retrieved.', {
      requests: serializeOrganizationRequests(requests),
      total: requests.length,
    });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/organization-requests/:id',
  requireRole('super_admin'),
  validateRequest(reviewOrganizationRequestSchema),
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const { status, ndaStatus, reviewerNotes } = req.body as z.infer<
        typeof reviewOrganizationRequestSchema
      >['body'];

      const requestDoc = await OrganizationAccessRequestModel.findById(id);
      if (!requestDoc) throw new NotFoundError('Organization request not found.');

      requestDoc.status = status;
      if (ndaStatus) requestDoc.ndaStatus = ndaStatus;
      requestDoc.reviewerNotes = reviewerNotes;
      requestDoc.reviewedBy = new mongoose.Types.ObjectId(authReq.user.userId);
      requestDoc.reviewedAt = new Date();
      await requestDoc.save();

      const user = await User.findById(requestDoc.userId);
      if (user) {
        user.onboardingStatus = status === 'approved' ? 'org_approved' : 'org_rejected';
        await user.save();

        await sendPlainEmail({
          to: user.email,
          subject: `Organization access request ${status}`,
          html: `<p>Your organization access request was <strong>${status}</strong>.</p>
<p>${reviewerNotes ?? ''}</p>`,
          text: `Your organization access request was ${status}.\n${reviewerNotes ?? ''}`,
        });
      }

      success(res, 'Organization request updated.', { request: serializeOrganizationRequest(requestDoc) });
    } catch (err) {
      next(err);
    }
  }
);

/** Super-admin: create B2B org admin (email verified). Org details optional. */
router.post(
  '/admin/organizations',
  requireRole('super_admin'),
  validateRequest(adminCreateOrganizationSchema),
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const body = req.body as z.infer<typeof adminCreateOrganizationSchema>['body'];
      const result = await adminOrgOnboardingService.createOrganization(
        body,
        authReq.user.userId,
        auditCtxFromReq(req)
      );
      success(
        res,
        result.inviteSent
          ? 'Organization admin created and invite email sent.'
          : 'Organization admin created.',
        result,
        201
      );
    } catch (err) {
      next(err);
    }
  }
);

/** Super-admin: (re)send invite email with a newly generated temporary password. */
router.post(
  '/admin/organizations/:userId/send-invite',
  requireRole('super_admin'),
  validateRequest(adminSendInviteSchema),
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId } = req.params as { userId: string };
      const result = await adminOrgOnboardingService.sendInvite(
        userId,
        authReq.user.userId,
        auditCtxFromReq(req)
      );
      success(res, 'Invite email sent.', result);
    } catch (err) {
      next(err);
    }
  }
);

/** Super-admin: hard-delete B2B organization owner + related platform records. */
router.delete(
  '/admin/organizations/:userId',
  requireRole('super_admin'),
  validateRequest(adminDeleteOrganizationSchema),
  async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { userId } = req.params as { userId: string };
      const result = await adminOrgOnboardingService.deleteOrganization(
        userId,
        authReq.user.userId,
        auditCtxFromReq(req)
      );
      success(res, 'Organization account deleted.', result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
