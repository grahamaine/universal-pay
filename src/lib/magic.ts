import { Magic } from "magic-sdk";
import { ARBITRUM_RPC, ARBITRUM_CHAIN_ID } from "./constants";

// Magic is browser-only; guard against SSR import evaluation.
let _magic: Magic | null = null;

// True only when a publishable Magic key is configured. Constructing `Magic`
// with an empty/placeholder key injects an overlay iframe that never settles,
// so callers should check this before touching the SDK.
export function hasMagicKey(): boolean {
  const key = process.env.NEXT_PUBLIC_MAGIC_KEY;
  return Boolean(key && !key.includes("xxxx"));
}

export function getMagic(): Magic {
  if (typeof window === "undefined") {
    throw new Error("Magic can only be used in the browser");
  }
  if (!_magic) {
    _magic = new Magic(process.env.NEXT_PUBLIC_MAGIC_KEY as string, {
      network: {
        rpcUrl: ARBITRUM_RPC,
        chainId: ARBITRUM_CHAIN_ID,
      },
    });
  }
  return _magic;
}
