"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { isAddress } from "@/lib/links";
import type { useContacts } from "@/hooks/useContacts";

/** Manage the saved address book and pick a contact to pay. */
export function ContactsModal({
  open,
  onClose,
  contacts,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  contacts: ReturnType<typeof useContacts>;
  onPick: (address: string) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    if (!name.trim()) return setError("Add a name");
    if (!isAddress(address)) return setError("That's not a valid 0x address");
    contacts.save(address, name);
    setName("");
    setAddress("");
    setError(null);
  }

  return (
    <Modal open={open} onClose={onClose} title="Contacts">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x address"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-xs text-white outline-none"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={add}
            className="rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Save contact
          </button>
        </div>

        {contacts.contacts.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-500">
            No saved contacts yet.
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col divide-y divide-white/5 overflow-y-auto">
            {contacts.contacts.map((c) => (
              <li key={c.address} className="flex items-center justify-between gap-2 py-2.5">
                <button
                  onClick={() => {
                    onPick(c.address);
                    onClose();
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-600/20 text-sm font-semibold text-indigo-300">
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">
                      {c.name}
                    </span>
                    <span className="block truncate font-mono text-xs text-zinc-500">
                      {c.address.slice(0, 10)}…{c.address.slice(-6)}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => contacts.remove(c.address)}
                  className="shrink-0 text-zinc-500 hover:text-red-400"
                  aria-label={`Remove ${c.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
