/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  eslint: {
    // Warnings (e.g. react-hooks/exhaustive-deps) must not fail production Docker builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;