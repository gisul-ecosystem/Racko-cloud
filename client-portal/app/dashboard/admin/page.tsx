'use client';

import { useAuth } from '../../../context/AuthContext';

export default function AdminDashboard() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your cloud infrastructure</p>
        </div>
        <button
          onClick={logout}
          className="bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition border border-gray-200 shadow-sm"
        >
          Sign out
        </button>
      </div>

      {/* User info card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
            {user.email[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-gray-900 font-medium">{user.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium border border-blue-200">
                Admin
              </span>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-gray-400 text-xs">
                {user.lastLoginAt
                  ? `Last login: ${new Date(user.lastLoginAt).toLocaleString()}`
                  : 'First login'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Virtual Machines', value: '—' },
          { label: 'Storage Used', value: '—' },
          { label: 'Account Status', value: 'Active' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <p className="text-gray-500 text-sm">{stat.label}</p>
            <p className="text-gray-900 text-2xl font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
