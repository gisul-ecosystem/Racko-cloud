/** @type {import('next').NextConfig} */
// Prefer Docker-internal gateway for rewrites so SSR/proxy does not hairpin
// through the public Cloudflare hostname (which can return 1010/5xx).
const gatewayUrl = (
  process.env.GATEWAY_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

// ─── Security headers (VAPT findings F1–F7) ───────────────────────────────────
// Applied to every route served by Next.js.
// TLS 1.0/1.1 (F8) must be disabled in Cloudflare dashboard:
//   SSL/TLS → Edge Certificates → Minimum TLS Version → TLS 1.2

// 'unsafe-eval' is needed in dev mode only — webpack hot-reload (react-refresh)
// uses eval() internally. Production builds do not use eval.
const isDev = process.env.NODE_ENV === "development";

// Long-running provision calls hit the gateway directly (bypass Next rewrites).
// Allow that origin in connect-src so CSP does not surface as "Failed to fetch".
const directGatewayConnectSrc = (() => {
  const browserGatewayUrl = (
    process.env.NEXT_PUBLIC_GATEWAY_URL ||
    "http://localhost:8000"
  ).replace(/\/$/, "");

  try {
    const url = new URL(browserGatewayUrl);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return `${url.origin} ${url.protocol === "https:" ? "wss" : "ws"}://${url.host}`;
    }
  } catch {
    // ignore invalid NEXT_PUBLIC_GATEWAY_URL
  }
  return "";
})();

const securityHeaders = [
  // F1 — HSTS: force HTTPS for 1 year, include subdomains, allow preload list
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  // F2 — CSP: restrict resource loading to same origin; block framing
  // Note: 'unsafe-inline' is required for Next.js inline styles/scripts.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com"
        : "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      [
        "connect-src 'self'",
        "https://api-dev.racko.ai https://api-qa.racko.ai https://api-uat.racko.ai https://api.racko.ai",
        "wss://api-dev.racko.ai wss://api-qa.racko.ai wss://api-uat.racko.ai wss://api.racko.ai",
        "https://storage.gisul.co.in",
        directGatewayConnectSrc,
      ]
        .filter(Boolean)
        .join(" "),
      // Guacamole VM console domains across all environments — iframes load from these.
      // frame-ancestors 'none' blocks THIS page from being embedded elsewhere (anti-clickjack).
      "frame-src 'self' https://guac.racko.ai https://dev-guac.racko.ai https://qa-guac.racko.ai https://uat-guac.racko.ai",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  // F3 — X-Frame-Options: block all framing (clickjacking protection)
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // F4 — Referrer-Policy: send origin only on same-origin, nothing cross-origin
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // F5 — Permissions-Policy: disable unused browser features
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  // F6 — X-Content-Type-Options: prevent MIME-type sniffing
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
];

const nextConfig = {
  output: "standalone",

  // F7 — Remove X-Powered-By: Next.js header (framework disclosure)
  poweredByHeader: false,

  eslint: {
    // Warnings (e.g. react-hooks/exhaustive-deps) must not fail production Docker builds
    ignoreDuringBuilds: true,
  },

  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },

  async rewrites() {
    return [
      // Proxy to cloud-gateway, but keep local Next.js route handlers:
      // - /api/create-vm/* (Create VM catalog → remote catalog agent VM)
      // - /api/book-meet (website demo booking)
      // SSE streams are excluded — Next.js HTTP proxy buffers responses and
      // cannot stream SSE. The frontend calls these directly via getSseGatewayBaseUrl()
      // which resolves to the public API hostname (api-dev.racko.ai etc).
      {
        source: "/api/:path((?!create-vm(?:/|$)|book-meet(?:/|$)|v1/machines/push-stream/|v1/machines/reset-stream/|v1/machines/clone-stream/|v1/machines/jobs/[^/]+/stream(?:\\?|$)).*)",
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
