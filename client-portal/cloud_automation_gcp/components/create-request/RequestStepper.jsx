'use client';

import { Check } from 'lucide-react';

export const FORM_STEPS = [
  { id: 1, label: 'Project' },
  { id: 2, label: 'Usage' },
  { id: 3, label: 'Cleanup' },
  { id: 4, label: 'Budget' },
  { id: 5, label: 'Services' },
  { id: 6, label: 'Sizing' },
  { id: 7, label: 'Permissions' },
  { id: 8, label: 'Email' },
  { id: 9, label: 'Region' },
];

export const FORM_PHASES = [
  { id: 'project', label: 'Project details', steps: [1] },
  { id: 'schedule', label: 'Schedule & budget', steps: [2, 3, 4] },
  { id: 'services', label: 'Services & access', steps: [5, 6, 7] },
  { id: 'review', label: 'Review & submit', steps: [8, 9] },
];

export const FINAL_FORM_STEP = FORM_STEPS.length;

function phaseIsComplete(phase, currentStep) {
  return Math.max(...phase.steps) < currentStep;
}

function phaseIsActive(phase, currentStep) {
  return phase.steps.includes(currentStep);
}

export function RequestPhaseProgress({ currentStep, accent, soft }) {
  const completedPhases = FORM_PHASES.filter((phase) => phaseIsComplete(phase, currentStep)).length;
  const currentStepMeta = FORM_STEPS.find((step) => step.id === currentStep);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>
          Request progress
        </p>
        <p className="mt-0.5 text-sm text-gray-500">
          {completedPhases} of {FORM_PHASES.length} phases complete
          {currentStepMeta ? ` · Step ${currentStep} of ${FORM_STEPS.length}: ${currentStepMeta.label}` : ''}
        </p>
      </div>
      <ol className="grid grid-cols-2 gap-4 px-6 py-5 sm:grid-cols-4">
        {FORM_PHASES.map((phase, index) => {
          const done = phaseIsComplete(phase, currentStep);
          const active = phaseIsActive(phase, currentStep);

          return (
            <li key={phase.id} className="relative flex items-center gap-3">
              {index < FORM_PHASES.length - 1 ? (
                <span
                  className="absolute left-4 top-8 hidden h-px w-[calc(100%-1rem)] bg-gray-200 sm:block"
                  aria-hidden
                />
              ) : null}
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                  done ? 'text-white shadow-sm' : 'border border-gray-200 bg-white text-gray-400'
                }`}
                style={
                  done
                    ? { backgroundColor: accent }
                    : active
                      ? {
                          borderColor: accent,
                          color: accent,
                          backgroundColor: soft,
                        }
                      : undefined
                }
              >
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span
                className={`text-sm ${done || active ? 'font-medium text-gray-900' : 'text-gray-500'}`}
              >
                {phase.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function RequestStepper({ currentStep, maxReachableStep, onStepClick, compact = false }) {
  const completedCount = FORM_STEPS.filter((step) => step.id < currentStep).length;

  if (compact) {
    return (
      <nav aria-label="Request form steps" className="flex flex-wrap gap-2">
        {FORM_STEPS.map((step) => {
          const completed = step.id < currentStep;
          const active = step.id === currentStep;
          const reachable = step.id <= maxReachableStep;

          return (
            <button
              key={step.id}
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onStepClick(step.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? 'text-white shadow-sm'
                  : completed
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : reachable
                      ? 'border border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                      : 'border border-gray-100 bg-gray-50 text-gray-300'
              }`}
              style={active ? { backgroundColor: 'var(--cloud-accent, #B91C1C)' } : undefined}
            >
              {step.label}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Request form progress" className="w-full">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--cloud-accent, #B91C1C)' }}
          >
            Step navigation
          </p>
          <p className="mt-0.5 text-sm text-gray-500">
            Step {currentStep} of {FORM_STEPS.length}
            {completedCount > 0 ? ` · ${completedCount} completed` : ''}
          </p>
        </div>
        <span
          className="hidden rounded-full px-3 py-1 text-xs font-semibold ring-1 sm:inline"
          style={{
            backgroundColor: 'var(--cloud-accent-soft, #fef2f2)',
            color: 'var(--cloud-accent, #B91C1C)',
            borderColor: 'color-mix(in srgb, var(--cloud-accent, #B91C1C) 15%, transparent)',
          }}
        >
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
                      ? 'bg-[var(--cloud-accent,#B91C1C)] text-white shadow-sm'
                      : active
                        ? 'border-2 border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)] text-[var(--cloud-accent,#B91C1C)] shadow-sm'
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
                      ? 'font-semibold text-[var(--cloud-accent,#B91C1C)]'
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
                    completed ? 'bg-[var(--cloud-accent,#B91C1C)]' : 'bg-gray-200'
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
