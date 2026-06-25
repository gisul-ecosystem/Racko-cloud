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
    <nav aria-label="Request form progress" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1">
        {FORM_STEPS.map((step, index) => {
          const completed = step.id < currentStep;
          const active = step.id === currentStep;
          const reachable = step.id <= maxReachableStep;
          const showConnector = index < FORM_STEPS.length - 1;

          return (
            <li key={step.id} className="flex items-center">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onStepClick(step.id)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'text-[#B91C1C]'
                    : completed
                      ? 'text-gray-700 hover:text-[#B91C1C]'
                      : reachable
                        ? 'text-gray-500 hover:text-gray-700'
                        : 'cursor-not-allowed text-gray-300'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    active
                      ? 'border-[#B91C1C] bg-[#B91C1C] text-white'
                      : completed
                        ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                        : 'border-gray-200 bg-white text-gray-400'
                  }`}
                >
                  {completed ? <Check className="h-3.5 w-3.5" /> : step.id}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </button>
              {showConnector && (
                <span
                  className={`mx-1 hidden h-px w-4 sm:block ${
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
