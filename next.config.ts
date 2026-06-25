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
      // The Universal Account SDK's package.json `exports` map only declares
      // `import`/`require` conditions (no `browser`/`default`). Turbopack's
      // browser build fails to match a condition and silently resolves the bare
      // specifier to an EMPTY module, so `UniversalAccount` / the version const
      // come back `undefined` → `new UniversalAccount()` throws
      // "(void 0) is not a constructor" after login. Pin it to the ESM entry.
      "@particle-network/universal-account-sdk":
        "./node_modules/@particle-network/universal-account-sdk/dist/index.mjs",
    },
  },
};

export default nextConfig;
