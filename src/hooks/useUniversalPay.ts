"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider, getBytes, type JsonRpcSigner } from "ethers";
import {
  UniversalAccount,
  UNIVERSAL_ACCOUNT_VERSION,
} from "@particle-network/universal-account-sdk";
import { getMagic, hasMagicKey } from "@/lib/magic";
import {
  SETTLEMENT_CHAIN_ID,
  ARBITRUM_USDC,
  EXPLORER_TX,
} from "@/lib/constants";

export type Recipient = { address: string; amount: string };

export type PayResult = {
  txHash: string;
  explorerUrl: string;
  total: string;
  recipients: number;
};

type Status = "idle" | "loading" | "ready";

export function useUniversalPay() {
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [eoa, setEoa] = useState<string | null>(null);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
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
        const isLoggedIn = await magic.user.isLoggedIn();
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
      const assets = await ua.getPrimaryAssets();
      setBalanceUsd(Number(assets.totalAmountInUSD ?? 0));
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  // Send a single chain-abstracted USDC transfer that settles on Arbitrum.
  const sendOne = useCallback(async (to: string, amount: string) => {
    const ua = uaRef.current;
    const signer = signerRef.current;
    if (!ua || !signer) throw new Error("Session not ready");

    const tx = await ua.createTransferTransaction({
      token: { chainId: SETTLEMENT_CHAIN_ID, address: ARBITRUM_USDC },
      amount,
      receiver: to,
    });
    const signature = await signer.signMessage(getBytes(tx.rootHash));
    const result = await ua.sendTransaction(tx, signature);
    return (result.transactionId ?? result.transactionHash) as string;
  }, []);

  // Pay or split: one or many recipients, each settled on Arbitrum via the UA.
  const pay = useCallback(
    async (recipients: Recipient[]): Promise<PayResult> => {
      setError(null);
      setBusy(true);
      try {
        const valid = recipients.filter(
          (r) => r.address.trim() && Number(r.amount) > 0
        );
        if (valid.length === 0) throw new Error("Add at least one recipient");

        let lastHash = "";
        for (const r of valid) {
          lastHash = await sendOne(r.address.trim(), r.amount.trim());
        }

        const total = valid
          .reduce((s, r) => s + Number(r.amount), 0)
          .toFixed(2);

        await refreshBalance();
        return {
          txHash: lastHash,
          explorerUrl: EXPLORER_TX(lastHash),
          total,
          recipients: valid.length,
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
