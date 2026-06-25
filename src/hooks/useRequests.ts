"use client";

import { useCallback, useEffect, useState } from "react";

// A money request (invoice) the signed-in user created — money owed *to* them.
// Persisted per-account in localStorage, mirroring useContacts/useActivity.
export type MoneyRequest = {
  id: string;
  amount: string;
  /** Display symbol, e.g. "USDC". */
  token: string;
  /** Settlement-token key for the pay link, e.g. "usdc". */
  tokenKey: string;
  note?: string;
  /** Optional payer this was addressed to (address or contact name). */
  from?: string;
  createdAt: number;
  status: "pending" | "paid";
};

const keyFor = (account: string | null) =>
  `universal-pay:requests:${account?.toLowerCase() ?? "anon"}`;

function load(account: string | null): MoneyRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(account));
    return raw ? (JSON.parse(raw) as MoneyRequest[]) : [];
  } catch {
    return [];
  }
}

/** localStorage-backed list of created payment requests, scoped to the account. */
export function useRequests(account: string | null) {
  const [requests, setRequests] = useState<MoneyRequest[]>([]);

  useEffect(() => {
    setRequests(load(account));
  }, [account]);

  const persist = useCallback(
    (next: MoneyRequest[]) => {
      const sorted = [...next].sort((a, b) => b.createdAt - a.createdAt);
      setRequests(sorted);
      try {
        window.localStorage.setItem(keyFor(account), JSON.stringify(sorted));
      } catch {
        /* quota / private mode — keep in-memory only */
      }
    },
    [account]
  );

  const add = useCallback(
    (req: Omit<MoneyRequest, "id" | "createdAt" | "status">) => {
      const entry: MoneyRequest = {
        ...req,
        id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: Date.now(),
        status: "pending",
      };
      setRequests((prev) => {
        const next = [entry, ...prev];
        try {
          window.localStorage.setItem(keyFor(account), JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      return entry;
    },
    [account]
  );

  const setStatus = useCallback(
    (id: string, status: MoneyRequest["status"]) => {
      setRequests((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, status } : r));
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

  const remove = useCallback(
    (id: string) => persist(requests.filter((r) => r.id !== id)),
    [requests, persist]
  );

  const clear = useCallback(() => persist([]), [persist]);

  const pendingTotal = requests
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return { requests, add, setStatus, remove, clear, pendingTotal };
}
