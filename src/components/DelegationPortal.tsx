"use client";

import { useState } from "react";
import type { useUniversalPay } from "@/hooks/useUniversalPay";
import type { ActivityEntry } from "@/hooks/useActivity";
import { DELEGATION_CHAINS } from "@/lib/constants";

// Multi-chain EIP-7702 delegation portal. One row per supported chain showing
// the EOA's live on-chain delegation status (account code read over RPC — the
// 0xef0100‖implementation designator), with a "Delegate" action that upgrades
// the EOA in place on that chain. Same address everywhere; the only thing that
// changes is the account code.
export function DelegationPortal({
  ua,
  onRecord,
}: {
  ua: ReturnType<typeof useUniversalPay>;
  onRecord: (entry: Omit<ActivityEntry, "timestamp">) => void;
}) {
  // Open by default so the per-chain rows (Base, Arbitrum, …) are visible
  // without a click — this card is a judge-facing proof surface.
  const [open, setOpen] = useState(true);
  const delegatedCount = DELEGATION_CHAINS.filter(
    (c) => ua.delegations[c.chainId]?.delegated
  ).length;

  function delegate(chainId: number, name: string) {
    void ua.prepareUpgrade(chainId, (hash) => {
      onRecord({
        id: hash || `upgrade-${chainId}-${Date.now()}`,
        kind: "upgrade",
        amount: "0.00",
        label: name,
        txHash: hash,
      });
    });
  }

  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/70">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-500/15 text-sm text-violet-600">
            🛰️
          </span>
          <div>
            <h2 className="text-base font-medium text-zinc-900">Delegation portal</h2>
            <p className="text-xs text-zinc-500">
              EIP-7702 status · upgraded on {delegatedCount} of{" "}
              {DELEGATION_CHAINS.length} chains
            </p>
          </div>
        </div>
        <span className="text-xs text-zinc-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-zinc-900/10 px-5 pb-5 pt-4">
          <p className="mb-1 text-xs text-zinc-500">
            One address, upgraded in place per chain. &ldquo;Delegated&rdquo; is
            read live from each chain&apos;s account code — verifiable proof, not
            app state.
          </p>
          <ul className="flex flex-col gap-2">
            {DELEGATION_CHAINS.map((c) => {
              const status = ua.delegations[c.chainId];
              const delegated = status?.delegated === true;
              return (
                <li
                  key={c.chainId}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{c.name}</p>
                    <p className="truncate font-mono text-[10px] text-zinc-400">
                      {delegated && status?.implementation
                        ? `→ ${status.implementation.slice(0, 10)}…${status.implementation.slice(-8)}`
                        : `chain ${c.chainId}`}
                    </p>
                  </div>
                  {status === undefined ? (
                    <span className="shrink-0 rounded-full bg-zinc-500/15 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
                      Checking…
                    </span>
                  ) : delegated ? (
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-600">
                      Delegated ✓
                    </span>
                  ) : (
                    <button
                      onClick={() => delegate(c.chainId, c.name)}
                      disabled={ua.busy || !ua.eoa}
                      className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
                    >
                      Delegate
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
