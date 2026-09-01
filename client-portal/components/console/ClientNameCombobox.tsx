'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';

interface ClientNameComboboxProps {
  value: string;
  onChange: (v: string) => void;
  clientNames: string[];
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
  /** Set false in edit forms so typing a new name doesn't show '+ Create' — just type and save. */
  showCreate?: boolean;
}

export function ClientNameCombobox({
  value,
  onChange,
  clientNames,
  required,
  disabled,
  placeholder = 'Select or create a client',
  inputClassName,
  showCreate = true,
}: ClientNameComboboxProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmed = value.trim();
  const q = trimmed.toLowerCase();

  const suggestions = clientNames
    .filter((n) => !q || n.toLowerCase().includes(q))
    .slice(0, 20);

  // Show "+ Create" only when the typed value doesn't exactly match an existing name
  const exactMatch = clientNames.some((n) => n.toLowerCase() === q);
  const showCreateOption = showCreate && trimmed.length > 0 && !exactMatch;

  // Close on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const base =
    inputClassName ||
    'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]';

  const dropdownVisible = open && (suggestions.length > 0 || showCreateOption);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className={`${base} pr-8 ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          autoComplete="off"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:opacity-40"
          aria-label="Toggle client name dropdown"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {dropdownVisible && (
        <ul className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {/* Existing matching clients */}
          {suggestions.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                onMouseDown={() => {
                  onChange(name);
                  setOpen(false);
                }}
              >
                {name}
              </button>
            </li>
          ))}

          {/* Divider between existing and create */}
          {suggestions.length > 0 && showCreateOption && (
            <li className="mx-2 my-1 border-t border-gray-100" />
          )}

          {/* Create new client option */}
          {showCreateOption && (
            <li>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#B91C1C] hover:bg-red-50"
                onMouseDown={() => {
                  onChange(trimmed);
                  setOpen(false);
                }}
              >
                <Plus className="h-3.5 w-3.5 flex-shrink-0" />
                Create &quot;{trimmed}&quot;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
