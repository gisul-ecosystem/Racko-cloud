'use client';

import { Check } from 'lucide-react';

export const FORM_STEPS = [
  { id: 1, label: 'Customer' },
  { id: 2, label: 'Usage' },
  { id: 3, label: 'Cleanup' },
  { id: 4, label: 'Budget' },
  { id: 5, label: 'Services' },
  { id: 6, label: 'Instances' },
  { id: 7, label: 'Permissions' },
  { id: 8, label: 'Region' },
];

export function RequestStepper({ currentStep, maxReachableStep, onStepClick }) {
  const completedCount = FORM_STEPS.filter((step) => step.id < currentStep).length;

  return (
    <nav aria-label="Request form progress" className="w-full">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
            Request progress
          </p>
          <p className="mt-0.5 text-sm text-gray-500">
            Step {currentStep} of {FORM_STEPS.length}
            {completedCount > 0 ? ` · ${completedCount} completed` : ''}
          </p>
        </div>
        <span className="hidden rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-[#B91C1C] ring-1 ring-[#B91C1C]/10 sm:inline">
          {FORM_STEPS[currentStep - 1]?.label}
        </span>
      </div>

      <ol className="flex w-full items-start overflow-x-auto pb-1">
        {FORM_STEPS.map((step, index) => {
          const completed = step.id < currentStep;
          const active = step.id === currentStep;
          const reachable = step.id <= maxReachableStep;
          const showConnector = index < FORM_STEPS.length - 1;

          return (
            <li key={step.id} className="flex min-w-[4.5rem] flex-1 items-start sm:min-w-0">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onStepClick(step.id)}
                title={step.label}
                className={`flex w-full min-w-0 flex-col items-center px-0.5 transition ${
                  reachable ? 'cursor-pointer' : 'cursor-not-allowed'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                    completed
                      ? 'bg-[#B91C1C] text-white shadow-sm'
                      : active
                        ? 'border-2 border-[#B91C1C] bg-red-50 text-[#B91C1C] shadow-sm'
                        : reachable
                          ? 'border-2 border-gray-200 bg-white text-gray-500'
                          : 'border-2 border-gray-100 bg-gray-50 text-gray-300'
                  }`}
                >
                  {completed ? <Check className="h-4 w-4" /> : step.id}
                </span>
                <span
                  className={`mt-2 max-w-full truncate text-center text-[10px] font-medium leading-tight sm:text-xs ${
                    active
                      ? 'font-semibold text-[#B91C1C]'
                      : completed
                        ? 'text-gray-700'
                        : reachable
                          ? 'text-gray-500'
                          : 'text-gray-300'
                  }`}
                >
                  {step.label}
                </span>
              </button>

              {showConnector ? (
                <div
                  aria-hidden="true"
                  className={`mx-0.5 mt-[1.125rem] h-0.5 min-w-[8px] flex-1 shrink rounded-full ${
                    completed ? 'bg-[#B91C1C]' : 'bg-gray-200'
                  }`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
