"use client";

import { useCallback, useEffect, useState } from "react";

// A single entry in the user's activity feed. Payments/splits come from the
// pay flow; deposits come from the cross-chain deposit SDK.
export type ActivityEntry = {
  id: string;
  kind: "sent" | "split" | "deposit" | "earn" | "withdraw" | "consolidate" | "shop";
  amount: string; // USD, 2dp
  timestamp: number;
  /** number of recipients, for split/sent */
  recipients?: number;
  /** human summary, e.g. merchant names for a "shop" checkout */
  label?: string;
  /** settlement/source token, e.g. "USDC" */
  token?: string;
  /** source chain id, for deposits */
  chainId?: number;
  txHash?: string;
  explorerUrl?: string;
};

// Scope history per signed-in account so switching accounts doesn't bleed
// one user's activity into another's.
const keyFor = (account: string | null) =>
  `universal-pay:activity:${account?.toLowerCase() ?? "anon"}`;

function load(account: string | null): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(account));
    return raw ? (JSON.parse(raw) as ActivityEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * localStorage-backed activity log, scoped to the active account.
 * Deduplicates by `id` so re-recording the same deposit/payment is a no-op.
 */
export function useActivity(account: string | null) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  // Reload whenever the account changes (login / logout / switch).
  useEffect(() => {
    setEntries(load(account));
  }, [account]);

  const persist = useCallback(
    (next: ActivityEntry[]) => {
      setEntries(next);
      try {
        window.localStorage.setItem(keyFor(account), JSON.stringify(next));
      } catch {
        /* quota / private mode — keep in-memory only */
      }
    },
    [account]
  );

  const add = useCallback(
    (entry: Omit<ActivityEntry, "timestamp"> & { timestamp?: number }) => {
      setEntries((prev) => {
        if (prev.some((e) => e.id === entry.id)) return prev;
        const next = [
          { ...entry, timestamp: entry.timestamp ?? Date.now() },
          ...prev,
        ].slice(0, 50);
        try {
          window.localStorage.setItem(keyFor(account), JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [account]
  );

  const clear = useCallback(() => persist([]), [persist]);

  return { entries, add, clear };
}
