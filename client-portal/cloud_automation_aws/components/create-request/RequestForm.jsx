'use client';

import { AlertCircle } from 'lucide-react';
import { useMemo } from 'react';
import { COMMON_TIMEZONES } from '../../constants';
import { inputClass, labelClass, sectionClass, timeInputClass } from './formStyles';
import { InstancePicker } from './InstancePicker';
import { PermissionsPicker } from './PermissionsPicker';
import { RegionPicker } from './RegionPicker';
import { RequestStepper } from './RequestStepper';
import { ServiceSelector } from './ServiceSelector';

const USAGE_WINDOW_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function RequestForm({
  currentStep,
  maxReachableStep,
  onStepClick,
  onNext,
  onBack,
  stepErrors,
  services,
  servicesByCategory,
  selectedServiceIds,
  onToggleService,
  selectedInstances,
  onSelectInstance,
  pricingRegion,
  region,
  onRegionChange,
  customerEmail,
  onCustomerEmailChange,
  accountCount,
  onAccountCountChange,
  costingMode,
  onCostingModeChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  usageWindows,
  onUsageWindowsChange,
  timezone,
  onTimezoneChange,
  cleanupEnabled,
  onCleanupEnabledChange,
  cleanupIntervalHours,
  onCleanupIntervalHoursChange,
  perUserBudgetUsd,
  onPerUserBudgetUsdChange,
  permissionOverrides,
  onPermissionChange,
  validationErrors,
}) {
  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service._id)),
    [services, selectedServiceIds]
  );

  const instanceServices = selectedServices.filter((service) => service.pricingType === 'instance');
  const flatRateServices = selectedServices.filter((service) => service.pricingType === 'flat_rate');

  const toggleUsageWindowDay = (day, enabled) => {
    if (!enabled) {
      onUsageWindowsChange(usageWindows.filter((window) => window.day !== day));
      return;
    }

    onUsageWindowsChange([
      ...usageWindows.filter((window) => window.day !== day),
      { day, startTime: '09:00', endTime: '18:00' },
    ]);
  };

  const updateUsageWindow = (day, patch) => {
    onUsageWindowsChange(
      usageWindows.map((window) => (window.day === day ? { ...window, ...patch } : window))
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <RequestStepper
          currentStep={currentStep}
          maxReachableStep={maxReachableStep}
          onStepClick={onStepClick}
        />
      </div>

      {(validationErrors.length > 0 || stepErrors.length > 0) && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <ul className="space-y-1 text-sm text-red-700">
              {[...stepErrors, ...validationErrors].map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-gray-900">Customer details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="customerEmail">
                Customer email
              </label>
              <input
                id="customerEmail"
                type="email"
                className={inputClass}
                value={customerEmail}
                onChange={(event) => onCustomerEmailChange(event.target.value)}
                placeholder="customer@company.com"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="accountCount">
                Account count
              </label>
              <input
                id="accountCount"
                type="number"
                min={1}
                className={inputClass}
                value={accountCount}
                onChange={(event) => onAccountCountChange(Number(event.target.value))}
              />
            </div>
            <div className="sm:col-span-2">
              <span className={labelClass}>Account costing mode</span>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 p-4 transition hover:border-gray-300 has-[:checked]:border-[#B91C1C] has-[:checked]:bg-red-50/40">
                  <input
                    type="radio"
                    name="costingMode"
                    value="shared"
                    checked={costingMode === 'shared'}
                    onChange={() => onCostingModeChange('shared')}
                    className="mt-1 h-4 w-4 border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">Shared account</span>
                    <span className="mt-1 block text-xs text-gray-500">
                      One AWS account for all users
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 p-4 transition hover:border-gray-300 has-[:checked]:border-[#B91C1C] has-[:checked]:bg-red-50/40">
                  <input
                    type="radio"
                    name="costingMode"
                    value="per_user"
                    checked={costingMode === 'per_user'}
                    onChange={() => onCostingModeChange('per_user')}
                    className="mt-1 h-4 w-4 border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">Per-user accounts</span>
                    <span className="mt-1 block text-xs text-gray-500">
                      Separate AWS account per user
                    </span>
                  </span>
                </label>
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="startDate">
                Service start date
              </label>
              <input
                id="startDate"
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(event) => onStartDateChange(event.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="endDate">
                Service end date
              </label>
              <input
                id="endDate"
                type="date"
                className={inputClass}
                value={endDate}
                onChange={(event) => onEndDateChange(event.target.value)}
              />
            </div>
          </div>
        </section>
      )}

      {currentStep === 2 && (
        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-gray-900">Daily usage windows</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Set which days and hours lab users can access AWS
          </p>
          <div className="mt-4 space-y-3">
            {USAGE_WINDOW_DAYS.map((day) => {
              const existing = usageWindows.find((window) => window.day === day);
              return (
                <div key={day} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex min-w-[132px] cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={Boolean(existing)}
                        onChange={(event) => toggleUsageWindowDay(day, event.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                      />
                      <span className="text-sm font-medium text-gray-900">{day}</span>
                    </label>
                    {existing && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          value={existing.startTime}
                          onChange={(event) =>
                            updateUsageWindow(day, { startTime: event.target.value })
                          }
                          className={timeInputClass}
                          aria-label={`${day} start time`}
                        />
                        <span className="text-xs text-gray-400">→</span>
                        <input
                          type="time"
                          value={existing.endTime}
                          onChange={(event) => updateUsageWindow(day, { endTime: event.target.value })}
                          className={timeInputClass}
                          aria-label={`${day} end time`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <label className={labelClass} htmlFor="timezone">
              Timezone
            </label>
            <select
              id="timezone"
              className={inputClass}
              value={timezone}
              onChange={(event) => onTimezoneChange(event.target.value)}
            >
              <option value="Asia/Kolkata">IST — Asia/Kolkata</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">EST — America/New_York</option>
              <option value="America/Los_Angeles">PST — America/Los_Angeles</option>
              <option value="Europe/London">GMT — Europe/London</option>
              <option value="Asia/Dubai">GST — Asia/Dubai</option>
              {COMMON_TIMEZONES.filter(
                (entry) =>
                  ![
                    'Asia/Kolkata',
                    'UTC',
                    'America/New_York',
                    'America/Los_Angeles',
                    'Europe/London',
                    'Asia/Dubai',
                  ].includes(entry)
              ).map((entry) => (
                <option key={entry} value={entry}>
                  {entry.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {currentStep === 3 && (
        <section className={sectionClass}>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={cleanupEnabled}
              onChange={(event) => {
                onCleanupEnabledChange(event.target.checked);
                if (!event.target.checked) {
                  onCleanupIntervalHoursChange(undefined);
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
            />
            <span className="text-sm font-medium text-gray-900">Enable periodic resource cleanup</span>
          </label>
          {cleanupEnabled && (
            <div className="mt-4">
              <label className={labelClass} htmlFor="cleanupIntervalHours">
                Delete all resources inside lab every (hours)
              </label>
              <input
                id="cleanupIntervalHours"
                type="number"
                min={1}
                max={24}
                placeholder="e.g. 1"
                className={inputClass}
                value={cleanupIntervalHours ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  onCleanupIntervalHoursChange(value ? Number.parseInt(value, 10) : undefined);
                }}
              />
              <p className="mt-2 text-xs text-gray-500">
                Every {cleanupIntervalHours || '?'} hour(s), all AWS resources (EC2 instances, RDS
                databases, S3 objects, etc.) created inside the lab will be automatically deleted. Lab
                accounts and access are kept — users can create new resources again immediately after
                cleanup.
              </p>
            </div>
          )}
        </section>
      )}

      {currentStep === 4 && (
        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-gray-900">Per-user budget</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Optional spending cap per user (requires per-user accounts)
          </p>
          <div className="mt-4">
            <label className={labelClass} htmlFor="perUserBudgetUsd">
              Budget per user (USD) — optional
            </label>
            <input
              id="perUserBudgetUsd"
              type="number"
              min={1}
              step={0.01}
              placeholder="e.g. 50.00"
              className={inputClass}
              value={perUserBudgetUsd ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                onPerUserBudgetUsdChange(value ? Number.parseFloat(value) : undefined);
              }}
            />
            <p className="mt-2 text-xs text-gray-500">
              An AWS Budget is created for each user with their own account. When spending exceeds
              this amount, the user receives an email and their IAM access is automatically suspended.
            </p>
          </div>
        </section>
      )}

      {currentStep === 5 && (
        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-gray-900">Services</h2>
          <p className="mt-0.5 text-xs text-gray-400">Select one or more AWS services to provision</p>
          <div className="mt-4">
            <ServiceSelector
              servicesByCategory={servicesByCategory}
              selectedServiceIds={selectedServiceIds}
              onToggleService={onToggleService}
            />
          </div>
        </section>
      )}

      {currentStep === 6 && (
        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-gray-900">Instance sizes</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Choose instance tiers for services that support sizing
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Pricing preview uses {pricingRegion}. Final pricing uses your selected region in step 8.
          </p>
          <div className="mt-4">
            <InstancePicker
              instanceServices={instanceServices}
              flatRateServices={flatRateServices}
              region={pricingRegion}
              selectedInstances={selectedInstances}
              onSelectInstance={onSelectInstance}
            />
          </div>
        </section>
      )}

      {currentStep === 7 && (
        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-gray-900">Permissions</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Roles are auto-assigned from IAM policy mappings
          </p>
          <div className="mt-4">
            <PermissionsPicker
              selectedServices={selectedServices}
              permissionOverrides={permissionOverrides}
              onPermissionChange={onPermissionChange}
            />
          </div>
        </section>
      )}

      {currentStep === 8 && (
        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-gray-900">Select AWS region</h2>
          <p className="mt-0.5 text-xs text-gray-400">Choose the region where lab resources will run</p>
          <div className="mt-4">
            <RegionPicker region={region} onRegionChange={onRegionChange} />
          </div>
        </section>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={currentStep === 1}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        {currentStep < 8 ? (
          <button
            type="button"
            onClick={onNext}
            className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717]"
          >
            Next
          </button>
        ) : null}
      </div>
    </div>
  );
}
