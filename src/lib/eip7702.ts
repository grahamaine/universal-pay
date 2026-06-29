// EIP-7702 authorization helper for the Universal Account send flow.
//
// In EIP-7702 mode the user's EOA must be *delegated* to the smart-account
// implementation before the Universal Account can act through it. On the first
// transaction from a fresh EOA (per chain), each userOp the relayer returns
// carries an `eip7702Auth` tuple ({ chainId, nonce, address }) and is flagged
// `eip7702Delegated: false`. Each such tuple must be signed by the EOA and the
// signatures handed to `ua.sendTransaction(tx, rootSig, authorizations)` — the
// SDK matches them back to userOps by `userOpHash` and injects them as each
// userOp's `eip7702AuthSignature`. Without this the very first send reverts on
// chain (the account was never delegated), which is exactly why "nothing works"
// until the EOA has been upgraded once.
//
// Kept free of any `@particle-network/*` import so it stays SSR-safe (the UA SDK
// is browser-only) — only ethers, which is isomorphic.
import { Signature } from "ethers";

// Matches the SDK's EIP7702Authorization ({ userOpHash, signature }).
export type EIP7702Authorization = { userOpHash: string; signature: string };

// The authorization tuple the EOA must sign, mirroring userOp.eip7702Auth.
export type AuthTuple = { address: string; chainId: number; nonce: number };

// Minimal structural view of a userOp — avoids importing the browser-only SDK
// type here. The real `ITransaction.userOps` entries are assignable to this.
export type AuthUserOp = {
  userOpHash: string;
  eip7702Auth?: { address: string; chainId: number; nonce: number };
  eip7702Delegated?: boolean;
};

// Signs one authorization tuple, returning the serialized 65-byte signature.
export type SignAuthorization = (auth: AuthTuple) => Promise<string>;

// Walk a transaction's userOps and produce the authorizations the relayer needs.
// Only userOps that declare an `eip7702Auth` tuple *and* aren't yet delegated
// require a signature; already-delegated accounts produce an empty array (so the
// call is a no-op and fully backward compatible). Identical tuples are signed
// once and reused to avoid extra wallet prompts.
export async function buildAuthorizations(
  userOps: AuthUserOp[],
  signAuthorization: SignAuthorization
): Promise<EIP7702Authorization[]> {
  const authorizations: EIP7702Authorization[] = [];
  const cache = new Map<string, string>();

  for (const op of userOps) {
    const auth = op.eip7702Auth;
    if (!auth || op.eip7702Delegated) continue;

    const key = `${auth.chainId}:${auth.nonce}`;
    let serialized = cache.get(key);
    if (!serialized) {
      serialized = await signAuthorization({
        address: auth.address,
        chainId: Number(auth.chainId),
        nonce: auth.nonce,
      });
      cache.set(key, serialized);
    }
    authorizations.push({ userOpHash: op.userOpHash, signature: serialized });
  }

  return authorizations;
}

// Normalise a raw eth_sign result into the serialized form the relayer expects.
// eth_sign returns a raw secp256k1 signature over the digest (r‖s‖v); Signature
// .serialized re-emits the canonical 65-byte hex, from which the relayer derives
// yParity — the same shape Particle's reference client builds via Signature.from.
export function serializeRawSignature(raw: string): string {
  return Signature.from(raw).serialized;
}
