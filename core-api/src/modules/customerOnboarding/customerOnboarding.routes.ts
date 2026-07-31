import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import type { AuthenticatedRequest } from '../../types';
import { User } from '../../models/user.model';
import { OrganizationAccessRequestModel } from '../../models/organizationAccessRequest.model';
import { ValidationError, NotFoundError } from '../../utils/errors';
import { sendPlainEmail } from '../../utils/email/sender';

const router = Router();

const submitOrganizationDetailsSchema = z.object({
  body: z.object({
    contactName: z.string().trim().min(2).max(120),
    companyName: z.string().trim().min(2).max(160),
    companyWebsite: z.string().trim().url().max(255).optional().or(z.literal('')),
    phone: z.string().trim().max(40).optional(),
    designation: z.string().trim().max(120).optional(),
    companySize: z.string().trim().max(80).optional(),
    registeredAddress: z.string().trim().max(500).optional(),
    taxId: z.string().trim().max(120).optional(),
    useCase: z.string().trim().max(1000).optional(),
    expectedUsage: z.string().trim().max(1000).optional(),
  }),
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

function success<T>(res: import('express').Response, message: string, data: T, status = 200): void {
  res.status(status).json({ success: true, message, data });
}

router.use(requireAuth);

router.get('/me', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const request = await OrganizationAccessRequestModel.findOne({
      userId: authReq.user.userId,
    }).lean();
    success(res, 'Onboarding details retrieved.', { request });
  } catch (err) {
    next(err);
  }
});

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
      const requestDoc = await OrganizationAccessRequestModel.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            ...body,
            companyWebsite: body.companyWebsite || undefined,
            status: 'pending',
          },
          $setOnInsert: {
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
        { request: requestDoc },
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
    success(res, 'Organization requests retrieved.', { requests, total: requests.length });
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

      success(res, 'Organization request updated.', { request: requestDoc });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
