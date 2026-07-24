"use client";

import { useState } from "react";
import { SETTLEMENT_TOKENS, type SettlementToken } from "@/lib/tokens";

/** Pill dropdown to choose the settlement token a transfer/request lands in. */
export function TokenPicker({
  token,
  onToken,
}: {
  token: SettlementToken;
  onToken: (t: SettlementToken) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-zinc-900/10 bg-zinc-900/5 px-2.5 py-1 text-xs text-zinc-700 hover:border-zinc-900/20"
      >
        <span className="text-indigo-600">{token.icon}</span>
        <span className="font-medium text-zinc-900">{token.symbol}</span>
        <span className="text-zinc-500">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-900/10 bg-white shadow-xl shadow-zinc-900/10">
            {SETTLEMENT_TOKENS.map((t) => (
              <button
                type="button"
                key={t.key}
                onClick={() => {
                  onToken(t);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-900/5 ${
                  t.key === token.key ? "text-zinc-900" : "text-zinc-700"
                }`}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-600/20 text-indigo-600">
                  {t.icon}
                </span>
                <span className="font-medium">{t.symbol}</span>
                <span className="ml-auto text-xs text-zinc-500">{t.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
