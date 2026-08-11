import Request from '../../models/Request.js';
import {
  createLabProject,
  createIdentityUsers,
  assignProjectIamRoles,
  sendCredentialsEmail,
} from './provisioners.js';
import {
  complete,
  fail,
  logStepComplete,
  logStepFailed,
  logStepStart,
  updateStep,
} from '../../services/progressTracker.js';

async function runStep(requestId, stepKey, stepName, stepNumber, handler) {
  const log = await logStepStart(requestId, stepNumber, stepName);
  try {
    const result = await handler();
    await logStepComplete(log._id, result);
    await updateStep(requestId, stepKey);
    return result;
  } catch (err) {
    await logStepFailed(log._id, err);
    throw err;
  }
}

export async function run(requestId) {
  const request = await Request.findById(requestId);
  if (!request) throw new Error('Request not found');

  await Request.findByIdAndUpdate(requestId, {
    'provisionStatus.overall': 'running',
    updatedAt: new Date(),
  });

  try {
    const project = await runStep(
      requestId,
      'create_project',
      'Create GCP project',
      1,
      () =>
        createLabProject({
          displayName: request.projectName,
          requestId: String(request._id),
        })
    );

    await runStep(requestId, 'apply_org_policy', 'Apply org policies', 2, async () => ({
      skipped: true,
      reason: 'Org policy step reserved for Phase 2',
    }));

    const users = await runStep(
      requestId,
      'create_users',
      'Create Cloud Identity users',
      3,
      () =>
        createIdentityUsers({
          accountCount: request.accountCount,
          projectId: project.projectId,
          idMode: request.idMode,
        })
    );

    await runStep(requestId, 'assign_iam', 'Assign IAM roles', 4, () =>
      assignProjectIamRoles({
        projectId: project.projectId,
        users,
        permissions: request.permissions,
      })
    );

    const emailResult = await runStep(requestId, 'send_credentials', 'Send credentials', 5, () =>
      sendCredentialsEmail({ request, users })
    );

    await complete(requestId, {
      gcpProjectId: project.projectId,
      gcpProjectIds: [project.projectId],
      identityUsers: users,
      credentialsSent: Boolean(emailResult?.sent),
    });
  } catch (err) {
    const message =
      err.code === 'GCP_CREDENTIALS_MISSING'
        ? err.message
        : err.message || 'Provisioning failed';

    await fail(requestId, message);
    throw err;
  }
}
