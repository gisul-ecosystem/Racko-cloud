'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

function roleLabel(role: string | undefined) {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  if (role === 'user') return 'User';
  return 'Account';
}

function roleBadgeClass(role: string | undefined) {
  if (role === 'super_admin') return 'bg-purple-100 text-purple-700';
  if (role === 'admin') return 'bg-blue-100 text-blue-700';
  return 'bg-green-100 text-green-700';
}

function UserAvatar({ email, size = 'md' }: { email: string; size?: 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-8 w-8 text-xs';
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#B91C1C] font-bold text-white ${sizeClass}`}
    >
      {email[0]?.toUpperCase() ?? 'A'}
    </div>
  );
}

export function ConsoleProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!user) return null;

  const label = roleLabel(user.role);

  return (
    <div ref={containerRef} className="relative ml-1 border-l border-gray-200 pl-3">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-gray-50"
      >
        <div className="hidden min-w-0 text-right sm:block">
          <p className="max-w-[180px] truncate text-xs font-medium text-gray-900">{user.email}</p>
          <p className="text-[11px] font-semibold text-gray-500">{label}</p>
        </div>
        <UserAvatar email={user.email} />
        <ChevronDown
          className={`hidden h-4 w-4 text-gray-400 transition sm:block ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Racko</span>
            <button
              type="button"
              onClick={() => void logout()}
              className="text-sm font-medium text-gray-700 transition hover:text-[#B91C1C]"
            >
              Sign out
            </button>
          </div>

          <div className="flex gap-4 px-4 py-4">
            <UserAvatar email={user.email} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{user.email}</p>
              <p className="mt-0.5 truncate text-xs text-gray-500">{user.email}</p>
              <span
                className={`mt-2 inline-block rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass(user.role)}`}
              >
                {label}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
