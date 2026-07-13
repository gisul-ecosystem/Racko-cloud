import { PutRolePolicyCommand, PutUserPolicyCommand, DeleteRolePolicyCommand, DeleteUserPolicyCommand } from '@aws-sdk/client-iam';
import { iamClient } from '../config/aws.js';
import CustomIamPolicy from '../models/CustomIamPolicy.js';
import CustomIamPolicyAssignment from '../models/CustomIamPolicyAssignment.js';
import CustomService from '../models/CustomService.js';
import Request from '../models/Request.js';
import { getIamClientForAccount } from '../provisioners/aws/identityProvisioner.js';

function error(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function validatePolicyDocument(document) {
  if (!document || document.Version !== '2012-10-17' || !Array.isArray(document.Statement)) {
    throw error('document must be a valid IAM policy with Version and Statement.', 400);
  }
  return document;
}

function policyName(id) {
  return `RackoCustom-${String(id).slice(-12)}`;
}

function apiObject(value) {
  const object = value?.toObject ? value.toObject() : { ...value };
  object.id = String(object._id);
  delete object._id;
  return object;
}

async function getRequestUser(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) throw error('Request not found', 404);
  const field = request.accessType === 'identity_center' ? 'identityUsers' : 'labRoles';
  const user = request[field]?.find((entry) => entry.userIndex === Number(userIndex));
  if (!user) throw error('User not found', 404);
  return { request, user, field };
}

async function applyPolicy({ request, user, assignmentId, document }) {
  const name = policyName(assignmentId);
  if ((request.accessType || 'magic_link') === 'magic_link') {
    await iamClient.send(new PutRolePolicyCommand({
      RoleName: user.roleName,
      PolicyName: name,
      PolicyDocument: JSON.stringify(document),
    }));
  } else {
    const client = await getIamClientForAccount(user.accountId || user.awsAccountId || request.awsAccountId);
    await client.send(new PutUserPolicyCommand({
      UserName: user.username,
      PolicyName: name,
      PolicyDocument: JSON.stringify(document),
    }));
  }
}

export async function listCustomPolicies() {
  const policies = await CustomIamPolicy.find({ active: true }).sort({ createdAt: -1 });
  return policies.map(apiObject);
}

export async function createCustomPolicy(fields, actor) {
  const policy = await CustomIamPolicy.create({
    name: fields.name,
    description: fields.description,
    document: validatePolicyDocument(fields.document || fields.policyDocument),
    createdBy: actor,
  });
  return apiObject(policy);
}

export async function updateCustomPolicy(id, fields) {
  const updates = {};
  for (const key of ['name', 'description']) if (fields[key] !== undefined) updates[key] = fields[key];
  if (fields.document !== undefined || fields.policyDocument !== undefined) {
    updates.document = validatePolicyDocument(fields.document || fields.policyDocument);
  }
  const policy = await CustomIamPolicy.findOneAndUpdate({ _id: id, active: true }, updates, { new: true });
  if (!policy) throw error('Custom IAM policy not found', 404);
  return apiObject(policy);
}

export async function deleteCustomPolicy(id) {
  const policy = await CustomIamPolicy.findOneAndUpdate({ _id: id, active: true }, { active: false }, { new: true });
  if (!policy) throw error('Custom IAM policy not found', 404);
  return policy;
}

export async function listAssignments(requestId) {
  return CustomIamPolicyAssignment.find({ requestId, active: true }).sort({ createdAt: -1 }).lean();
}

export async function assignPolicy({ requestId, userIndex, policyId, document, name, actor }) {
  const source = policyId ? await CustomIamPolicy.findOne({ _id: policyId, active: true }) : null;
  if (policyId && !source) throw error('Custom IAM policy not found', 404);
  const resolvedDocument = validatePolicyDocument(source?.document || document);
  const { request, user } = await getRequestUser(requestId, userIndex);
  const assignment = await CustomIamPolicyAssignment.create({
    requestId,
    userIndex: Number(userIndex),
    policyId: source?._id,
    name: source?.name || name || 'Inline custom policy',
    document: resolvedDocument,
    assignedBy: actor,
  });
  try {
    await applyPolicy({ request, user, assignmentId: assignment._id, document: resolvedDocument });
    return assignment;
  } catch (err) {
    await CustomIamPolicyAssignment.deleteOne({ _id: assignment._id });
    throw err;
  }
}

