"use client";

import { useCallback, useEffect, useState } from "react";

// A saved payee. Addresses are stored lowercased for stable dedup/lookup.
export type Contact = {
  address: string;
  name: string;
};

// Scope the address book per signed-in account, mirroring useActivity.
const keyFor = (account: string | null) =>
  `universal-pay:contacts:${account?.toLowerCase() ?? "anon"}`;

function load(account: string | null): Contact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(account));
    return raw ? (JSON.parse(raw) as Contact[]) : [];
  } catch {
    return [];
  }
}

/** localStorage-backed address book, scoped to the active account. */
export function useContacts(account: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    setContacts(load(account));
  }, [account]);

  const persist = useCallback(
    (next: Contact[]) => {
      const sorted = [...next].sort((a, b) => a.name.localeCompare(b.name));
      setContacts(sorted);
      try {
        window.localStorage.setItem(keyFor(account), JSON.stringify(sorted));
      } catch {
        /* quota / private mode — keep in-memory only */
      }
    },
    [account]
  );

  // Add or rename: keyed by address, so saving an existing address updates it.
  const save = useCallback(
    (address: string, name: string) => {
      const addr = address.trim().toLowerCase();
      const label = name.trim();
      if (!addr || !label) return;
      setContacts((prev) => {
        const next = [
          ...prev.filter((c) => c.address !== addr),
          { address: addr, name: label },
        ].sort((a, b) => a.name.localeCompare(b.name));
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
    (address: string) => {
      persist(contacts.filter((c) => c.address !== address.toLowerCase()));
    },
    [contacts, persist]
  );

  const find = useCallback(
    (address: string): Contact | undefined =>
      contacts.find((c) => c.address === address.trim().toLowerCase()),
    [contacts]
  );

  return { contacts, save, remove, find };
}
