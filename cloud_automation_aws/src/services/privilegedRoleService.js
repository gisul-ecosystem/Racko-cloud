import {
  AttachRolePolicyCommand,
  AttachUserPolicyCommand,
  DetachRolePolicyCommand,
  DetachUserPolicyCommand,
} from '@aws-sdk/client-iam';
import { iamClient } from '../config/aws.js';
import {
  listPrivilegedAwsRoles,
  privilegedInlinePolicyName,
  resolvePrivilegedAwsRole,
} from '../constants/privilegedAwsRoles.js';
import PrivilegedRoleAssignment from '../models/PrivilegedRoleAssignment.js';
import PrivilegedRoleRequest from '../models/PrivilegedRoleRequest.js';
import Request from '../models/Request.js';
import { getIamClientForAccount } from '../provisioners/aws/identityProvisioner.js';
import { createNotification } from './notificationService.js';

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function mapRequest(doc, linkedRequest = null) {
  const row = doc.toObject ? doc.toObject() : doc;
  const requestRef = linkedRequest || (row.requestId && typeof row.requestId === 'object' ? row.requestId : null);
  const requestId =
    requestRef?._id != null
      ? String(requestRef._id)
      : row.requestId
        ? String(row.requestId._id || row.requestId)
        : null;

  return {
    id: String(row._id),
    requestId,
    customerEmail: row.customerEmail,
    awsRole: row.awsRole,
    awsRoleKey: row.awsRoleKey,
    status: row.status,
    reviewNotes: row.reviewNotes || null,
    reviewedBy: row.reviewedBy || null,
    reviewedAt: row.reviewedAt || null,
    accessApplied: Boolean(row.accessApplied),
    usersProcessed: Number(row.usersProcessed || 0),
    rolesAssigned: Number(row.rolesAssigned || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    region: requestRef?.region || null,
    requestStatus: requestRef?.status || null,
    projectName: requestRef?.projectName || requestRef?.requestName || null,
  };
}

function getRequestUsers(request) {
  const accessType = request.accessType || 'magic_link';
  const source =
    accessType === 'identity_center' ? request.identityUsers || [] : request.labRoles || [];
  return source.filter((entry) => !entry.deletedAt);
}

async function attachManagedPolicy({ request, user, managedPolicyArn }) {
  const accessType = request.accessType || 'magic_link';
  if (accessType === 'magic_link') {
    await iamClient.send(
      new AttachRolePolicyCommand({
        RoleName: user.roleName,
        PolicyArn: managedPolicyArn,
      })
    );
    return;
  }

  const client = await getIamClientForAccount(
    user.accountId || user.awsAccountId || request.awsAccountId
  );
  await client.send(
    new AttachUserPolicyCommand({
      UserName: user.username,
      PolicyArn: managedPolicyArn,
    })
  );
}

async function detachManagedPolicy({ request, user, managedPolicyArn }) {
  const accessType = request.accessType || 'magic_link';
  try {
    if (accessType === 'magic_link') {
      await iamClient.send(
        new DetachRolePolicyCommand({
          RoleName: user.roleName,
          PolicyArn: managedPolicyArn,
        })
      );
      return;
    }
    const client = await getIamClientForAccount(
      user.accountId || user.awsAccountId || request.awsAccountId
    );
    await client.send(
      new DetachUserPolicyCommand({
        UserName: user.username,
        PolicyArn: managedPolicyArn,
      })
    );
  } catch (err) {
    if (err.name !== 'NoSuchEntityException') throw err;
  }
}

export function listAssignablePrivilegedRoles() {
  return listPrivilegedAwsRoles();
}

export async function createPrivilegedRoleRequest({
  customerEmail,
  awsRole,
  requestId = null,
} = {}) {
  const email = String(customerEmail || '').trim().toLowerCase();
  if (!email) throw createError('customerEmail is required.', 400);

  const role = resolvePrivilegedAwsRole(awsRole);
  let linkedRequestId = requestId || null;
  if (linkedRequestId) {
    const exists = await Request.exists({ _id: linkedRequestId });
    if (!exists) throw createError('Linked request not found.', 404);
  }

  const pending = await PrivilegedRoleRequest.create({
    requestId: linkedRequestId,
    customerEmail: email,
    awsRole: role.name,
    awsRoleKey: role.key,
    status: 'pending',
  });

  await createNotification({
    type: 'privileged_role_request',
    title: 'AWS privileged role requested',
    message: `${email} requested ${role.name}`,
    requestId: linkedRequestId,
    metadata: { awsRole: role.name, awsRoleKey: role.key },
  });

  return mapRequest(pending);
}

export async function listPrivilegedRoleRequests({ status, requestId } = {}) {
  const query = {};
  if (status) query.status = String(status).toLowerCase();
  if (requestId) query.requestId = requestId;
  const rows = await PrivilegedRoleRequest.find(query)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('requestId', 'region status projectName requestName');
  return rows.map((row) => mapRequest(row));
}

export async function assignPrivilegedRoleToAllUsers(
  requestId,
  awsRoleInput,
  { actor = 'org_admin', skipExisting = true } = {}
) {
  const role = resolvePrivilegedAwsRole(awsRoleInput);
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);
  if (request.status !== 'Completed') {
    throw createError('Privileged roles can only be assigned on completed labs.', 400);
  }

  const users = getRequestUsers(request);
  if (!users.length) throw createError('No provisioned users available for assignment.', 400);

  let rolesAssigned = 0;
  let usersProcessed = 0;
  const failures = [];

  for (const user of users) {
    usersProcessed += 1;
    const userIndex = Number(user.userIndex);
    if (skipExisting) {
      const existing = await PrivilegedRoleAssignment.findOne({
        requestId,
        userIndex,
        awsRoleKey: role.key,
        active: true,
      });
      if (existing) continue;
    }

    try {
      await attachManagedPolicy({
        request,
        user,
        managedPolicyArn: role.managedPolicyArn,
      });

      await PrivilegedRoleAssignment.findOneAndUpdate(
        { requestId, userIndex, awsRoleKey: role.key, active: true },
        {
          requestId,
          userIndex,
          awsRoleKey: role.key,
          awsRoleName: role.name,
          managedPolicyArn: role.managedPolicyArn,
          policyName: privilegedInlinePolicyName(role.key),
          assignedBy: actor,
          active: true,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      rolesAssigned += 1;
    } catch (err) {
      failures.push({
        userIndex,
        username: user.username || user.roleName,
        error: err.message,
      });
    }
  }

  if (rolesAssigned === 0 && failures.length > 0) {
    throw createError(
      `Failed to assign ${role.name}: ${failures[0]?.error || 'unknown error'}`,
      502
    );
  }

  return {
    success: true,
    message:
      failures.length > 0
        ? `${role.name} assigned to ${rolesAssigned} user(s); ${failures.length} failed.`
        : `${role.name} assigned to ${rolesAssigned} user(s).`,
    awsRole: role.name,
    awsRoleKey: role.key,
    usersProcessed,
    rolesAssigned,
    failures,
  };
}

export async function reviewPrivilegedRoleRequest(
  id,
  { status, reviewNotes, actor = 'org_admin' } = {}
) {
  const normalized = String(status || '').toLowerCase();
  if (!['approved', 'rejected'].includes(normalized)) {
    throw createError('status must be approved or rejected', 400);
  }

  const row = await PrivilegedRoleRequest.findOne({ _id: id, status: 'pending' });
  if (!row) throw createError('Pending privileged role request not found', 404);

  row.status = normalized;
  row.reviewNotes = reviewNotes || null;
  row.reviewedBy = actor;
  row.reviewedAt = new Date();

  let assignmentResult = null;
  if (normalized === 'approved' && row.requestId) {
    const lab = await Request.findById(row.requestId).select('status');
    if (lab?.status === 'Completed') {
      assignmentResult = await assignPrivilegedRoleToAllUsers(row.requestId, row.awsRoleKey, {
        actor,
      });
      row.accessApplied = true;
      row.usersProcessed = assignmentResult.usersProcessed;
      row.rolesAssigned = assignmentResult.rolesAssigned;
    }
  }

  await row.save();

  await createNotification({
    type: 'privileged_role_request_reviewed',
    title: `AWS privileged role ${normalized}`,
    message: `${row.awsRole} was ${normalized} for ${row.customerEmail}`,
    requestId: row.requestId,
    metadata: { status: normalized, awsRole: row.awsRole },
  });

  return {
    request: mapRequest(row),
    assignment: assignmentResult,
  };
}

export async function linkPrivilegedRoleRequestsToRequest(requestId, customerEmail) {
  const email = String(customerEmail || '').trim().toLowerCase();
  if (!email) return { linked: 0 };

  const result = await PrivilegedRoleRequest.updateMany(
    { customerEmail: email, requestId: null, status: { $in: ['pending', 'approved'] } },
    { $set: { requestId, updatedAt: new Date() } }
  );

  return { linked: result.modifiedCount || 0 };
}

export async function fulfillLinkedApprovedPrivilegedRoleRequests(requestId, { actor = 'system' } = {}) {
  const rows = await PrivilegedRoleRequest.find({
    requestId,
    status: 'approved',
    accessApplied: false,
  });

  const results = [];
  for (const row of rows) {
    try {
      const assignment = await assignPrivilegedRoleToAllUsers(requestId, row.awsRoleKey, { actor });
      row.accessApplied = true;
      row.usersProcessed = assignment.usersProcessed;
      row.rolesAssigned = assignment.rolesAssigned;
      await row.save();
      results.push({ id: String(row._id), success: true, assignment });
    } catch (err) {
      results.push({ id: String(row._id), success: false, error: err.message });
    }
  }
  return results;
}

export async function listAssignmentsForRequest(requestId) {
  const rows = await PrivilegedRoleAssignment.find({ requestId, active: true }).sort({
    createdAt: -1,
  });
  return rows.map((row) => {
    const value = row.toObject ? row.toObject() : row;
    return {
      id: String(value._id),
      requestId: String(value.requestId),
      userIndex: value.userIndex,
      awsRoleKey: value.awsRoleKey,
      awsRoleName: value.awsRoleName,
      managedPolicyArn: value.managedPolicyArn,
      assignedBy: value.assignedBy,
      createdAt: value.createdAt,
    };
  });
}

export async function revokePrivilegedRoleAssignment(assignmentId, { actor = 'org_admin' } = {}) {
  const assignment = await PrivilegedRoleAssignment.findOne({ _id: assignmentId, active: true });
  if (!assignment) throw createError('Assignment not found', 404);

  const request = await Request.findById(assignment.requestId);
  if (!request) throw createError('Request not found', 404);

  const field =
    (request.accessType || 'magic_link') === 'identity_center' ? 'identityUsers' : 'labRoles';
  const user = (request[field] || []).find(
    (entry) => Number(entry.userIndex) === Number(assignment.userIndex)
  );
  if (user) {
    await detachManagedPolicy({
      request,
      user,
      managedPolicyArn: assignment.managedPolicyArn,
    });
  }

  assignment.active = false;
  assignment.assignedBy = actor;
  await assignment.save();
  return { success: true, id: String(assignment._id) };
}
