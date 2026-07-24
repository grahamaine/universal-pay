"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserProvider,
  getBytes,
  hashAuthorization,
  Signature,
  type JsonRpcSigner,
} from "ethers";
import {
  UniversalAccount,
  UNIVERSAL_ACCOUNT_VERSION,
  SUPPORTED_TOKEN_TYPE,
  type ITransaction,
} from "@particle-network/universal-account-sdk";
import { getMagic, hasMagicKey } from "@/lib/magic";
import {
  BASE_CHAIN_ID,
  DELEGATION_CHAINS,
  EXPLORER_TX,
  SETTLEMENT_CHAIN_ID,
  SOLANA_ADDRESS_ENV,
} from "@/lib/constants";
import {
  DEFAULT_SETTLEMENT_TOKEN,
  tokenMeta,
  type SettlementToken,
  type TokenBalance,
} from "@/lib/tokens";
import {
  buildSupplyCalls,
  buildWithdrawCalls,
  readEarnPosition,
  type EarnPosition,
} from "@/lib/defi";
import {
  buildAuthorizations,
  readDelegation,
  type DelegationStatus,
} from "@/lib/eip7702";
import type { SwapTarget } from "@/lib/tokens";

export type Recipient = { address: string; amount: string };

// Where the unified balance physically lives, aggregated across every asset.
export type ChainBalance = { chainId: number; amountInUSD: number };

// A human-readable preview of what a Universal Account transaction will do,
// distilled from ITransaction.tokenChanges — this is the chain-abstraction made
// visible: which chains funded it, how many swaps, the fee, and that no native
// gas token was ever required.
export type TxPreview = {
  action: string;
  summary: string;
  /** USD leaving the user's balance. */
  payUsd: number;
  /** USD the user receives (convert/withdraw). */
  receiveUsd: number;
  /** Total fee in USD. */
  feeUsd: number;
  /** Source chain ids the value was pulled from. */
  fromChains: number[];
  /** Destination chain ids. */
  toChains: number[];
  /** Number of swaps the router performed. */
  swaps: number;
};

// A built-but-unsent action awaiting the user's confirmation in the preview
// sheet. `txs` are signed + sent in order; `run` fires the caller's side effects
// (activity logging, success card) once the last one lands.
type Pending = {
  preview: TxPreview;
  txs: ITransaction[];
  run: (lastHash: string) => void;
};

export type PayResult = {
  txHash: string;
  explorerUrl: string;
  total: string;
  recipients: number;
  symbol: string;
};

// One row of the account's transaction history, normalized from the loosely
// typed (any) getTransactions() response the UniversalX backend returns.
export type UaTx = {
  id: string;
  tag: string;
  statusLabel: string;
  failed: boolean;
  done: boolean;
  /** USD moved out of the balance (0 when unknown). */
  usd: number;
  createdAt: number | null;
};

// UA_TRANSACTION_STATUS from the SDK, folded into user-facing labels.
const TX_STATUS_LABEL: Record<number, string> = {
  0: "Initializing",
  1: "Depositing",
  2: "Depositing",
  3: "Refund pending",
  4: "Executing",
  5: "Executing",
  6: "Failed",
  7: "Completed",
  8: "Refunding",
  9: "Refunding",
  10: "Refund failed",
  11: "Refunded",
  12: "Processing",
  13: "Processing",
  14: "Failed",
};

type Status = "idle" | "loading" | "ready";

