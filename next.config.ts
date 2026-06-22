import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // auth-core (via the deposit SDK) dynamically imports AWS Cognito
      // credential providers we never use; the real package pulls Node-only
      // code into the client bundle. Swap in a browser stub. See the file for
      // the full rationale.
      "@aws-sdk/credential-providers": {
        browser: "./stubs/aws-credential-providers.ts",
      },
    },
  },
};

export default nextConfig;
