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
import { EXPLORER_TX, SETTLEMENT_CHAIN_ID } from "@/lib/constants";
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
import { buildAuthorizations } from "@/lib/eip7702";

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

  const uaRef = useRef<UniversalAccount | null>(null);
  const signerRef = useRef<JsonRpcSigner | null>(null);

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
    await refreshBalance();
    try {
      setEarn(await readEarnPosition(address));
    } catch {
      /* read-only; ignore RPC hiccups */
    }
  }, []);

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
    setPending(null);
    setStatus("idle");
  }, []);

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
      setPending(null);
      return last;
    } finally {
      setBusy(false);
    }
  }, [pending, signAndSend, refreshBalance, refreshEarn]);

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
    busy,
    error,
    pending,
    setError,
    login,
    logout,
    refreshBalance,
    refreshEarn,
    pay,
    preparePay,
    prepareEarn,
    prepareWithdraw,
    prepareConsolidate,
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

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// Format a token amount without trailing-zero noise (e.g. 0.0100 → "0.01").
function trimNum(n: number): string {
  return Number(n.toFixed(6)).toString();
}
