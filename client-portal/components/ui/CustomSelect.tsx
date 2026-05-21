"use client";

import { useEffect, useRef, useState } from "react";

interface CustomSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[] | string[];
  placeholder: string;
  error?: string;
  required?: boolean;
  id?: string;
  className?: string;
}

export default function CustomSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  required,
  id,
  className = "",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Normalize options to always have value/label structure
  const normalizedOptions = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  const selectedLabel = normalizedOptions.find((option) => option.value === value)?.label;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#6B6B6B]"
        >
          {label}
        </label>
      )}

      <button
        type="button"
        id={id}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between rounded-[4px] bg-[rgba(255,255,255,0.04)] px-[14px] py-[11px] text-left transition-colors duration-150 ${
          error
            ? "border border-[rgba(239,68,68,0.6)]"
            : isOpen
              ? "border border-[rgba(185,28,28,0.5)]"
              : "border border-[rgba(255,255,255,0.1)]"
        }`}
        aria-required={required}
        aria-invalid={!!error}
      >
        <span className={`font-sans text-[14px] ${value ? "text-white" : "text-[#3D3D3D]"}`}>
          {selectedLabel ?? placeholder}
        </span>
        <span
          className={`text-xs leading-none text-[#6B6B6B] transition-transform duration-200 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        >
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[120] max-h-[240px] overflow-y-auto overflow-x-hidden rounded-[4px] border border-[rgba(255,255,255,0.1)] bg-[#1A1A1A] shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {normalizedOptions.map((option, index) => {
            const isSelected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between px-[14px] py-2.5 text-left transition-colors duration-150 ${
                  isSelected
                    ? "bg-[rgba(185,28,28,0.1)]"
                    : "bg-transparent hover:bg-[rgba(255,255,255,0.06)]"
                } ${index < normalizedOptions.length - 1 ? "border-b border-[rgba(255,255,255,0.05)]" : ""}`}
              >
                <span className={`font-sans text-[13px] ${isSelected ? "text-white" : "text-[#A1A1A1]"}`}>
                  {option.label}
                </span>
                {isSelected && <span className="text-xs font-bold text-[#B91C1C]">✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="mt-1 text-[11px] text-[#EF4444]">{error}</p>}
    </div>
  );
}
