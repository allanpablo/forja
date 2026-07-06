import Layout from '@/components/layout/layout';
import Link from 'next/link';

export default function Home() {
  return (
    <Layout>
      <div className="text-center py-16">
        <h1 className="text-4xl font-bold mb-4">Welcome to MonoStore</h1>
        <p className="text-xl text-gray-600 mb-8">
          A modern e-commerce platform built with Next.js, NestJS, and TypeScript
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/products"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Browse Products
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
          >
            Admin Dashboard
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-8 mt-16">
        <div className="text-center">
          <div className="text-3xl font-bold text-blue-600 mb-2">⚡</div>
          <h3 className="font-semibold">Fast Performance</h3>
          <p className="text-gray-600 text-sm mt-2">Built with Next.js 14 for optimal speed</p>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-blue-600 mb-2">🔒</div>
          <h3 className="font-semibold">Type Safe</h3>
          <p className="text-gray-600 text-sm mt-2">Full TypeScript end-to-end</p>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-blue-600 mb-2">📦</div>
          <h3 className="font-semibold">Monorepo</h3>
          <p className="text-gray-600 text-sm mt-2">Shared types and utilities</p>
        </div>
      </div>
    </Layout>
  );
}
