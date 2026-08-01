/** @type {import('next').NextConfig} */
import path from 'node:path';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
};

export default nextConfig;
