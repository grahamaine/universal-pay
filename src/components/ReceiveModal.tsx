"use client";

import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { QrImage } from "./QrImage";
import { buildPayLink } from "@/lib/links";

/**
 * "Get paid" sheet. Two modes:
 *  - Receive: a QR of your raw address for in-person scanning.
 *  - Request: enter an amount/note to mint a shareable pay link (with its own QR).
 */
export function ReceiveModal({
  open,
  onClose,
  address,
}: {
  open: boolean;
  onClose: () => void;
  address: string;
}) {
  const [tab, setTab] = useState<"receive" | "request">("receive");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://unify-ux.vercel.app";

  const link = useMemo(
    () => buildPayLink(origin, { to: address, amount, note }),
    [origin, address, amount, note]
  );

  const qrValue = tab === "receive" ? address : link;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Pay me on Universal Pay",
          text: note || `Requesting ${amount ? `$${amount}` : "a payment"}`,
          url: link,
        });
        return;
      }
    } catch {
      /* user cancelled or unsupported — fall back to copy */
    }
    await copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(tab === "receive" ? address : link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Get paid">
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
        {(["receive", "request"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg py-2 text-sm font-medium capitalize transition ${
              tab === t ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4">
        <QrImage value={qrValue} />

        {tab === "request" && (
          <div className="flex w-full flex-col gap-2">
            <div className="flex items-center rounded-xl border border-white/10 bg-white/5 px-3">
              <span className="text-sm text-zinc-500">$</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full bg-transparent px-2 py-2.5 text-sm text-white outline-none"
              />
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What's it for? (optional)"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none"
            />
          </div>
        )}

        <p className="w-full break-all rounded-xl bg-white/5 px-3 py-2 text-center font-mono text-xs text-zinc-400">
          {tab === "receive" ? address : link}
        </p>

        <div className="grid w-full grid-cols-2 gap-2">
          <button
            onClick={copy}
            className="rounded-xl border border-white/10 py-3 text-sm font-semibold text-white hover:bg-white/5"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button
            onClick={share}
            className="rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Share
          </button>
        </div>
      </div>
    </Modal>
  );
}
