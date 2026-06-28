// Aave v3 (Arbitrum One) integration helpers. Kept free of any `@particle-*`
// import so it stays SSR-safe — only ethers (isomorphic) + literal addresses.
// The actual cross-chain sourcing is done by the Universal Account; here we only
// (1) encode the on-chain calls it should execute on Arbitrum, and (2) read the
// resulting lending position back over a plain RPC.
import {
  Contract,
  Interface,
  JsonRpcProvider,
  MaxUint256,
  parseUnits,
} from "ethers";
import { ARBITRUM_USDC, ARBITRUM_RPC, SETTLEMENT_CHAIN_ID } from "./constants";

// Aave v3 Pool proxy on Arbitrum One (verified on Arbiscan). `supply`/`withdraw`
// are routed here; the Pool credits/burns the correct aToken automatically.
export const AAVE_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
// Aave v3 Protocol Data Provider on Arbitrum — read-only, used for the position
// + live supply rate. Keyed by the underlying asset, so no aToken address guess.
export const AAVE_DATA_PROVIDER = "0x69FA688f1Dc47d4B5d8029D5a35fb7a548310654";

const USDC_DECIMALS = 6;

const erc20 = new Interface(["function approve(address,uint256)"]);
const pool = new Interface([
  "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
  "function withdraw(address asset,uint256 amount,address to) returns (uint256)",
]);
const dataProvider = new Interface([
  "function getUserReserveData(address asset,address user) view returns (uint256 currentATokenBalance,uint256 currentStableDebt,uint256 currentVariableDebt,uint256 principalStableDebt,uint256 scaledVariableDebt,uint256 stableBorrowRate,uint256 liquidityRate,uint40 stableRateLastUpdated,bool usageAsCollateralEnabled)",
  "function getReserveData(address asset) view returns (uint256 unbacked,uint256 accruedToTreasuryScaled,uint256 totalAToken,uint256 totalStableDebt,uint256 totalVariableDebt,uint256 liquidityRate,uint256 variableBorrowRate,uint256 stableBorrowRate,uint256 averageStableBorrowRate,uint256 liquidityIndex,uint256 variableBorrowIndex,uint40 lastUpdateTimestamp)",
]);

// A single EVM call for the Universal Account to execute on the target chain —
// structurally matches the SDK's EVMTransaction ({ to, data, value? }).
export type EvmCall = { to: string; data: string; value?: string };

export function usdcUnits(human: string): bigint {
  return parseUnits(human, USDC_DECIMALS);
}

// approve(Pool) + supply(USDC) — aTokens are credited to the user's own EOA.
export function buildSupplyCalls(eoa: string, human: string): EvmCall[] {
  const amt = usdcUnits(human);
  return [
    { to: ARBITRUM_USDC, data: erc20.encodeFunctionData("approve", [AAVE_POOL, amt]) },
    {
      to: AAVE_POOL,
      data: pool.encodeFunctionData("supply", [ARBITRUM_USDC, amt, eoa, 0]),
    },
  ];
}

// withdraw `human` USDC back to the EOA, or the entire position when `max`.
export function buildWithdrawCalls(eoa: string, human: string, max: boolean): EvmCall[] {
  const amt = max ? MaxUint256 : usdcUnits(human);
  return [
    {
      to: AAVE_POOL,
      data: pool.encodeFunctionData("withdraw", [ARBITRUM_USDC, amt, eoa]),
    },
  ];
}

export type EarnPosition = {
  /** Supplied USDC currently earning (underlying units, accrues over time). */
  supplied: number;
  /** Current supply APR, percent. */
  apr: number;
};

// Read the user's USDC lending position + the live supply rate over a plain
// Arbitrum RPC (independent of the Magic signer's provider).
export async function readEarnPosition(user: string): Promise<EarnPosition> {
  const provider = new JsonRpcProvider(ARBITRUM_RPC, SETTLEMENT_CHAIN_ID);
  const c = new Contract(AAVE_DATA_PROVIDER, dataProvider, provider);
  const [ur, rd] = await Promise.all([
    c.getUserReserveData(ARBITRUM_USDC, user),
    c.getReserveData(ARBITRUM_USDC),
  ]);
  const supplied = Number(ur[0]) / 10 ** USDC_DECIMALS;
  // liquidityRate is a ray (1e27) annual rate → percent = rate / 1e25.
  const apr = Number(rd[5]) / 1e25;
  return { supplied, apr };
}
