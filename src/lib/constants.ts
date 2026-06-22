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
