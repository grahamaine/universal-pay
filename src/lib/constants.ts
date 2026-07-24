// Everything settles on Arbitrum (qualifies the Arbitrum "Road to Open House" bounty).
// This is CHAIN_ID.ARBITRUM_MAINNET_ONE from the UA SDK — kept as a literal so this
// shared module doesn't pull the browser-only SDK into the server render graph.
export const SETTLEMENT_CHAIN_ID = 42161;

// Native USDC on Arbitrum One.
export const ARBITRUM_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

// Magic needs an EVM network to attach the rpc provider to. We point it at
// Arbitrum One — the Universal Account abstracts away which chain assets live on,
// so this only matters for message signing.
export const ARBITRUM_RPC = "https://arb1.arbitrum.io/rpc";
export const ARBITRUM_CHAIN_ID = 42161;

export const EXPLORER_TX = (hash: string) => `https://arbiscan.io/tx/${hash}`;

// UniversalPayReceipts — our own contract on Arbitrum One (source-verified on
// Arbiscan). Emits an indexed Receipt event per payment routed through it.
// Source: contracts/UniversalPayReceipts.sol
export const RECEIPTS_CONTRACT = "0xF1d421e02d92D89f28AFdfAB3223E60644a36eCA";
export const RECEIPTS_CONTRACT_URL = `https://arbiscan.io/address/${RECEIPTS_CONTRACT}#code`;

// Base mainnet — where the EOA is explicitly upgraded (EIP-7702 delegated) to a
// Universal Account. CHAIN_ID.BASE_MAINNET in the UA SDK; literal for SSR safety.
export const BASE_CHAIN_ID = 8453;
export const BASE_RPC = "https://mainnet.base.org";
export const BASE_EXPLORER_ADDR = (addr: string) =>
  `https://basescan.org/address/${addr}`;

// Solana (CHAIN_ID.SOLANA_MAINNET in the UA SDK). The account's Solana address
// is derived live from the SDK's smartAccountOptions; NEXT_PUBLIC_SOLANA_ADDRESS
// is an optional env fallback for demos where the SDK lookup is unavailable.
export const SOLANA_CHAIN_ID = 101;
export const SOLANA_ADDRESS_ENV =
  process.env.NEXT_PUBLIC_SOLANA_ADDRESS ?? null;
export const SOLANA_EXPLORER_ADDR = (addr: string) =>
  `https://solscan.io/account/${addr}`;

// Chains offered in the delegation portal — where the EOA can be explicitly
// EIP-7702 upgraded in place. RPCs are public and only used for read-only
// eth_getCode delegation checks; the upgrade itself goes through the UA relayer.
export type DelegationChain = { chainId: number; name: string; rpc: string };
export const DELEGATION_CHAINS: DelegationChain[] = [
  { chainId: BASE_CHAIN_ID, name: "Base", rpc: BASE_RPC },
  { chainId: ARBITRUM_CHAIN_ID, name: "Arbitrum One", rpc: ARBITRUM_RPC },
  { chainId: 1, name: "Ethereum", rpc: "https://eth.llamarpc.com" },
  { chainId: 10, name: "Optimism", rpc: "https://mainnet.optimism.io" },
  { chainId: 56, name: "BNB Chain", rpc: "https://bsc-dataseed.binance.org" },
];
