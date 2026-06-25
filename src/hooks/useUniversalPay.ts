"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider, getBytes, type JsonRpcSigner } from "ethers";
import {
  UniversalAccount,
  UNIVERSAL_ACCOUNT_VERSION,
} from "@particle-network/universal-account-sdk";
import { getMagic, hasMagicKey } from "@/lib/magic";
import { EXPLORER_TX } from "@/lib/constants";
import {
  DEFAULT_SETTLEMENT_TOKEN,
  tokenMeta,
  type SettlementToken,
  type TokenBalance,
} from "@/lib/tokens";

export type Recipient = { address: string; amount: string };

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  // Send a single chain-abstracted transfer that settles the chosen token on
  // Arbitrum. The UA auto-sources from whatever assets the sender holds.
  const sendOne = useCallback(
    async (to: string, amount: string, token: SettlementToken) => {
      const ua = uaRef.current;
      const signer = signerRef.current;
      if (!ua || !signer) throw new Error("Session not ready");

      const tx = await ua.createTransferTransaction({
        token: { chainId: token.chainId, address: token.address },
        amount,
        receiver: to,
      });
      const signature = await signer.signMessage(getBytes(tx.rootHash));
      const result = await ua.sendTransaction(tx, signature);
      return (result.transactionId ?? result.transactionHash) as string;
    },
    []
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

  return {
    status,
    email,
    eoa,
    balanceUsd,
    assets,
    busy,
    error,
    setError,
    login,
    logout,
    refreshBalance,
    pay,
  };
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// Format a token amount without trailing-zero noise (e.g. 0.0100 → "0.01").
function trimNum(n: number): string {
  return Number(n.toFixed(6)).toString();
}
