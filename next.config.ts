import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/formrequests/requests",
        destination: "/manage-requests",
        permanent: true,
      },
      {
        source: "/recordrequests",
        destination: "/manage-requests",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
