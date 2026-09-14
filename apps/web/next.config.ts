import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Car photos and catalogue images are served by Cloudinary (ADR-007). Only
    // that host is allowed as an image source, so nothing else can be passed
    // off through next/image. The cards render these unoptimised: an upload's
    // URL is signed and authenticated, and every URL already carries
    // Cloudinary's own format and quality transformation.
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" }],
  },
  experimental: {
    serverActions: {
      // A car photo may be a full 10MB (FR-35), and it reaches the API through
      // a server action, whose body limit defaults to 1MB — above that the
      // upload fails with no useful message. 11mb leaves room for the multipart
      // framing around a full-size photo, which Next counts against the limit.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