export function useUniversalPay() {
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [eoa, setEoa] = useState<string | null>(null);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [assets, setAssets] = useState<TokenBalance[]>([]);
  const [chainBalances, setChainBalances] = useState<ChainBalance[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [earn, setEarn] = useState<EarnPosition | null>(null);
  // Per-chain EIP-7702 delegation status (missing key = still checking).
  const [delegations, setDelegations] = useState<Record<number, DelegationStatus>>({});
  // The account's Solana address (Universal Accounts span EVM + Solana; the EVM
  // side is the EOA itself in 7702 mode, Solana gets its own derived address).
  const [solAddress, setSolAddress] = useState<string | null>(null);
  // Recent Universal Account transactions from the UniversalX backend.
  const [uaTxs, setUaTxs] = useState<UaTx[]>([]);
  const [txsLoading, setTxsLoading] = useState(false);

  const uaRef = useRef<UniversalAccount | null>(null);
  const signerRef = useRef<JsonRpcSigner | null>(null);

  const refreshBalance = useCallback(async () => {
    const ua = uaRef.current;
    if (!ua) return;
    try {
      const res = await ua.getPrimaryAssets();
      setBalanceUsd(Number(res.totalAmountInUSD ?? 0));
      const rows: TokenBalance[] = (res.assets ?? [])
        .map((a) => {
          const meta = tokenMeta(String(a.tokenType));
          return {
            type: String(a.tokenType),
            symbol: meta.symbol,
            name: meta.name,
            icon: meta.icon,
            amount: Number(a.amount ?? 0),
            amountInUSD: Number(a.amountInUSD ?? 0),
          };
        })
        .filter((r) => r.amountInUSD > 0 || r.amount > 0)
        .sort((a, b) => b.amountInUSD - a.amountInUSD);
      setAssets(rows);

      // Aggregate every asset's per-chain holdings into one map so we can show
      // where the unified balance physically lives — the fragmentation that the
      // Universal Account abstracts away into a single number.
      const byChain = new Map<number, number>();
      for (const a of res.assets ?? []) {
        for (const c of a.chainAggregation ?? []) {
          const id = Number(c.token?.chainId);
          const usd = Number(c.amountInUSD ?? 0);
          if (!id || !(usd > 0)) continue;
          byChain.set(id, (byChain.get(id) ?? 0) + usd);
        }
      }
      setChainBalances(
        [...byChain.entries()]
          .map(([chainId, amountInUSD]) => ({ chainId, amountInUSD }))
          .sort((x, y) => y.amountInUSD - x.amountInUSD)
      );
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  // Read the EOA's delegation status on every portal chain in parallel; chains
  // whose RPC fails simply keep their previous (or "checking") state.
  const readDelegations = useCallback(async (address: string) => {
    const results = await Promise.all(
      DELEGATION_CHAINS.map(async (c) => {
        try {
          return [c.chainId, await readDelegation(address, c.chainId, c.rpc)] as const;
        } catch {
          return null;
        }
      })
    );
    setDelegations((prev) => {
      const next = { ...prev };
      for (const r of results) if (r) next[r[0]] = r[1];
      return next;
    });
  }, []);

  // Pull the latest transaction history from the UniversalX backend.
  const refreshTransactions = useCallback(async () => {
    const ua = uaRef.current;
    if (!ua) return;
    setTxsLoading(true);
    try {
      setUaTxs(normalizeTxs(await ua.getTransactions(1, 10)));
    } catch {
      /* history is best-effort; keep whatever we had */
    } finally {
      setTxsLoading(false);
    }
  }, []);

  const bootstrapSession = useCallback(async (address: string) => {
    const ua = new UniversalAccount({
      projectId: process.env.NEXT_PUBLIC_PARTICLE_PROJECT_ID as string,
      projectClientKey: process.env.NEXT_PUBLIC_PARTICLE_CLIENT_KEY as string,
      projectAppUuid: process.env.NEXT_PUBLIC_PARTICLE_APP_ID as string,
      ownerAddress: address,
      // EIP-7702 mode: the user's existing EOA is upgraded *in place* to act
      // directly as the Universal Account — no new address, no migration.
      smartAccountOptions: {
        useEIP7702: true,
        name: "UNIVERSAL",
        version: UNIVERSAL_ACCOUNT_VERSION,
        ownerAddress: address,
      },
      tradeConfig: {
        slippageBps: 100,
      },
    });
    uaRef.current = ua;
    setEoa(address);
    // Non-blocking: per-chain 7702 delegation status for the portal.
    void readDelegations(address);
    // Non-blocking: the account's Solana address (the EVM side IS the EOA in
    // 7702 mode; Solana gets its own smart-account address). Falls back to the
    // optional NEXT_PUBLIC_SOLANA_ADDRESS env value if the lookup fails.
    ua.getSmartAccountOptions()
      .then((o) => setSolAddress(o.solanaSmartAccountAddress ?? SOLANA_ADDRESS_ENV))
      .catch(() => setSolAddress(SOLANA_ADDRESS_ENV));
    // Non-blocking: recent transaction history for the swap card.
    void refreshTransactions();
    await refreshBalance();
    try {
      setEarn(await readEarnPosition(address));
    } catch {
      /* read-only; ignore RPC hiccups */
    }
  }, [readDelegations, refreshTransactions, refreshBalance]);

  // Restore an existing Magic session on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // No key configured yet (fresh clone / demo without secrets): skip the
        // SDK entirely and land on the sign-in screen instead of hanging.
        if (!hasMagicKey()) {
          if (!cancelled) setStatus("idle");
          return;
        }
        const magic = getMagic();
        // The iframe handshake can hang indefinitely when the current domain
        // isn't whitelisted in the Magic dashboard. Race it against a timeout so
        // we always fall through to the sign-in screen instead of trapping the
        // app in the "loading" state.
        const isLoggedIn = await Promise.race([
          magic.user.isLoggedIn(),
          new Promise<false>((resolve) => setTimeout(() => resolve(false), 6000)),
        ]);
        if (!isLoggedIn) {
          if (!cancelled) setStatus("idle");
          return;
        }
        const info = await magic.user.getInfo();
        const provider = new BrowserProvider(magic.rpcProvider as never);
        const signer = await provider.getSigner();
        signerRef.current = signer;
        const address = await signer.getAddress();
        if (cancelled) return;
        setEmail(info.email ?? null);
        await bootstrapSession(address);
        setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setError(errMsg(e));
          setStatus("idle");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapSession]);

  const login = useCallback(
    async (emailAddr: string) => {
      setError(null);
      setBusy(true);
      try {
        if (!hasMagicKey()) {
          throw new Error(
            "Demo mode: add NEXT_PUBLIC_MAGIC_KEY (and Particle keys) to .env.local to sign in."
          );
        }
        const magic = getMagic();
        await magic.auth.loginWithEmailOTP({ email: emailAddr });
        const provider = new BrowserProvider(magic.rpcProvider as never);
        const signer = await provider.getSigner();
        signerRef.current = signer;
        const address = await signer.getAddress();
        setEmail(emailAddr);
        await bootstrapSession(address);
        setStatus("ready");
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [bootstrapSession]
  );

  const logout = useCallback(async () => {
    try {
      await getMagic().user.logout();
    } catch {
      /* ignore */
    }
    uaRef.current = null;
    signerRef.current = null;
    setEoa(null);
    setEmail(null);
    setBalanceUsd(null);
    setAssets([]);
    setChainBalances([]);
    setEarn(null);
    setDelegations({});
    setSolAddress(null);
    setUaTxs([]);
    setPending(null);
    setStatus("idle");
  }, []);

  // Sign a built Universal Account transaction and broadcast it. This is the one
  // place every send path funnels through, so the EIP-7702 authorization step
  // below applies uniformly to transfers, splits, earn, withdraw and consolidate.
  const signAndSend = useCallback(async (tx: ITransaction): Promise<string> => {
    const ua = uaRef.current;
    const signer = signerRef.current;
    if (!ua || !signer) throw new Error("Session not ready");
    const owner = await signer.getAddress();

    // EIP-7702 delegation: on the first transaction from a fresh EOA (per chain)
    // the relayer's userOps carry an `eip7702Auth` tuple that the EOA must sign
    // to upgrade itself in place. It needs a RAW secp256k1 signature over the
    // EIP-7702 digest — not a prefixed personal_sign, and not signer.authorize()
    // (Magic's JsonRpcSigner throws UNSUPPORTED_OPERATION for it). We hash the
    // tuple with ethers' hashAuthorization and sign the digest via eth_sign on
    // Magic's provider, which is the only remote method that signs a raw hash.
    // Once delegated, later userOps report eip7702Delegated and this is skipped.
    const authorizations = await buildAuthorizations(tx.userOps, async (auth) => {
      const digest = hashAuthorization({
        address: auth.address,
        nonce: auth.nonce,
        chainId: auth.chainId,
      });
      const raw = (await signer.provider.send("eth_sign", [owner, digest])) as string;
      return Signature.from(raw).serialized;
    });

    const signature = await signer.signMessage(getBytes(tx.rootHash));
    const result = await ua.sendTransaction(tx, signature, authorizations);
    return (result.transactionId ?? result.transactionHash) as string;
  }, []);

  // Send a single chain-abstracted transfer that settles the chosen token on
  // Arbitrum. The UA auto-sources from whatever assets the sender holds.
  const sendOne = useCallback(
    async (to: string, amount: string, token: SettlementToken) => {
      const ua = uaRef.current;
      if (!ua) throw new Error("Session not ready");
      const tx = await ua.createTransferTransaction({
        token: { chainId: token.chainId, address: token.address },
        amount,
        receiver: to,
      });
      return signAndSend(tx);
    },
    [signAndSend]
  );

  // Pay or split: one or many recipients, each settled in `token` on Arbitrum.
  const pay = useCallback(
    async (
      recipients: Recipient[],
      token: SettlementToken = DEFAULT_SETTLEMENT_TOKEN
    ): Promise<PayResult> => {
      setError(null);
      setBusy(true);
      try {
        const valid = recipients.filter(
          (r) => r.address.trim() && Number(r.amount) > 0
        );
        if (valid.length === 0) throw new Error("Add at least one recipient");

        let lastHash = "";
        for (const r of valid) {
          lastHash = await sendOne(r.address.trim(), r.amount.trim(), token);
        }

        const sum = valid.reduce((s, r) => s + Number(r.amount), 0);
        const total = token.stable ? sum.toFixed(2) : trimNum(sum);

        await refreshBalance();
        return {
          txHash: lastHash,
          explorerUrl: EXPLORER_TX(lastHash),
          total,
          recipients: valid.length,
          symbol: token.symbol,
        };
      } finally {
        setBusy(false);
      }
    },
    [sendOne, refreshBalance]
  );

  // Re-read the Aave lending position + live APR.
  const refreshEarn = useCallback(async () => {
    if (!eoa) return;
    try {
      setEarn(await readEarnPosition(eoa));
    } catch {
      /* ignore */
    }
  }, [eoa]);

  // Re-read the EOA's per-chain EIP-7702 delegation status.
  const refreshDelegations = useCallback(async () => {
    if (eoa) await readDelegations(eoa);
  }, [eoa, readDelegations]);

  // Confirm the pending action: sign + send each built tx in order, fire the
  // caller's side effects, then refresh balance + lending position.
  const confirmPending = useCallback(async (): Promise<string> => {
    if (!pending) throw new Error("Nothing to confirm");
    setError(null);
    setBusy(true);
    try {
      let last = "";
      for (const tx of pending.txs) last = await signAndSend(tx);
      pending.run(last);
      await refreshBalance();
      await refreshEarn();
      await refreshDelegations();
      void refreshTransactions();
      setPending(null);
      return last;
    } finally {
      setBusy(false);
    }
  }, [
    pending,
    signAndSend,
    refreshBalance,
    refreshEarn,
    refreshDelegations,
    refreshTransactions,
  ]);

  const cancelPending = useCallback(() => setPending(null), []);

  // ── Action builders: each constructs the transaction(s) and a preview, then
  // parks them in `pending` for the confirm sheet. None of these broadcast — the
  // user reviews the cross-chain sourcing first, then calls confirmPending.

  // Pay / split — settled in `token` on Arbitrum, sourced from any held asset.
  const preparePay = useCallback(
    async (
      recipients: Recipient[],
      token: SettlementToken,
      onConfirmed: (res: PayResult) => void,
      // Optional preview override — lets callers like the shopping cart label the
      // confirm sheet "Checkout — Pay $X" instead of the default Send/Split copy.
      opts?: { action?: string; summary?: string }
    ) => {
      setError(null);
      setBusy(true);
      try {
        const ua = uaRef.current;
        if (!ua) throw new Error("Session not ready");
        const valid = recipients.filter(
          (r) => r.address.trim() && Number(r.amount) > 0
        );
        if (valid.length === 0) throw new Error("Add at least one recipient");

        const txs: ITransaction[] = [];
        for (const r of valid) {
          txs.push(
            await ua.createTransferTransaction({
              token: { chainId: token.chainId, address: token.address },
              amount: r.amount.trim(),
              receiver: r.address.trim(),
            })
          );
        }
        const sum = valid.reduce((s, r) => s + Number(r.amount), 0);
        const total = token.stable ? sum.toFixed(2) : trimNum(sum);
        const isSplit = valid.length > 1;
        const preview = buildPreview(
          opts?.action ?? (isSplit ? "Split" : "Send"),
          opts?.summary ??
            (isSplit
              ? `Split ${total} ${token.symbol} across ${valid.length} people`
              : `Send ${total} ${token.symbol}`),
          txs
        );
        setPending({
          preview,
          txs,
          run: (hash) =>
            onConfirmed({
              txHash: hash,
              explorerUrl: EXPLORER_TX(hash),
              total,
              recipients: valid.length,
              symbol: token.symbol,
            }),
        });
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    []
  );

  // Earn: supply USDC into Aave v3 on Arbitrum, funded cross-chain by the UA.
  const prepareEarn = useCallback(
    async (amount: string, onConfirmed: (hash: string) => void) => {
      setError(null);
      setBusy(true);
      try {
        const ua = uaRef.current;
        if (!ua || !eoa) throw new Error("Session not ready");
        if (!(Number(amount) > 0)) throw new Error("Enter an amount");
        const tx = await ua.createUniversalTransaction({
          chainId: SETTLEMENT_CHAIN_ID,
          expectTokens: [{ type: SUPPORTED_TOKEN_TYPE.USDC, amount }],
          transactions: buildSupplyCalls(eoa, amount),
        });
        const preview = buildPreview(
          "Earn",
          `Deposit ${amount} USDC into Aave v3`,
          [tx]
        );
        setPending({ preview, txs: [tx], run: onConfirmed });
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [eoa]
  );

  // Withdraw USDC (or the whole position) from Aave back to the spendable balance.
  const prepareWithdraw = useCallback(
    async (amount: string, max: boolean, onConfirmed: (hash: string) => void) => {
      setError(null);
      setBusy(true);
      try {
        const ua = uaRef.current;
        if (!ua || !eoa) throw new Error("Session not ready");
        if (!max && !(Number(amount) > 0)) throw new Error("Enter an amount");
        const tx = await ua.createUniversalTransaction({
          chainId: SETTLEMENT_CHAIN_ID,
          expectTokens: [],
          transactions: buildWithdrawCalls(eoa, amount, max),
        });
        const preview = buildPreview(
          "Withdraw",
          max ? "Withdraw all USDC from Aave v3" : `Withdraw ${amount} USDC from Aave v3`,
          [tx]
        );
        setPending({ preview, txs: [tx], run: onConfirmed });
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [eoa]
  );

  // Upgrade: explicitly delegate the EOA to the Universal Account implementation
  // on the given chain (EIP-7702). The zero-value self-call exists only to give
  // the relayer a transaction to attach the authorization to — signAndSend
  // detects the undelegated userOp and signs the 7702 auth tuple automatically,
  // so after this lands the EOA *is* the smart account there, same address.
  const prepareUpgrade = useCallback(
    async (chainId: number, onConfirmed: (hash: string) => void) => {
      setError(null);
      setBusy(true);
      try {
        const ua = uaRef.current;
        if (!ua || !eoa) throw new Error("Session not ready");
        const chain = DELEGATION_CHAINS.find((c) => c.chainId === chainId);
        const tx = await ua.createUniversalTransaction({
          chainId,
          expectTokens: [],
          transactions: [{ to: eoa, data: "0x" }],
        });
        const preview = buildPreview(
          "Upgrade",
          `Upgrade your EOA to a Universal Account on ${chain?.name ?? `chain ${chainId}`}`,
          [tx]
        );
        setPending({ preview, txs: [tx], run: onConfirmed });
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [eoa]
  );

  // Swap (UniversalX-style): convert the unified balance into `target`, funded
  // from whatever mix of assets/chains the account holds. `amount` is the
  // human-readable amount of the target token to receive.
  const prepareSwap = useCallback(
    async (
      target: SwapTarget,
      amount: string,
      onConfirmed: (hash: string) => void
    ) => {
      setError(null);
      setBusy(true);
      try {
        const ua = uaRef.current;
        if (!ua) throw new Error("Session not ready");
        if (!(Number(amount) > 0)) throw new Error("Enter an amount");
        const tx = await ua.createConvertTransaction({
          chainId: target.chainId,
          // SUPPORTED_TOKEN_TYPE is a string enum whose values are exactly the
          // lowercase keys the registry uses ("usdc", "eth", "sol", …).
          expectToken: { type: target.key as SUPPORTED_TOKEN_TYPE, amount },
        });
        const preview = buildPreview(
          "Swap",
          `Swap into ${amount} ${target.symbol}`,
          [tx]
        );
        setPending({ preview, txs: [tx], run: onConfirmed });
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    []
  );

  // Consolidate: convert scattered assets into USDC on Arbitrum in one move.
  const prepareConsolidate = useCallback(
    async (amount: string, onConfirmed: (hash: string) => void) => {
      setError(null);
      setBusy(true);
      try {
        const ua = uaRef.current;
        if (!ua) throw new Error("Session not ready");
        if (!(Number(amount) > 0)) throw new Error("Enter an amount");
        const tx = await ua.createConvertTransaction({
          chainId: SETTLEMENT_CHAIN_ID,
          expectToken: { type: SUPPORTED_TOKEN_TYPE.USDC, amount },
        });
        const preview = buildPreview(
          "Consolidate",
          `Consolidate into ${amount} USDC on Arbitrum`,
          [tx]
        );
        setPending({ preview, txs: [tx], run: onConfirmed });
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    []
  );

  return {
    status,
    email,
    eoa,
    balanceUsd,
    assets,
    chainBalances,
    earn,
    // Base keeps a dedicated alias for the onboarding card; the portal reads
    // the full per-chain map.
    baseUpgrade: delegations[BASE_CHAIN_ID] ?? null,
    delegations,
    solAddress,
    uaTxs,
    txsLoading,
    busy,
    error,
    pending,
    setError,
    login,
    logout,
    refreshBalance,
    refreshEarn,
    refreshDelegations,
    refreshTransactions,
    pay,
    preparePay,
    prepareEarn,
    prepareWithdraw,
    prepareConsolidate,
    prepareUpgrade,
    prepareSwap,
    confirmPending,
    cancelPending,
  };
}

// Distil one or more built transactions into a single human-readable preview by
// aggregating their tokenChanges (sum fees/amounts, union the chains touched).
function buildPreview(
  action: string,
  summary: string,
  txs: ITransaction[]
): TxPreview {
  let payUsd = 0;
  let receiveUsd = 0;
  let feeUsd = 0;
  let swaps = 0;
  const from = new Set<number>();
  const to = new Set<number>();
  for (const tx of txs) {
    const tc = tx.tokenChanges;
    payUsd += num(tc?.totalDecrAmountInUSD);
    receiveUsd += num(tc?.totalIncrAmountInUSD);
    feeUsd += num(tc?.totalFeeInUSD);
    swaps += tc?.swaps?.length ?? 0;
    (tc?.fromChains ?? []).forEach((c) => from.add(c));
    (tc?.toChains ?? []).forEach((c) => to.add(c));
  }
  return {
    action,
    summary,
    payUsd,
    receiveUsd,
    feeUsd,
    swaps,
    fromChains: [...from],
    toChains: [...to],
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// The SDK types getTransactions() as `any`; accept the common envelope shapes
// ([...], {transactions}, {list}, {data}, {data:{transactions}}) and extract
// only the fields the UI renders, defensively.
function normalizeTxs(res: unknown): UaTx[] {
  const root = res as Record<string, unknown> | unknown[] | null;
  const bag = (Array.isArray(root) ? null : root) as Record<string, unknown> | null;
  const nested = bag?.data as Record<string, unknown> | unknown[] | undefined;
  const candidates: unknown[] = [
    root,
    bag?.transactions,
    bag?.list,
    nested,
    (Array.isArray(nested) ? null : nested)?.transactions,
  ];
  const list = candidates.find(Array.isArray) as unknown[] | undefined;
  if (!list) return [];

  return list.slice(0, 10).map((t, i) => {
    const tx = t as Record<string, unknown>;
    const status = Number(tx.status ?? -1);
    const tc = tx.tokenChanges as Record<string, unknown> | undefined;
    const created = tx.createdAt ?? tx.created_at ?? tx.quotedAt ?? null;
    let createdAt: number | null = null;
    if (typeof created === "number") {
      createdAt = created > 1e12 ? created : created * 1000;
    } else if (typeof created === "string") {
      const p = Date.parse(created);
      createdAt = Number.isFinite(p) ? p : null;
    }
    return {
      id: String(tx.transactionId ?? tx.id ?? `tx-${i}`),
      tag: String(tx.tag ?? tx.type ?? "transaction"),
      statusLabel: TX_STATUS_LABEL[status] ?? "Pending",
      failed: status === 6 || status === 10 || status === 14,
      done: status === 7 || status === 11,
      usd: num(tc?.totalDecrAmountInUSD),
      createdAt,
    };
  });
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// Format a token amount without trailing-zero noise (e.g. 0.0100 → "0.01").
function trimNum(n: number): string {
  return Number(n.toFixed(6)).toString();
}
