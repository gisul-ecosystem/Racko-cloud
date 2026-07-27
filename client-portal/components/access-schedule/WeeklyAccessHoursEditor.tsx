'use client';

import { Copy, Plus, Trash2 } from 'lucide-react';
import type { WeeklyAccessEditorValue } from '@/lib/accessSchedule';
import { listIanaTimezones } from '@/lib/accessSchedule';

const inputClass =
  'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500';

interface WeeklyAccessHoursEditorProps {
  value: WeeklyAccessEditorValue;
  onChange: (next: WeeklyAccessEditorValue) => void;
  disabled?: boolean;
  /** Hide outer date range when not needed */
  showDateRange?: boolean;
}

export function WeeklyAccessHoursEditor({
  value,
  onChange,
  disabled = false,
  showDateRange = true,
}: WeeklyAccessHoursEditorProps) {
  const timezones = listIanaTimezones();

  function updateDay(
    dayIndex: number,
    patch: Partial<WeeklyAccessEditorValue['days'][number]>
  ) {
    const days = value.days.map((d, i) => (i === dayIndex ? { ...d, ...patch } : d));
    onChange({ ...value, days });
  }

  function addWindow(dayIndex: number) {
    const day = value.days[dayIndex];
    if (!day) return;
    updateDay(dayIndex, {
      windows: [...day.windows, { start: '09:00', end: '17:00' }],
      enabled: true,
    });
  }

  function removeWindow(dayIndex: number, windowIndex: number) {
    const day = value.days[dayIndex];
    if (!day) return;
    const windows = day.windows.filter((_, i) => i !== windowIndex);
    updateDay(dayIndex, {
      windows,
      enabled: windows.length > 0 ? day.enabled : false,
    });
  }

  function copyToAllDays(sourceIndex: number) {
    const source = value.days[sourceIndex];
    if (!source) return;
    const days = value.days.map((d) => ({
      day: d.day,
      enabled: source.enabled,
      windows: source.windows.map((w) => ({ ...w })),
    }));
    onChange({ ...value, days });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-600">Timezone</span>
          <select
            value={value.timezone}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, timezone: e.target.value })}
            className={`${inputClass} min-w-[14rem]`}
          >
            {!timezones.includes(value.timezone) ? (
              <option value={value.timezone}>{value.timezone}</option>
            ) : null}
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>

        {showDateRange ? (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                Start date (optional)
              </span>
              <input
                type="date"
                value={value.startDate}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, startDate: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                End date (optional)
              </span>
              <input
                type="date"
                value={value.endDate}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, endDate: e.target.value })}
                className={inputClass}
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200">
        <ul className="divide-y divide-gray-100">
          {value.days.map((day, dayIndex) => (
            <li key={day.day} className="bg-white px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <label className="flex min-w-[7.5rem] cursor-pointer items-center gap-2 pt-1.5 text-sm font-medium text-gray-900">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    disabled={disabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      updateDay(dayIndex, {
                        enabled,
                        windows:
                          enabled && day.windows.length === 0
                            ? [{ start: '09:00', end: '17:00' }]
                            : enabled
                              ? day.windows
                              : [],
                      });
                    }}
                    className="rounded border-gray-300"
                  />
                  {day.day}
                </label>

                <div className="min-w-0 flex-1 space-y-2">
                  {day.enabled ? (
                    day.windows.map((win, wi) => (
                      <div key={wi} className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          value={win.start}
                          disabled={disabled}
                          onChange={(e) => {
                            const windows = day.windows.map((w, i) =>
                              i === wi ? { ...w, start: e.target.value } : w
                            );
                            updateDay(dayIndex, { windows });
                          }}
                          className={inputClass}
                        />
                        <span className="text-xs text-gray-400">to</span>
                        <input
                          type="time"
                          value={win.end}
                          disabled={disabled}
                          onChange={(e) => {
                            const windows = day.windows.map((w, i) =>
                              i === wi ? { ...w, end: e.target.value } : w
                            );
                            updateDay(dayIndex, { windows });
                          }}
                          className={inputClass}
                        />
                        <button
                          type="button"
                          disabled={disabled || day.windows.length <= 1}
                          onClick={() => removeWindow(dayIndex, wi)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                          title="Remove window"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="pt-1.5 text-xs text-gray-400">Day off</p>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-0.5">
                  {day.enabled ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => addWindow(dayIndex)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" />
                      Window
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => copyToAllDays(dayIndex)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    title="Copy this day to all days"
                  >
                    <Copy className="h-3 w-3" />
                    Copy to all
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
