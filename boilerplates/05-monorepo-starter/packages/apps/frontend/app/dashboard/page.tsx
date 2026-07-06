'use client';

import Layout from '@/components/layout/layout';

export default function DashboardPage() {
  return (
    <Layout>
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
            <div className="text-3xl font-bold text-blue-600">142</div>
            <p className="text-gray-600 mt-2">Total Orders</p>
          </div>
          <div className="bg-green-50 p-6 rounded-lg border border-green-200">
            <div className="text-3xl font-bold text-green-600">$12,450</div>
            <p className="text-gray-600 mt-2">Total Revenue</p>
          </div>
        </div>

        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <button className="w-full text-left px-4 py-2 bg-white border border-gray-200 rounded hover:bg-gray-50">
              ➕ Add New Product
            </button>
            <button className="w-full text-left px-4 py-2 bg-white border border-gray-200 rounded hover:bg-gray-50">
              📊 View Analytics
            </button>
            <button className="w-full text-left px-4 py-2 bg-white border border-gray-200 rounded hover:bg-gray-50">
              👥 Manage Users
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
