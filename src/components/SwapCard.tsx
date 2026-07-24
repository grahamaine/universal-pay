"use client";

import { useState } from "react";
import type { useUniversalPay } from "@/hooks/useUniversalPay";
import type { ActivityEntry } from "@/hooks/useActivity";
import { SWAP_TARGETS, type SwapTarget } from "@/lib/tokens";

// UniversalX-style swap: convert the whole unified balance into one target
// token, funded cross-chain from whatever mix of assets the account holds —
// the same createConvertTransaction primitive universalx.app trades on. Below
// the form, the account's recent Universal Account transactions (from the
// UniversalX backend) with a manual refresh.
export function SwapCard({
  ua,
  onRecord,
}: {
  ua: ReturnType<typeof useUniversalPay>;
  onRecord: (entry: Omit<ActivityEntry, "timestamp">) => void;
}) {
  const [target, setTarget] = useState<SwapTarget>(SWAP_TARGETS[0]);
  const [amount, setAmount] = useState("");

  async function handleSwap() {
    await ua.prepareSwap(target, amount.trim(), (hash) => {
      onRecord({
        id: hash || `swap-${Date.now()}`,
        kind: "swap",
        amount: amount.trim(),
        token: target.symbol,
        txHash: hash,
      });
      setAmount("");
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-zinc-900/10 bg-white/70 p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500/15 text-sm text-indigo-600">
          🔁
        </span>
        <div>
          <h2 className="text-base font-medium text-zinc-900">Swap</h2>
          <p className="text-xs text-zinc-500">
            Any asset, any chain → one token · powered by UniversalX
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-white/70 px-3.5 py-2.5 text-sm">
        <span className="text-zinc-600">From</span>
        <span className="text-zinc-700">
          Unified balance
          {ua.balanceUsd !== null ? ` · $${ua.balanceUsd.toFixed(2)}` : ""}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          To
        </p>
        <div className="grid grid-cols-3 gap-2">
          {SWAP_TARGETS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTarget(t)}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-sm transition ${
                target.key === t.key
                  ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-700"
                  : "border-zinc-900/10 bg-white/50 text-zinc-600 hover:border-zinc-900/20"
              }`}
            >
              <span>{t.icon}</span>
              <span className="font-medium">{t.symbol}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-zinc-900/10 bg-white/50 px-3.5 py-2.5">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
        />
        <span className="shrink-0 text-sm text-zinc-600">
          {target.symbol} you receive
        </span>
      </div>

      <button
        onClick={handleSwap}
        disabled={ua.busy || !(Number(amount) > 0)}
        className="rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {ua.busy ? "Preparing…" : `Swap to ${target.symbol}`}
      </button>

      <div className="flex flex-col gap-2 border-t border-zinc-900/10 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Recent transactions
          </p>
          <button
            onClick={() => void ua.refreshTransactions()}
            disabled={ua.txsLoading}
            className="rounded-lg border border-zinc-900/10 bg-white/70 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-900/20 disabled:opacity-50"
          >
            {ua.txsLoading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
        {ua.uaTxs.length === 0 ? (
          <p className="text-xs text-zinc-400">
            {ua.txsLoading
              ? "Loading history…"
              : "No transactions yet — swaps and payments will show up here."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-900/5">
            {ua.uaTxs.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm capitalize text-zinc-700">
                    {tx.tag.replace(/[_-]/g, " ")}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {tx.usd > 0 && (
                    <span className="text-xs text-zinc-600">
                      ${tx.usd.toFixed(2)}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      tx.done
                        ? "bg-emerald-500/15 text-emerald-600"
                        : tx.failed
                          ? "bg-rose-500/15 text-rose-600"
                          : "bg-amber-500/15 text-amber-600"
                    }`}
                  >
                    {tx.statusLabel}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
