// Token registry. Kept free of any `@particle-network/*` import so it stays safe
// to pull into the SSR graph (the SDK is browser-only). Addresses/chain ids are
// literals; the settlement chain is Arbitrum One (42161).
import { SETTLEMENT_CHAIN_ID, ARBITRUM_USDC } from "./constants";

export const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000";
// Bridged/native USDT on Arbitrum One.
export const ARBITRUM_USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";

export type SettlementToken = {
  key: string;
  symbol: string;
  name: string;
  icon: string;
  chainId: number;
  address: string;
  /** Whether 1 unit ≈ $1 — drives whether the amount field is a USD value. */
  stable: boolean;
};

// Tokens a recipient can be paid out in. The Universal Account auto-sources from
// whatever the sender holds, so the only choice that matters here is what the
// receiver actually lands — all on Arbitrum.
export const SETTLEMENT_TOKENS: SettlementToken[] = [
  { key: "usdc", symbol: "USDC", name: "USD Coin", icon: "$", chainId: SETTLEMENT_CHAIN_ID, address: ARBITRUM_USDC, stable: true },
  { key: "usdt", symbol: "USDT", name: "Tether USD", icon: "₮", chainId: SETTLEMENT_CHAIN_ID, address: ARBITRUM_USDT, stable: true },
  { key: "eth", symbol: "ETH", name: "Ethereum", icon: "Ξ", chainId: SETTLEMENT_CHAIN_ID, address: NATIVE_ADDRESS, stable: false },
];

export const DEFAULT_SETTLEMENT_TOKEN = SETTLEMENT_TOKENS[0];

export function settlementTokenByKey(key: string): SettlementToken {
  return SETTLEMENT_TOKENS.find((t) => t.key === key) ?? DEFAULT_SETTLEMENT_TOKEN;
}

// Display metadata for the per-token balance breakdown returned by
// getPrimaryAssets(). Keyed by SUPPORTED_TOKEN_TYPE string values from the SDK.
export const TOKEN_META: Record<string, { symbol: string; name: string; icon: string }> = {
  eth: { symbol: "ETH", name: "Ethereum", icon: "Ξ" },
  usdt: { symbol: "USDT", name: "Tether", icon: "₮" },
  usdc: { symbol: "USDC", name: "USD Coin", icon: "$" },
  btc: { symbol: "BTC", name: "Bitcoin", icon: "₿" },
  bnb: { symbol: "BNB", name: "BNB", icon: "B" },
  sol: { symbol: "SOL", name: "Solana", icon: "◎" },
};

export function tokenMeta(type: string) {
  return (
    TOKEN_META[type?.toLowerCase?.()] ?? {
      symbol: (type ?? "?").toUpperCase(),
      name: type ?? "Unknown",
      icon: "•",
    }
  );
}

export type TokenBalance = {
  type: string;
  symbol: string;
  name: string;
  icon: string;
  amount: number;
  amountInUSD: number;
};
