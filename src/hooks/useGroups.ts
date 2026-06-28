"use client";

import { useCallback, useEffect, useState } from "react";

export type GroupMember = { address: string; name?: string };

export type GroupExpense = {
  id: string;
  description: string;
  /** Amount in the chosen token. */
  amount: number;
  tokenKey: string;
  tokenSymbol: string;
  /** Address of the member who paid. */
  paidBy: string;
  /** Addresses of members sharing this expense. */
  splitAmong: string[];
  /** "equal" or "share" — if share, each address maps to a relative weight. */
  splitMode: "equal" | "share";
  shares?: Record<string, number>;
  createdAt: number;
};

export type Group = {
  id: string;
  name: string;
  members: GroupMember[];
  expenses: GroupExpense[];
  createdAt: number;
};

export type MemberBalance = {
  address: string;
  name?: string;
  /** Positive = owed to them; negative = they owe. */
  net: number;
};

export type SettleUpTx = {
  from: string;
  to: string;
  amount: number;
  tokenKey: string;
};

/** Compute net balances across all expenses in a group. */
export function computeBalances(group: Group): MemberBalance[] {
  const net: Record<string, number> = {};
  for (const m of group.members) net[m.address] = 0;

  for (const exp of group.expenses) {
    net[exp.paidBy] = (net[exp.paidBy] ?? 0) + exp.amount;

    if (exp.splitMode === "equal") {
      const share = exp.amount / exp.splitAmong.length;
      for (const addr of exp.splitAmong) {
        net[addr] = (net[addr] ?? 0) - share;
      }
    } else {
      const s = exp.shares ?? {};
      const total = exp.splitAmong.reduce((acc, a) => acc + (s[a] ?? 1), 0);
      for (const addr of exp.splitAmong) {
        net[addr] = (net[addr] ?? 0) - (exp.amount * (s[addr] ?? 1)) / total;
      }
    }
  }

  return group.members.map((m) => ({
    address: m.address,
    name: m.name,
    net: net[m.address] ?? 0,
  }));
}

/** Minimum-transaction greedy settle-up using the first expense's token. */
export function computeSettleUp(
  balances: MemberBalance[],
  tokenKey: string
): SettleUpTx[] {
  const result: SettleUpTx[] = [];
  const pos = balances
    .filter((b) => b.net > 0.005)
    .map((b) => ({ ...b, rem: b.net }))
    .sort((a, b) => b.rem - a.rem);
  const neg = balances
    .filter((b) => b.net < -0.005)
    .map((b) => ({ ...b, rem: -b.net }))
    .sort((a, b) => b.rem - a.rem);

  let pi = 0;
  let ni = 0;
  while (pi < pos.length && ni < neg.length) {
    const pay = Math.min(pos[pi].rem, neg[ni].rem);
    if (pay > 0.005) {
      result.push({
        from: neg[ni].address,
        to: pos[pi].address,
        amount: Math.round(pay * 100) / 100,
        tokenKey,
      });
    }
    pos[pi].rem -= pay;
    neg[ni].rem -= pay;
    if (pos[pi].rem < 0.005) pi++;
    if (neg[ni].rem < 0.005) ni++;
  }
  return result;
}

const keyFor = (account: string | null) =>
  `universal-pay:groups:${account?.toLowerCase() ?? "anon"}`;

function load(account: string | null): Group[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(account));
    return raw ? (JSON.parse(raw) as Group[]) : [];
  } catch {
    return [];
  }
}

export function useGroups(account: string | null) {
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    setGroups(load(account));
  }, [account]);

  const persist = useCallback(
    (next: Group[]) => {
      setGroups(next);
      try {
        window.localStorage.setItem(keyFor(account), JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [account]
  );

  const createGroup = useCallback(
    (name: string, members: GroupMember[]) => {
      const g: Group = {
        id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        members,
        expenses: [],
        createdAt: Date.now(),
      };
      setGroups((prev) => {
        const next = [g, ...prev];
        try {
          window.localStorage.setItem(keyFor(account), JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      return g;
    },
    [account]
  );

  const addExpense = useCallback(
    (groupId: string, exp: Omit<GroupExpense, "id" | "createdAt">) => {
      setGroups((prev) => {
        const next = prev.map((g) => {
          if (g.id !== groupId) return g;
          const entry: GroupExpense = {
            ...exp,
            id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            createdAt: Date.now(),
          };
          return { ...g, expenses: [...g.expenses, entry] };
        });
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

  const removeExpense = useCallback(
    (groupId: string, expId: string) => {
      setGroups((prev) => {
        const next = prev.map((g) =>
          g.id !== groupId
            ? g
            : { ...g, expenses: g.expenses.filter((e) => e.id !== expId) }
        );
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

  const removeGroup = useCallback(
    (groupId: string) => persist(groups.filter((g) => g.id !== groupId)),
    [groups, persist]
  );

  return { groups, createGroup, addExpense, removeExpense, removeGroup };
}
