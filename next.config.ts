import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Report-only until the violation feed is reviewed; then enforce.
          // Radix inline styles and Next bootstraps need 'unsafe-inline' for style;
          // scripts stay 'self'-only plus the inline Next requires to hydrate.
          {
            key: "Content-Security-Policy-Report-Only",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/og": [
      "./node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf",
      "./node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf",
      "./node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf",
      "./node_modules/geist/dist/fonts/geist-mono/GeistMono-Bold.ttf",
    ],
    "/opengraph-image": [
      "./node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf",
      "./node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf",
      "./node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf",
      "./node_modules/geist/dist/fonts/geist-mono/GeistMono-Bold.ttf",
    ],
  },
};

export default nextConfig;
