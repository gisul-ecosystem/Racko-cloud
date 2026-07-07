'use client';

import { AlertCircle } from 'lucide-react';
import { useEffect, useMemo } from 'react';
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

function formatWindowSummary(windows) {
  return windows
    .map((window) => {
      const day = USAGE_WINDOW_DAYS[window.dayOfWeek] ?? '?';
      const start = window.windowStartTime;
      const end = window.windowEndTime;
      const limit = window.dailyLimitHours;
      const limitText = limit ? ` (max ${limit}h)` : '';
      return `${day.slice(0, 3)} ${start}–${end}${limitText}`;
    })
    .join(', ');
}

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
  accessType,
  onAccessTypeChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  durationDays,
  enableDailyUsage,
  onEnableDailyUsageChange,
  usageWindows,
  onUsageWindowsChange,
  timezone,
  onTimezoneChange,
  enableResourceCleanup,
  onEnableResourceCleanupChange,
  resourceCleanupIntervalHours,
  onResourceCleanupIntervalHoursChange,
  budgetEnabled,
  onBudgetEnabledChange,
  perUserBudgetUsd,
  onPerUserBudgetUsdChange,
  permissionOverrides,
  onPermissionChange,
  validationErrors,
  availableRegions,
  regionsLoading,
  regionsError,
}) {
  useEffect(() => {
    if (!startDate || !endDate) return;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    onAccessTypeChange(days > 7 ? 'identity_center' : 'magic_link');
  }, [startDate, endDate, onAccessTypeChange]);

  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service._id)),
    [services, selectedServiceIds]
  );

  const instanceServices = selectedServices.filter((service) => service.pricingType === 'instance');
  const flatRateServices = selectedServices.filter((service) => service.pricingType === 'flat_rate');

  const toggleUsageWindowDay = (dayIndex, enabled) => {
    if (!enabled) {
      onUsageWindowsChange(usageWindows.filter((window) => window.dayOfWeek !== dayIndex));
      return;
    }

    onUsageWindowsChange([
      ...usageWindows.filter((window) => window.dayOfWeek !== dayIndex),
      {
        dayOfWeek: dayIndex,
        windowStartTime: '11:00',
        windowEndTime: '17:00',
        timezone,
        dailyLimitHours: undefined,
      },
    ]);
  };

  const updateUsageWindow = (dayIndex, patch) => {
    onUsageWindowsChange(
      usageWindows.map((window) =>
        window.dayOfWeek === dayIndex ? { ...window, ...patch } : window
      )
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-4 shadow-sm sm:px-5">
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
                required
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
                max={50}
                className={inputClass}
                value={accountCount}
                onChange={(event) => onAccountCountChange(Number(event.target.value))}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <span className={labelClass}>Access type</span>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onAccessTypeChange('magic_link')}
                  className={`rounded-lg border-2 p-4 text-left transition ${
                    accessType === 'magic_link'
                      ? 'border-[#B91C1C] bg-red-50/40'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900">🔗 Magic Link Access</div>
                  <p className="mt-1 text-xs text-gray-500">
                    Best for short labs (≤7 days). Admin generates one-click console links from the
                    manage portal. No password needed.
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-[#B91C1C]">
                    Max session: 12 hours per link
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => onAccessTypeChange('identity_center')}
                  className={`rounded-lg border-2 p-4 text-left transition ${
                    accessType === 'identity_center'
                      ? 'border-[#B91C1C] bg-red-50/40'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900">🔐 Direct IAM Login</div>
                  <p className="mt-1 text-xs text-gray-500">
                    Best for long labs (&gt;7 days). Users receive username and password and can sign
                    in directly to the AWS console for the full lab duration.
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-blue-800">
                    Persistent access for full lab duration
                  </p>
                </button>
              </div>

              {accessType === 'identity_center' && (
                <div className="mt-3 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  Each lab user gets an IAM account with a console username and password emailed
                  directly. Users can log in anytime during the lab — no MFA or activation flow.
                </div>
              )}

              {accessType === 'magic_link' && (
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Magic links expire after 12 hours. Regenerate links from the manage portal for
                  extended access.
                </div>
              )}
            </div>

            <div>
              <label className={labelClass} htmlFor="startDate">
                Service start date
              </label>
              <input
                id="startDate"
                type="datetime-local"
                className={inputClass}
                value={startDate}
                onChange={(event) => onStartDateChange(event.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="endDate">
                Service end date
              </label>
              <input
                id="endDate"
                type="datetime-local"
                className={inputClass}
                value={endDate}
                onChange={(event) => onEndDateChange(event.target.value)}
                required
              />
              {durationDays > 0 && (
                <p className="mt-1 text-xs text-gray-400">{durationDays} day{durationDays !== 1 ? 's' : ''}</p>
              )}
            </div>
          </div>
        </section>
      )}

      {currentStep === 2 && (
        <section className={sectionClass}>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={enableDailyUsage}
              onChange={(event) => {
                onEnableDailyUsageChange(event.target.checked);
                if (!event.target.checked) {
                  onUsageWindowsChange([]);
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
            />
            <span className="text-sm font-medium text-gray-900">Enable daily usage windows</span>
          </label>
          <p className="mt-1 text-xs text-gray-400">
            Set which days and hours lab users can access AWS
          </p>

          {enableDailyUsage && (
            <>
              <div className="mt-4 space-y-3">
                {USAGE_WINDOW_DAYS.map((day, index) => {
                  const existing = usageWindows.find((window) => window.dayOfWeek === index);
                  return (
                    <div
                      key={day}
                      className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex min-w-[132px] cursor-pointer items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={Boolean(existing)}
                            onChange={(event) => toggleUsageWindowDay(index, event.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                          />
                          <span className="text-sm font-medium text-gray-900">{day}</span>
                        </label>
                        {existing && (
                          <div className="flex flex-1 flex-wrap items-center gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="time"
                                value={existing.windowStartTime}
                                onChange={(event) =>
                                  updateUsageWindow(index, { windowStartTime: event.target.value })
                                }
                                className={timeInputClass}
                                aria-label={`${day} start time`}
                              />
                              <span className="text-xs text-gray-400">→</span>
                              <input
                                type="time"
                                value={existing.windowEndTime}
                                onChange={(event) =>
                                  updateUsageWindow(index, { windowEndTime: event.target.value })
                                }
                                className={timeInputClass}
                                aria-label={`${day} end time`}
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <label
                                className="text-xs font-medium text-gray-500"
                                htmlFor={`daily-limit-${index}`}
                              >
                                Max hours/day
                              </label>
                              <input
                                id={`daily-limit-${index}`}
                                type="number"
                                min={0.5}
                                max={24}
                                step={0.5}
                                placeholder="No limit"
                                value={existing.dailyLimitHours ?? ''}
                                onChange={(event) =>
                                  updateUsageWindow(index, {
                                    dailyLimitHours: event.target.value
                                      ? parseFloat(event.target.value)
                                      : undefined,
                                  })
                                }
                                className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm transition focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
                              />
                              {existing.dailyLimitHours ? (
                                <span className="text-xs text-gray-400">
                                  Users blocked + resources deleted after {existing.dailyLimitHours}h
                                  of usage
                                </span>
                              ) : null}
                            </div>
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
                  onChange={(event) => {
                    const nextTimezone = event.target.value;
                    onTimezoneChange(nextTimezone);
                    onUsageWindowsChange(
                      usageWindows.map((window) => ({ ...window, timezone: nextTimezone }))
                    );
                  }}
                >
                  <option value="Asia/Kolkata">IST — Asia/Kolkata</option>
                  <option value="Asia/Singapore">SGT — Asia/Singapore</option>
                  <option value="America/New_York">US/Eastern — America/New_York</option>
                  <option value="America/Los_Angeles">US/Pacific — America/Los_Angeles</option>
                  <option value="Europe/London">GMT — Europe/London</option>
                  <option value="UTC">UTC</option>
                  {COMMON_TIMEZONES.filter(
                    (entry) =>
                      ![
                        'Asia/Kolkata',
                        'Asia/Singapore',
                        'America/New_York',
                        'America/Los_Angeles',
                        'Europe/London',
                        'UTC',
                      ].includes(entry)
                  ).map((entry) => (
                    <option key={entry} value={entry}>
                      {entry.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {usageWindows.length > 0 && (
                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-900">
                  Users can access AWS on: {formatWindowSummary(usageWindows)}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {currentStep === 3 && (
        <section className={sectionClass}>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={enableResourceCleanup}
              onChange={(event) => {
                onEnableResourceCleanupChange(event.target.checked);
                if (!event.target.checked) {
                  onResourceCleanupIntervalHoursChange(undefined);
                } else if (!resourceCleanupIntervalHours) {
                  onResourceCleanupIntervalHoursChange(4);
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
            />
            <span className="text-sm font-medium text-gray-900">Enable periodic resource cleanup</span>
          </label>
          {enableResourceCleanup && (
            <div className="mt-4">
              <label className={labelClass} htmlFor="resourceCleanupIntervalHours">
                Delete all resources inside lab every (hours)
              </label>
              <input
                id="resourceCleanupIntervalHours"
                type="number"
                min={1}
                max={24}
                placeholder="e.g. 4"
                className={inputClass}
                value={resourceCleanupIntervalHours ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  onResourceCleanupIntervalHoursChange(
                    value ? Number.parseInt(value, 10) : undefined
                  );
                }}
              />
              <p className="mt-2 text-xs text-gray-500">
                Every {resourceCleanupIntervalHours || '?'} hour(s), all AWS resources (EC2
                instances, EKS clusters, RDS databases, S3 objects, etc.) inside the lab accounts
                will be automatically deleted. IAM users and account structure are kept — lab users
                can create new resources again immediately after cleanup.
              </p>
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                ⚠ This permanently deletes all resources in lab accounts on a timer. Lab users lose
                their work.
              </div>
            </div>
          )}
        </section>
      )}

      {currentStep === 4 && (
        <section className={sectionClass}>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={budgetEnabled}
              onChange={(event) => {
                onBudgetEnabledChange(event.target.checked);
                if (!event.target.checked) {
                  onPerUserBudgetUsdChange(undefined);
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
            />
            <span className="text-sm font-medium text-gray-900">Set per-user budget cap</span>
          </label>
          {budgetEnabled && (
            <div className="mt-4">
              <label className={labelClass} htmlFor="perUserBudgetUsd">
                Budget per user (USD)
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
                When a user&apos;s AWS spend exceeds this amount, their IAM lab account
                is automatically disabled and they receive an email notification. An admin must
                renew their budget to restore access.
              </p>
            </div>
          )}
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
            Choose instance tiers for services that support sizing (live AWS pricing)
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Preview uses {pricingRegion} until you select a region in step 8.
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
          <p className="mt-0.5 text-xs text-gray-400">
            Available regions based on your service and instance selections (live AWS pricing)
          </p>
          <div className="mt-4">
            <RegionPicker
              region={region}
              onRegionChange={onRegionChange}
              regions={availableRegions}
              loading={regionsLoading}
              error={regionsError}
            />
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
