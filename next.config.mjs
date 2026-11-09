/** Security headers on every page and API response. */
const securityHeaders = [
  // no other site may show these pages in a frame (stops "clickjacking",
  // e.g. tricking a seller into pressing Refund on a hidden page)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // browsers must use the declared file type, never guess one
  { key: "X-Content-Type-Options", value: "nosniff" },
  // other sites see only our domain in the Referer, not full paths
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // only the features the app uses: location for "Use my location"; the
  // camera is reached through the photo picker, which needs no permission
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app shows photos with plain <img> tags and never uses next/image, so
  // the image optimisation endpoint (/_next/image) is left off: no remote
  // image hosts are allowed. (Several Next.js security advisories are in it.)
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
