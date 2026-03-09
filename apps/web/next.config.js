/**
 * @type {import('next').NextConfig}
 *
 * IMPORTANT — Module format note:
 * This file intentionally uses CommonJS (`module.exports`) even though the
 * rest of the project uses ESM (`import`/`export`). Next.js requires the
 * config file to be CJS because it is loaded by the Node.js build process
 * before any ESM transforms are applied. Do NOT convert this to ESM or add
 * `"type": "module"` to apps/web/package.json — it will break the build.
 *
 * Companion files that use ESM (tailwind.config.ts, postcss.config.js) are
 * handled by their own loaders and are unaffected by this constraint.
 */
const nextConfig = {
  async headers() {
    const isProduction = process.env.NODE_ENV === "production";

    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      ...(isProduction
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=63072000; includeSubDomains; preload",
            },
          ]
        : []),
      {
        key: "Content-Security-Policy",
        value: buildCsp(isProduction),
      },
    ];

    return [{ source: "/(.*)", headers: securityHeaders }];
  },

  async redirects() {
    if (process.env.NODE_ENV !== "production") return [];

    return [
      {
        source: "/(.*)",
        has: [{ type: "header", key: "x-forwarded-proto", value: "http" }],
        destination: `https://${process.env.NEXT_PUBLIC_DOMAIN}/:path*`,
        permanent: true,
      },
    ];
  },
};

/**
 * Builds the Content Security Policy header value.
 *
 * Production: strict — no unsafe-eval, no wildcard sources.
 * Development: relaxed to allow Next.js HMR and React DevTools.
 *
 * When adding a CDN for fonts or images, extend img-src / font-src explicitly.
 * Never use wildcard `*` in any CSP directive.
 *
 * @param {boolean} isProduction
 * @returns {string}
 */
function buildCsp(isProduction) {
  if (!isProduction) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' ws: wss: http://localhost:3001",
      "frame-ancestors 'none'",
    ].join("; ");
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error(
      "[next.config.js] NEXT_PUBLIC_API_URL must be set for production builds. " +
        "Without it, connect-src in the CSP header will be incomplete and all API calls will be blocked by the browser.",
    );
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${apiUrl}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

module.exports = nextConfig;
