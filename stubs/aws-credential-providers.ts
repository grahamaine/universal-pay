// Browser stub for @aws-sdk/credential-providers.
//
// @particle-network/auth-core dynamically imports this package only for AWS
// Cognito social login (`fromCognitoIdentity`). Universal Pay logs in via Magic
// email-OTP and the deposit SDK's intermediary JWT wallet, so that code path
// never runs. The real package drags Node-only modules (node:fs via
// credential-provider-ini) and a mismatched web-identity version into the
// client bundle, breaking the Turbopack build — so we alias it to this no-op.
const notSupported = (name: string) => () => {
  throw new Error(
    `@aws-sdk/credential-providers.${name} is not available in the browser`
  );
};

export const fromCognitoIdentity = notSupported("fromCognitoIdentity");
export const fromCognitoIdentityPool = notSupported("fromCognitoIdentityPool");
export const fromTemporaryCredentials = notSupported("fromTemporaryCredentials");
export const fromWebToken = notSupported("fromWebToken");
export const fromTokenFile = notSupported("fromTokenFile");
export const fromIni = notSupported("fromIni");
export const fromEnv = notSupported("fromEnv");
export const fromProcess = notSupported("fromProcess");
export const fromSSO = notSupported("fromSSO");
export const fromNodeProviderChain = notSupported("fromNodeProviderChain");
