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
  return (
    <nav aria-label="Request form progress" className="w-full">
      <ol className="flex w-full items-start">
        {FORM_STEPS.map((step, index) => {
          const completed = step.id < currentStep;
          const active = step.id === currentStep;
          const reachable = step.id <= maxReachableStep;
          const showConnector = index < FORM_STEPS.length - 1;

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-start">
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
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    completed
                      ? 'bg-[#B91C1C] text-white'
                      : active
                        ? 'border-2 border-[#B91C1C] text-[#B91C1C]'
                        : 'border-2 border-gray-200 text-gray-400'
                  }`}
                >
                  {completed ? <Check className="h-4 w-4" /> : step.id}
                </span>
                <span
                  className={`mt-1.5 max-w-full truncate text-center text-[10px] font-medium leading-tight sm:text-xs ${
                    active
                      ? 'text-[#B91C1C]'
                      : completed
                        ? 'text-gray-600'
                        : reachable
                          ? 'text-gray-500'
                          : 'text-gray-300'
                  }`}
                >
                  {step.label}
                </span>
              </button>

              {showConnector && (
                <div
                  aria-hidden="true"
                  className={`mx-1 mt-4 h-0.5 min-w-[6px] flex-1 shrink ${
                    completed ? 'bg-[#B91C1C]' : 'bg-gray-200'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
