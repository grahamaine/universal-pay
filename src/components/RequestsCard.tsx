"use client";

import { useState } from "react";
import { buildPayLink } from "@/lib/links";
import {
  DEFAULT_SETTLEMENT_TOKEN,
  settlementTokenByKey,
  type SettlementToken,
} from "@/lib/tokens";
import { TokenPicker } from "@/components/TokenPicker";
import { QrImage } from "@/components/QrImage";
import type { useRequests, MoneyRequest } from "@/hooks/useRequests";

function linkFor(ownerAddress: string, r: MoneyRequest): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://unify-ux.vercel.app";
  return buildPayLink(origin, {
    to: ownerAddress,
    amount: r.amount,
    note: r.note,
    token: r.tokenKey,
  });
}

/** Create + track payment requests (invoices) owed to the signed-in user. */
export function RequestsCard({
  requests,
  ownerAddress,
}: {
  requests: ReturnType<typeof useRequests>;
  ownerAddress: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [from, setFrom] = useState("");
  const [token, setToken] = useState<SettlementToken>(DEFAULT_SETTLEMENT_TOKEN);

  const canCreate = Number(amount) > 0 && !!ownerAddress;

  function create() {
    if (!canCreate) return;
    requests.add({
      amount: token.stable ? Number(amount).toFixed(2) : amount.trim(),
      token: token.symbol,
      tokenKey: token.key,
      note: note.trim() || undefined,
      from: from.trim() || undefined,
    });
    setAmount("");
    setNote("");
    setFrom("");
    setOpen(false);
  }

  const pending = requests.requests.filter((r) => r.status === "pending");

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-white">Requests</h2>
        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs text-amber-300">
              {requests.pendingTotal.toFixed(2)} owed · {pending.length}
            </span>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            {open ? "Cancel" : "+ New"}
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center rounded-xl border border-white/10 bg-white/5 px-2">
              <span className="text-xs text-zinc-500">{token.icon}</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder={token.stable ? "0.00" : "0.0"}
                className="w-full bg-transparent px-2 py-2.5 text-sm text-white outline-none"
              />
            </div>
            <TokenPicker token={token} onToken={setToken} />
          </div>
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="From (name or address) — optional"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What's it for? — optional"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
          />
          <button
            onClick={create}
            disabled={!canCreate}
            className="rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Create request
          </button>
        </div>
      )}

      {requests.requests.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No requests yet. Create one to get a shareable pay link &amp; QR.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.requests.map((r) => (
            <RequestRow
              key={r.id}
              r={r}
              ownerAddress={ownerAddress}
              onMark={(s) => requests.setStatus(r.id, s)}
              onRemove={() => requests.remove(r.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestRow({
  r,
  ownerAddress,
  onMark,
  onRemove,
}: {
  r: MoneyRequest;
  ownerAddress: string | null;
  onMark: (s: MoneyRequest["status"]) => void;
  onRemove: () => void;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = ownerAddress ? linkFor(ownerAddress, r) : "";
  const paid = r.status === "paid";
  const icon = settlementTokenByKey(r.tokenKey).icon;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Payment request", text: r.note, url: link });
      } catch {
        /* dismissed */
      }
    } else {
      copy();
    }
  }

  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium text-white">
            <span className="text-indigo-300">{icon}</span>
            {r.amount} {r.token}
            {paid && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                paid
              </span>
            )}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {r.from ? `from ${r.from}` : "shareable link"}
            {r.note ? ` · ${r.note}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs">
          <button
            onClick={() => setShow((v) => !v)}
            className="rounded-lg bg-white/5 px-2 py-1 text-zinc-300 hover:bg-white/10"
          >
            {show ? "Hide" : "Link"}
          </button>
          <button
            onClick={() => onMark(paid ? "pending" : "paid")}
            className={`rounded-lg px-2 py-1 ${
              paid
                ? "bg-white/5 text-zinc-400 hover:bg-white/10"
                : "bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
            }`}
          >
            {paid ? "Undo" : "Mark paid"}
          </button>
          <button
            onClick={onRemove}
            className="rounded-lg px-1.5 py-1 text-zinc-500 hover:text-red-400"
            aria-label="delete request"
          >
            ✕
          </button>
        </div>
      </div>

      {show && link && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <QrImage value={link} size={150} />
          <div className="flex w-full items-center gap-1.5">
            <input
              readOnly
              value={link}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-zinc-400 outline-none"
            />
            <button
              onClick={copy}
              className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              {copied ? "✓" : "Copy"}
            </button>
            <button
              onClick={share}
              className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20"
            >
              Share
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
