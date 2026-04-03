/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: ["http://localhost:3000", "127.0.0.1"],
  images: {
    domains: ["localhost"],
  },
}

module.exports = nextConfig
