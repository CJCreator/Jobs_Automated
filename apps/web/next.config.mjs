// No usage telemetry: resumes are personal data and nothing about a session
// should leave the deployment that the user was not told about.
process.env.NEXT_TELEMETRY_DISABLED = "1";

// Pages get their Content-Security-Policy, with a per-request script nonce,
// from src/proxy.ts. API routes return JSON or a PDF and need no resources.
const apiCsp = "default-src 'none'; frame-ancestors 'none'";

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
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: apiCsp }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Production only: a browser that sees this on localhost would refuse plain http there for two years.
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
