/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow scan-posts up to 5 minutes since human-like delays add up
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
