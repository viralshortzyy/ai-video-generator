/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // API routes use the Node.js runtime (needed for node:sqlite and ffmpeg).
  // Individual routes also declare `export const runtime = 'nodejs'`.
};

export default nextConfig;
