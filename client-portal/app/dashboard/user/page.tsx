'use client';

import { useAuth } from '../../../context/AuthContext';
import { Server } from 'lucide-react';

export default function UserDashboard() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="max-w-screen-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="text-gray-500 text-sm mt-0.5">{user.email}</p>
      </div>

      {/* Placeholder — VM assignment coming soon */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-12 text-center">
        <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <Server className="w-7 h-7 text-blue-500" />
        </div>
        <p className="text-gray-700 font-medium">No VMs assigned yet</p>
        <p className="text-gray-400 text-sm mt-1">
          Your administrator will assign virtual machines to your account.
        </p>
      </div>
    </div>
  );
}
