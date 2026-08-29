import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Node-only database/runtime dependencies out of the Next.js server bundle.
  // The production data plane uses PostgreSQL; SQLite remains only as a legacy fallback.
  serverExternalPackages: ["postgres", "node:sqlite"],
  // Permite que o celular, na rede local do beta, carregue os recursos de desenvolvimento.
  allowedDevOrigins: ["192.168.1.5", "192.168.1.6", "192.168.1.9", "localhost", "127.0.0.1"],
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "X-DNS-Prefetch-Control", value: "off" },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
        ...(process.env.NODE_ENV === "production"
          ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
          : []),
      ],
    }];
  },
};

export default nextConfig;
