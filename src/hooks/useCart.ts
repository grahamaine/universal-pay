"use client";

import { useCallback, useEffect, useState } from "react";
import { merchantByKey, type Merchant } from "@/lib/merchants";

// One line in the cart: a merchant plus how many of it.
export type CartItem = { key: string; qty: number };

// A resolved cart line for rendering — merchant joined with its quantity/subtotal.
export type CartLine = { merchant: Merchant; qty: number; subtotal: number };

// Scope the cart per signed-in account, mirroring useActivity / useContacts.
const keyFor = (account: string | null) =>
  `universal-pay:cart:${account?.toLowerCase() ?? "anon"}`;

function load(account: string | null): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(account));
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

/** localStorage-backed shopping cart, scoped to the active account. */
export function useCart(account: string | null) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(load(account));
  }, [account]);

  const persist = useCallback(
    (next: CartItem[]) => {
      setItems(next);
      try {
        window.localStorage.setItem(keyFor(account), JSON.stringify(next));
      } catch {
        /* quota / private mode — keep in-memory only */
      }
    },
    [account]
  );

  // Add one of a merchant (or bump its quantity if already in the cart).
  const add = useCallback(
    (key: string) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.key === key);
        const next = existing
          ? prev.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i))
          : [...prev, { key, qty: 1 }];
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

  // Drop one of a merchant, removing the line when it hits zero.
  const decrement = useCallback(
    (key: string) => {
      setItems((prev) => {
        const next = prev
          .map((i) => (i.key === key ? { ...i, qty: i.qty - 1 } : i))
          .filter((i) => i.qty > 0);
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

  const removeItem = useCallback(
    (key: string) => persist(items.filter((i) => i.key !== key)),
    [items, persist]
  );

  const clear = useCallback(() => persist([]), [persist]);

  // Join cart items with their merchant data; drop any unknown keys.
  const lines: CartLine[] = items
    .map((i) => {
      const merchant = merchantByKey(i.key);
      return merchant
        ? { merchant, qty: i.qty, subtotal: merchant.price * i.qty }
        : null;
    })
    .filter((l): l is CartLine => l !== null);

  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.subtotal, 0);

  return { items, lines, count, total, add, decrement, removeItem, clear };
}
