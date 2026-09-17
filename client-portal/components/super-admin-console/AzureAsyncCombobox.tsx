'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';

export interface AzureAsyncOption {
  id: string;
  label: string;
  sublabel?: string;
  value: string;
}

interface AzureAsyncComboboxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (option: AzureAsyncOption) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  options: AzureAsyncOption[];
  onSearch: (query: string) => void;
  validationMessage?: string | null;
  validationOk?: boolean;
  errorMessage?: string | null;
  emptyMessage?: string;
  required?: boolean;
  inputClassName?: string;
}

export function AzureAsyncCombobox({
  label,
  value,
  onChange,
  onSelect,
  placeholder,
  disabled,
  loading,
  options,
  onSearch,
  validationMessage,
  validationOk,
  errorMessage,
  emptyMessage = 'No matches — try a different search.',
  required,
  inputClassName,
}: AzureAsyncComboboxProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  function openDropdown() {
    if (disabled) return;
    onSearch(value);
    setOpen(true);
  }

  const base =
    inputClassName ||
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

  const borderClass =
    errorMessage || (validationMessage && validationOk === false)
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
      : validationOk
        ? 'border-green-300 focus:border-green-600 focus:ring-green-600/20'
        : '';

  const showDropdown =
    open && (loading || options.length > 0 || Boolean(errorMessage) || Boolean(value.trim()));

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={openDropdown}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className={`${base} pr-8 ${borderClass} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          autoComplete="off"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openDropdown())}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:opacity-40"
          aria-label="Toggle suggestions"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {showDropdown ? (
        <ul className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {loading ? (
            <li className="px-3 py-2 text-sm text-gray-500">Loading from Azure…</li>
          ) : errorMessage ? (
            <li className="px-3 py-2 text-sm text-red-600">{errorMessage}</li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">{emptyMessage}</li>
          ) : (
            options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-gray-50"
                  onMouseDown={() => {
                    onChange(option.value);
                    onSelect?.(option);
                    setOpen(false);
                  }}
                >
                  <span className="block text-sm text-gray-900">{option.label}</span>
                  {option.sublabel ? (
                    <span className="block text-xs text-gray-500">{option.sublabel}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {errorMessage && !open ? (
        <p className="mt-1 text-xs text-red-600">{errorMessage}</p>
      ) : null}
      {validationMessage ? (
        <p className={`mt-1 text-xs ${validationOk ? 'text-green-700' : 'text-red-600'}`}>
          {validationMessage}
        </p>
      ) : null}
    </div>
  );
}
