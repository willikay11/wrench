import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
