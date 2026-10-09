/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Two servers sharing one build cache serve each other's stale chunks, so a
  // verification run can point its output somewhere else.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
