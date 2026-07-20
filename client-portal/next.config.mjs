/** @type {import('next').NextConfig} */
// Prefer Docker-internal gateway for rewrites so SSR/proxy does not hairpin
// through the public Cloudflare hostname (which can return 1010/5xx).
const gatewayUrl = (
  process.env.GATEWAY_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

const nextConfig = {
  output: "standalone",
  eslint: {
    // Warnings (e.g. react-hooks/exhaustive-deps) must not fail production Docker builds
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      // Proxy to cloud-gateway, but keep local Next.js route handlers:
      // - /api/create-vm/* (Create VM catalog → remote catalog agent VM)
      // - /api/book-meet (website demo booking)
      {
        source: "/api/:path((?!create-vm(?:/|$)|book-meet(?:/|$)).*)",
        destination: `${gatewayUrl}/api/:path`,
      },
      {
        source: "/webhooks/:path*",
        destination: `${gatewayUrl}/webhooks/:path*`,
      },
    ];
  },
};

export default nextConfig;
