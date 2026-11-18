// No usage telemetry: resumes are personal data and nothing about a session
// should leave the deployment that the user was not told about.
process.env.NEXT_TELEMETRY_DISABLED = "1";

const isDev = process.env.NODE_ENV !== "production";

// A user's AI key lives in the browser, so an injected script is the main way
// to steal one. Scripts and connections are limited to this origin; the AI
// providers are only ever called from the server.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  // Both resolve files relative to their own package at runtime (a worker, a
  // WASM binary), which bundling breaks.
  serverExternalPackages: ["pdfjs-dist", "@electric-sql/pglite", "pg"],
  // The repo root has its own lockfile; pin the root so Turbopack does not
  // treat the whole engine checkout as this app's workspace.
  turbopack: { root: import.meta.dirname },
  poweredByHeader: false,
  ...(process.env.BUILD_DIST ? { distDir: process.env.BUILD_DIST } : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
