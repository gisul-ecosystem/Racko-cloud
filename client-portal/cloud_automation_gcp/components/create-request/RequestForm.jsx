'use client';

import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Shield } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import {
  RACKO_BTN_PRIMARY,
  RACKO_BTN_SECONDARY,
} from '../../../components/console/cloudButtonStyles';
import { COMMON_TIMEZONES } from '../../constants';
import {
  checkboxClass,
  inputClass,
  inputDisabledClass,
  labelClass,
  optionCardClass,
  sectionClass,
  timeInputClass,
} from './formStyles';
import { InstancePicker } from './InstancePicker';
import { PermissionsPicker } from './PermissionsPicker';
import { RegionPicker } from './RegionPicker';
import { FINAL_FORM_STEP, RequestStepper } from './RequestStepper';
import { SectionHeader } from './SectionHeader';
import { ServiceSelector } from './ServiceSelector';
import {
  clampTestIdsAccountCount,
  TEST_IDS_MAX_ACCOUNT_COUNT,
} from '../../utils/requestForm';

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
  projectName,
  onProjectNameChange,
  idMode,
  onIdModeChange,
  purchaseConvertMode = false,
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
  resourceCleanupTime,
  onResourceCleanupTimeChange,
  resourceCleanupTimezone,
  onResourceCleanupTimezoneChange,
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
  privilegedRoleOpen = false,
  onPrivilegedRoleOpenChange,
  privilegedRoles = [],
  privilegedRolesLoading = false,
  selectedPrivilegedRole = '',
  onSelectedPrivilegedRoleChange,
  onSubmitPrivilegedRoleRequest,
  privilegedRoleSubmitting = false,
  privilegedRoleSubmitted = false,
  privilegedRoleMessage = null,
  privilegedRoleMessageType = null,
}) {
  const isTestIds = idMode === 'test_ids';

  useEffect(() => {
    if (isTestIds || !startDate || !endDate) return;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    onAccessTypeChange(days > 7 ? 'cloud_identity' : 'magic_link');
  }, [startDate, endDate, onAccessTypeChange, isTestIds]);

  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service._id)),
    [services, selectedServiceIds]
  );

  const instanceServices = useMemo(
    () => selectedServices.filter((service) => service.pricingType === 'instance'),
    [selectedServices]
  );
  const flatRateServices = useMemo(
    () => selectedServices.filter((service) => service.pricingType === 'flat_rate'),
    [selectedServices]
  );

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
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="h-0.5 bg-gradient-to-r from-[var(--cloud-accent,#B91C1C)] to-[var(--cloud-accent,#B91C1C)]" />
        <div className="px-4 py-5 sm:px-6">
          <RequestStepper
            currentStep={currentStep}
            maxReachableStep={maxReachableStep}
            onStepClick={onStepClick}
          />
        </div>
      </div>

      {(validationErrors.length > 0 || stepErrors.length > 0) && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-800">Please fix the following</p>
              <ul className="mt-2 space-y-1 text-sm text-red-700">
                {[...stepErrors, ...validationErrors].map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={1}
              title="Project details"
              description="Name the lab, choose Gcp ID type, then set the service window and account count."
            />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="projectName">
                Project name
              </label>
              <input
                id="projectName"
                type="text"
                className={inputClass}
                value={projectName}
                onChange={(event) => onProjectNameChange(event.target.value)}
                placeholder="e.g. Contoso Gcp Lab"
                maxLength={120}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <span className={labelClass}>Gcp ID type</span>
              {purchaseConvertMode ? (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  Purchasing full Gcp IDs from your test lab. Services and permissions stay the same
                  as the test request.
                </div>
              ) : (
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onIdModeChange('test_ids')}
                    className={optionCardClass(idMode === 'test_ids')}
                  >
                    <div className="text-sm font-semibold text-gray-900">Gcp test_ids</div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500">
                      Short test labs with fixed defaults: up to 5 accounts, 24-hour window, $10 budget,
                      and resource cleanup every 24 hours.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onIdModeChange('gcp_ids')}
                    className={optionCardClass(idMode === 'gcp_ids')}
                  >
                    <div className="text-sm font-semibold text-gray-900">Gcp IDs</div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500">
                      Standard provisioning with full control over account count, duration, cleanup,
                      and daily usage windows.
                    </p>
                  </button>
                </div>
              )}
            </div>

            {idMode === 'gcp_ids' && (
              <div className="sm:col-span-2">
                <span className={labelClass}>Access type</span>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onAccessTypeChange('magic_link')}
                    className={optionCardClass(accessType === 'magic_link')}
                  >
                    <div className="text-sm font-semibold text-gray-900">Magic link access</div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500">
                      Best for short labs (≤7 days). Admin generates one-click console links from the
                      manage portal. No password needed.
                    </p>
                    <p className="mt-2 text-[11px] font-semibold text-[var(--cloud-accent,#B91C1C)]">
                      Max session: 12 hours per link
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => onAccessTypeChange('cloud_identity')}
                    className={optionCardClass(accessType === 'cloud_identity')}
                  >
                    <div className="text-sm font-semibold text-gray-900">Direct IAM login</div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500">
                      Best for long labs (&gt;7 days). Users receive username and password and can sign
                      in directly to the Gcp console for the full lab duration.
                    </p>
                    <p className="mt-2 text-[11px] font-semibold text-blue-700">
                      Persistent access for full lab duration
                    </p>
                  </button>
                </div>

                {accessType === 'cloud_identity' && (
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
            )}

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
                className={isTestIds ? inputDisabledClass : inputClass}
                value={endDate}
                onChange={(event) => onEndDateChange(event.target.value)}
                disabled={isTestIds}
                required
              />
              {isTestIds ? (
                <p className="mt-1 text-xs text-gray-500">
                  End date is fixed at 24 hours after the start for test_ids.
                </p>
              ) : durationDays > 0 ? (
                <p className="mt-1 text-xs text-gray-400">{durationDays} day{durationDays !== 1 ? 's' : ''}</p>
              ) : null}
            </div>

            {idMode ? (
              <div>
                <label className={labelClass} htmlFor="accountCount">
                  Account count
                </label>
                <input
                  id="accountCount"
                  type="number"
                  min={1}
                  max={isTestIds ? TEST_IDS_MAX_ACCOUNT_COUNT : 50}
                  className={inputClass}
                  value={accountCount}
                  onChange={(event) => {
                    const raw = Number(event.target.value);
                    onAccountCountChange(isTestIds ? clampTestIdsAccountCount(raw) : raw);
                  }}
                  required
                />
                {isTestIds ? (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Select 1–{TEST_IDS_MAX_ACCOUNT_COUNT} accounts for Gcp test_ids.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          </div>
        </section>
      )}

      {currentStep === 2 && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={2}
              title="Daily usage windows"
              description={
                isTestIds
                  ? 'Disabled for Gcp test_ids.'
                  : 'Optionally restrict which days and hours lab users can access Gcp.'
              }
            />
            {isTestIds ? (
              <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Daily usage windows are turned off for test IDs. Users can access the lab for the full
                24-hour window.
              </div>
            ) : (
            <div className="mt-6">
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
              className={checkboxClass}
            />
            <span className="text-sm font-medium text-gray-900">Enable daily usage windows</span>
          </label>
          <p className="mt-1 text-xs text-gray-400">
            Set which days and hours lab users can access Gcp
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
                            className={checkboxClass}
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
                                className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm transition focus:border-[var(--cloud-accent,#B91C1C)] focus:outline-none focus:ring-1 focus:ring-[var(--cloud-accent,#B91C1C)]"
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
                  Users can access Gcp on: {formatWindowSummary(usageWindows)}
                </div>
              )}
            </>
          )}
            </div>
            )}
          </div>
        </section>
      )}

      {currentStep === 3 && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={3}
              title="Resource cleanup"
              description="Automatically clean up lab resources once per day at a time you choose."
            />
            <div className="mt-6">
          {isTestIds ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Daily resource cleanup is enabled for test IDs. All Gcp resources inside lab accounts
                are deleted once per day at the time you select.
              </div>
              <div>
                <label className={labelClass} htmlFor="resourceCleanupTime">
                  Delete all resources inside lab daily at
                </label>
                <input
                  id="resourceCleanupTime"
                  type="time"
                  className={inputClass}
                  value={resourceCleanupTime}
                  onChange={(event) => onResourceCleanupTimeChange(event.target.value)}
                  required
                />
                <p className="mt-2 text-xs text-gray-500">
                  Choose when lab resources are cleaned up each day.
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor="resourceCleanupTimezone">
                  Cleanup timezone
                </label>
                <select
                  id="resourceCleanupTimezone"
                  className={inputClass}
                  value={resourceCleanupTimezone}
                  onChange={(event) => onResourceCleanupTimezoneChange(event.target.value)}
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
            </div>
          ) : (
          <>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={enableResourceCleanup}
              onChange={(event) => {
                onEnableResourceCleanupChange(event.target.checked);
                if (!event.target.checked) {
                  onResourceCleanupTimeChange('');
                }
              }}
              className={checkboxClass}
            />
            <span className="text-sm font-medium text-gray-900">Enable daily resource cleanup</span>
          </label>
          {enableResourceCleanup && (
            <div className="mt-4 space-y-4">
              <div>
                <label className={labelClass} htmlFor="resourceCleanupTime">
                  Delete all resources inside lab daily at
                </label>
                <input
                  id="resourceCleanupTime"
                  type="time"
                  className={inputClass}
                  value={resourceCleanupTime}
                  onChange={(event) => onResourceCleanupTimeChange(event.target.value)}
                  required
                />
                <p className="mt-2 text-xs text-gray-500">
                  Runs daily at this time in {resourceCleanupTimezone.replace(/_/g, ' ')}.
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor="resourceCleanupTimezone">
                  Cleanup timezone
                </label>
                <select
                  id="resourceCleanupTimezone"
                  className={inputClass}
                  value={resourceCleanupTimezone}
                  onChange={(event) => onResourceCleanupTimezoneChange(event.target.value)}
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
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                ⚠ This permanently deletes all resources in lab accounts on a daily schedule. Lab users lose
                their work at the selected time.
              </div>
            </div>
          )}
          </>
          )}
            </div>
          </div>
        </section>
      )}

      {currentStep === 4 && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={4}
              title="Budget cap"
              description={
                isTestIds
                  ? 'Default $10 spending cap for Gcp test_ids.'
                  : 'Optionally disable lab users when their Gcp spend exceeds a limit.'
              }
            />
            <div className="mt-6">
          {isTestIds ? (
            <div>
              <label className={labelClass} htmlFor="perUserBudgetUsd">
                Budget per user (USD)
              </label>
              <input
                id="perUserBudgetUsd"
                type="number"
                min={1}
                step={0.01}
                className={inputDisabledClass}
                value={perUserBudgetUsd ?? ''}
                disabled
              />
              <p className="mt-2 text-xs text-gray-500">
                Fixed at $10 per user for Gcp test_ids labs.
              </p>
            </div>
          ) : (
          <>
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
              className={checkboxClass}
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
                When a user&apos;s Gcp spend exceeds this amount, their IAM lab account
                is automatically disabled and they receive an email notification. An admin must
                renew their budget to restore access.
              </p>
            </div>
          )}
          </>
          )}
            </div>
          </div>
        </section>
      )}

      {currentStep === 5 && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={5}
              title="Services"
              description="Select one or more Gcp services to provision in the lab."
            />
            <div className="mt-6">
            <ServiceSelector
              servicesByCategory={servicesByCategory}
              selectedServiceIds={selectedServiceIds}
              onToggleService={onToggleService}
            />
            </div>
          </div>
        </section>
      )}

      {currentStep === 6 && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={6}
              title="Instances & usage estimates"
              description={`Choose instance sizes for compute services and lab usage tiers for GB/request-based services. Preview uses ${pricingRegion} until you pick a region in step ${FINAL_FORM_STEP}.`}
            />
            <div className="mt-6">
            <InstancePicker
              instanceServices={instanceServices}
              flatRateServices={flatRateServices}
              region={pricingRegion}
              selectedInstances={selectedInstances}
              onSelectInstance={onSelectInstance}
            />
            </div>
          </div>
        </section>
      )}

      {currentStep === 7 && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={7}
              title="Permissions"
              description="IAM policies are auto-assigned from service mappings. Adjust overrides if needed."
            />
            <div className="mt-6">
            <PermissionsPicker
              selectedServices={selectedServices}
              permissionOverrides={permissionOverrides}
              onPermissionChange={onPermissionChange}
            />
            </div>
          </div>
        </section>
      )}

      {currentStep === 8 && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={8}
              title="Customer email"
              description="Credentials and lab access details will be sent to this address."
            />
            <div className="mt-6">
              <label className={labelClass} htmlFor="customerEmail">
                Email ID
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

            {typeof onPrivilegedRoleOpenChange === 'function' && (
              <div className="mt-6 border-t border-gray-100 pt-5">
                <button
                  type="button"
                  onClick={() => onPrivilegedRoleOpenChange(!privilegedRoleOpen)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                      <Shield className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="block text-sm font-semibold text-gray-900">
                        Request privileged roles
                      </span>
                      <span className="text-xs text-gray-500">
                        Managed IAM packs (AdministratorAccess excluded) — sent to Lab Management
                        for approval
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-gray-400 transition ${privilegedRoleOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {privilegedRoleOpen && (
                  <div className="mt-4 space-y-4 rounded-xl border border-violet-200/80 bg-violet-50/40 p-5">
                    <div>
                      <label className={labelClass} htmlFor="privilegedRoleSelect">
                        Privileged role
                      </label>
                      <select
                        id="privilegedRoleSelect"
                        className={inputClass}
                        value={selectedPrivilegedRole}
                        onChange={(event) => onSelectedPrivilegedRoleChange?.(event.target.value)}
                        disabled={privilegedRolesLoading}
                      >
                        <option value="">
                          {privilegedRolesLoading ? 'Loading roles…' : 'Select a role'}
                        </option>
                        {privilegedRoles.map((role) => (
                          <option key={role.key || role.name} value={role.name}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-gray-600">
                        AdministratorAccess is excluded. Org admin must approve before the policy is
                        attached to all lab users.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      {privilegedRoleSubmitted ? (
                        <button
                          type="button"
                          disabled
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-600 px-4 py-2.5 text-sm font-semibold text-white sm:w-auto"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Request sent
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onSubmitPrivilegedRoleRequest}
                          disabled={privilegedRoleSubmitting || !selectedPrivilegedRole}
                          className={`${RACKO_BTN_PRIMARY} w-full sm:w-auto sm:min-w-[148px]`}
                        >
                          {privilegedRoleSubmitting ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Submitting…
                            </>
                          ) : (
                            'Submit request'
                          )}
                        </button>
                      )}

                      {privilegedRoleSubmitted ? (
                        <span className="text-xs font-medium text-green-700">
                          Pending org-admin approval
                        </span>
                      ) : null}
                    </div>

                    {privilegedRoleSubmitted && privilegedRoleMessage ? (
                      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                        <p className="text-sm text-green-800">{privilegedRoleMessage}</p>
                      </div>
                    ) : null}

                    {!privilegedRoleSubmitted &&
                    privilegedRoleMessage &&
                    privilegedRoleMessageType === 'error' ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                        <p className="text-sm text-red-800">{privilegedRoleMessage}</p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {currentStep === 9 && (
        <section className={sectionClass}>
          <div className="p-6">
            <SectionHeader
              step={9}
              title="Gcp region"
              description="Regions with live pricing for your selected services and instances."
            />
            <div className="mt-6">
            <RegionPicker
              region={region}
              onRegionChange={onRegionChange}
              regions={availableRegions}
              loading={regionsLoading}
              error={regionsError}
            />
            </div>
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={currentStep === 1}
            className={RACKO_BTN_SECONDARY}
          >
            Back
          </button>
          {currentStep < FINAL_FORM_STEP ? (
            <button type="button" onClick={onNext} className={RACKO_BTN_PRIMARY}>
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