export async function assignPolicyToAll({ requestId, policyId, document, name, actor, skipExisting = true }) {
  const request = await Request.findById(requestId);
  if (!request) throw error('Request not found', 404);
  const users = request.accessType === 'identity_center' ? request.identityUsers || [] : request.labRoles || [];
  const assignments = [];
  for (const user of users) {
    if (skipExisting && policyId) {
      const exists = await CustomIamPolicyAssignment.exists({ requestId, userIndex: user.userIndex, policyId, active: true });
      if (exists) continue;
    }
    assignments.push(await assignPolicy({ requestId, userIndex: user.userIndex, policyId, document, name, actor }));
  }
  return { assignments, assignedCount: assignments.length };
}

export async function revokeAssignment(id) {
  const assignment = await CustomIamPolicyAssignment.findOne({ _id: id, active: true });
  if (!assignment) throw error('Custom IAM policy assignment not found', 404);
  const { request, user } = await getRequestUser(assignment.requestId, assignment.userIndex);
  const name = policyName(assignment._id);
  try {
    if ((request.accessType || 'magic_link') === 'magic_link') {
      await iamClient.send(new DeleteRolePolicyCommand({ RoleName: user.roleName, PolicyName: name }));
    } else {
      const client = await getIamClientForAccount(user.accountId || user.awsAccountId || request.awsAccountId);
      await client.send(new DeleteUserPolicyCommand({ UserName: user.username, PolicyName: name }));
    }
  } catch (err) {
    if (err.name !== 'NoSuchEntityException') throw err;
  }
  assignment.active = false;
  await assignment.save();
}

export async function listCustomServices() {
  const services = await CustomService.find({ active: true }).sort({ createdAt: -1 });
  return services.map(apiObject);
}

export async function createCustomService(fields, actor) {
  if (!fields.name) throw error('name is required');
  return apiObject(await CustomService.create({ ...fields, createdBy: actor }));
}

export async function updateCustomService(id, fields) {
  const allowed = ['name', 'description', 'category', 'pricePerUser', 'icon', 'iamActions'];
  const updates = Object.fromEntries(allowed.filter((key) => fields[key] !== undefined).map((key) => [key, fields[key]]));
  const service = await CustomService.findOneAndUpdate({ _id: id, active: true }, updates, { new: true });
  if (!service) throw error('Custom service not found', 404);
  return apiObject(service);
}

export async function deleteCustomService(id) {
  const service = await CustomService.findOneAndUpdate({ _id: id, active: true }, { active: false }, { new: true });
  if (!service) throw error('Custom service not found', 404);
  await Request.updateMany({}, { $pull: { customServiceIds: service._id } });
}

export async function assignCustomService(requestId, serviceId) {
  const service = await CustomService.findOne({ _id: serviceId, active: true });
  if (!service) throw error('Custom service not found', 404);
  const request = await Request.findByIdAndUpdate(requestId, { $addToSet: { customServiceIds: service._id } }, { new: true });
  if (!request) throw error('Request not found', 404);
}

export async function removeCustomService(requestId, serviceId) {
  const request = await Request.findByIdAndUpdate(requestId, { $pull: { customServiceIds: serviceId } }, { new: true });
  if (!request) throw error('Request not found', 404);
}

export async function getRequestCustomServices(requestId) {
  const request = await Request.findById(requestId).populate('customServiceIds');
  if (!request) throw error('Request not found', 404);
  return (request.customServiceIds || []).filter((service) => service.active).map(apiObject);
}
