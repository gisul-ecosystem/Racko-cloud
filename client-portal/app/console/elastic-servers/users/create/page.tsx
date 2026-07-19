'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSingleUser, createBulkUsers, type BulkCreateResult } from '../../../../../lib/managedUsersApi';
import { ApiError } from '../../../../../lib/apiClient';
import { ArrowLeft, Download, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';

type Tab = 'single' | 'bulk';

// ─── Single user form ─────────────────────────────────────────────────────────

function SingleUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createSingleUser({ email, password });
      setSuccess(true);
      setTimeout(() => router.push('/console/elastic-servers/users'), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <CheckCircle className="w-12 h-12 text-green-500" />
        <p className="text-lg font-semibold text-gray-900">User created successfully</p>
        <p className="text-sm text-gray-500">Redirecting to users list...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-5">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="user@example.com"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Min 8 chars, upper, lower, number, symbol"
            className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">Must contain uppercase, lowercase, number, and special character.</p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition"
      >
        {loading ? 'Creating...' : 'Create User'}
      </button>
    </form>
  );
}

// ─── Bulk user form ───────────────────────────────────────────────────────────

function BulkUserForm() {
  const [emailPrefix, setEmailPrefix] = useState('');
  const [count, setCount] = useState(5);
  const [passwordMode, setPasswordMode] = useState<'shared' | 'auto'>('auto');
  const [sharedPassword, setSharedPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkCreateResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await createBulkUsers({
        emailPrefix,
        count,
        password: passwordMode === 'shared' ? sharedPassword : undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create users.');
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    if (!result) return;
    const rows = [
      ['Email', 'Password', 'Status'],
      ...result.users.map((u) => [u.email, u.password, u.status]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">
              <CheckCircle className="w-4 h-4" />
              {result.created} created
            </div>
            {result.failed > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-red-700 bg-red-50 px-3 py-1.5 rounded-lg">
                <XCircle className="w-4 h-4" />
                {result.failed} failed
              </div>
            )}
          </div>
          <button
            onClick={downloadCSV}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
        </div>

        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
          Save these credentials now — passwords are shown once and cannot be retrieved later.
        </p>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Password</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.users.map((u, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5 text-gray-900">{u.email}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{u.password}</td>
                  <td className="px-4 py-2.5">
                    {u.status === 'created' ? (
                      <span className="text-green-600 text-xs font-medium">Created</span>
                    ) : (
                      <span className="text-red-500 text-xs" title={u.error}>Failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={() => setResult(null)}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          Create more users
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-5">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Email prefix</label>
        <input
          type="email"
          value={emailPrefix}
          onChange={(e) => setEmailPrefix(e.target.value)}
          required
          placeholder="vmwareuser@gmail.com"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">
          Users will be created as vmwareuser1@gmail.com, vmwareuser2@gmail.com, etc.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Number of users</label>
        <input
          type="number"
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
          min={1}
          max={100}
          required
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
        <div className="flex gap-3 mb-3">
          <button
            type="button"
            onClick={() => setPasswordMode('auto')}
            className={`flex-1 py-2 text-sm rounded-lg border transition ${
              passwordMode === 'auto'
                ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Auto-generate
          </button>
          <button
            type="button"
            onClick={() => setPasswordMode('shared')}
            className={`flex-1 py-2 text-sm rounded-lg border transition ${
              passwordMode === 'shared'
                ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Same for all
          </button>
        </div>

        {passwordMode === 'auto' ? (
          <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
            A unique secure password will be generated for each user. You will see all passwords after creation.
          </p>
        ) : (
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={sharedPassword}
              onChange={(e) => setSharedPassword(e.target.value)}
              required={passwordMode === 'shared'}
              placeholder="Shared password for all users"
              className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition"
      >
        {loading ? `Creating ${count} users...` : `Create ${count} Users`}
      </button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateUserPage() {
  const [tab, setTab] = useState<Tab>('single');

  return (
    <div className="max-w-screen-xl">
      <div className="mb-6">
        <Link
          href="/console/elastic-servers/users"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Users
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create User</h1>
        <p className="text-gray-500 text-sm mt-0.5">Create a single user or bulk-provision multiple users at once</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {(['single', 'bulk'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-3.5 text-sm font-medium transition border-b-2 -mb-px ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {t === 'single' ? 'Single User' : 'Bulk Create'}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'single' ? <SingleUserForm /> : <BulkUserForm />}
        </div>
      </div>
    </div>
  );
}
