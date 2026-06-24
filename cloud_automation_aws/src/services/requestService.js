import mongoose from 'mongoose';
import Request from '../models/Request.js';
import Service from '../models/Service.js';
import ServicePricing from '../models/ServicePricing.js';
import { DEFAULT_IAM_POLICIES } from '../config/iamPolicies.js';
import { calculateEstimate } from './pricingService.js';

function durationDaysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function resolveSelectedServices(selectedServices, region) {
  const resolved = [];

  for (const entry of selectedServices) {
    const serviceId = entry.serviceId;
    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      throw validationError(`Invalid service id: ${serviceId}`);
    }

    const service = await Service.findById(serviceId).lean();
    if (!service) {
      throw validationError(`Service not found: ${serviceId}`);
    }

    let instanceType = entry.instanceType || null;
    let pricePerDay = entry.pricePerDay ?? 0;

    if (service.pricingType === 'instance') {
      let pricing;

      if (instanceType) {
        pricing = await ServicePricing.findOne({ serviceId, region, instanceType }).lean();
      } else {
        pricing = await ServicePricing.findOne({ serviceId, region, pricePerHour: { $gt: 0 } })
          .sort({ pricePerHour: 1 })
          .lean();
      }

      if (!pricing) {
        throw validationError(`No pricing found for ${service.name} in ${region}`);
      }

      instanceType = pricing.instanceType;
      pricePerDay = pricing.pricePerDay;
    } else {
      instanceType = null;
      pricePerDay = 0;
    }

    resolved.push({
      serviceId: service._id,
      serviceName: service.name,
      instanceType,
      pricePerDay,
    });
  }

  return resolved;
}

function buildPermissions(selectedServices, permissionsInput) {
  const permissionMap = new Map(
    (permissionsInput ?? []).map((entry) => [String(entry.serviceId), entry])
  );

  return selectedServices.map((service) => {
    const provided = permissionMap.get(String(service.serviceId));
    if (provided?.policies?.length) {
      return {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        policies: provided.policies,
      };
    }

    const defaultPolicy = DEFAULT_IAM_POLICIES[service.serviceName];
    return {
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      policies: defaultPolicy ? [defaultPolicy] : [],
    };
  });
}

export const createRequest = async (payload, userId) => {
  const {
    customerEmail,
    accountCount,
    costingMode = 'shared',
    startDate,
    endDate,
    enableDailyUsage = false,
    usageWindows = [],
    timezone = 'Asia/Kolkata',
    cleanupEnabled = false,
    cleanupIntervalHours,
    perUserBudgetUsd,
    selectedServices = [],
    permissions = [],
    region,
  } = payload;

  if (!customerEmail?.trim()) {
    throw validationError('customerEmail is required');
  }

  if (!Number.isInteger(accountCount) || accountCount <= 0) {
    throw validationError('accountCount must be a positive integer');
  }

  if (!region?.trim()) {
    throw validationError('region is required');
  }

  if (!startDate || !endDate) {
    throw validationError('startDate and endDate are required');
  }

  if (new Date(endDate) < new Date(startDate)) {
    throw validationError('endDate must be on or after startDate');
  }

  if (!Array.isArray(selectedServices) || selectedServices.length === 0) {
    throw validationError('At least one service must be selected');
  }

  const resolvedServices = await resolveSelectedServices(selectedServices, region.trim());
  const resolvedPermissions = buildPermissions(resolvedServices, permissions);
  const durationDays = durationDaysBetween(startDate, endDate);

  const instanceSelections = resolvedServices
    .filter((entry) => entry.instanceType)
    .map((entry) => ({
      serviceId: String(entry.serviceId),
      instanceType: entry.instanceType,
    }));

  const { total: estimatedPrice } = await calculateEstimate({
    serviceIds: resolvedServices.map((entry) => String(entry.serviceId)),
    region: region.trim(),
    accountCount,
    durationDays,
    instanceSelections,
  });

  const request = await Request.create({
    customerEmail: customerEmail.trim(),
    accountCount,
    costingMode,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    enableDailyUsage,
    usageWindows,
    timezone,
    cleanupEnabled,
    cleanupIntervalHours: cleanupEnabled ? cleanupIntervalHours : undefined,
    perUserBudgetUsd,
    selectedServices: resolvedServices,
    permissions: resolvedPermissions,
    region: region.trim(),
    estimatedPrice,
    createdBy: userId || undefined,
    updatedAt: new Date(),
  });

  return request;
};

export const getAllRequests = async () => {
  return Request.find()
    .sort({ createdAt: -1 })
    .populate('selectedServices.serviceId')
    .lean();
};

export const getRequestById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw validationError('Invalid request id');
  }

  const request = await Request.findById(id).populate('selectedServices.serviceId').lean();
  if (!request) {
    const error = new Error('Request not found');
    error.statusCode = 404;
    throw error;
  }

  return request;
};
