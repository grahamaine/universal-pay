"use client";

import { useState } from "react";
import type { useUniversalPay } from "@/hooks/useUniversalPay";
import type { useCart } from "@/hooks/useCart";
import type { ActivityEntry } from "@/hooks/useActivity";
import { MERCHANTS, type MerchantCategory } from "@/lib/merchants";
import { DEFAULT_SETTLEMENT_TOKEN } from "@/lib/tokens";

const CATEGORIES: (MerchantCategory | "All")[] = [
  "All",
  "Streaming",
  "Music",
  "Shopping",
  "Gaming",
  "Social",
];

// Bills & Shopping cart — pay everyday subscriptions and orders (Netflix,
// Spotify, Amazon…) straight from the universal balance. Checkout routes through
// the same build→preview→confirm pipeline as a normal payment, so it inherits
// the cross-chain sourcing preview and EIP-7702 signing. For a safe demo the
// payee is the user's own account (a real on-chain round-trip, no funds lost);
// swap `payee` for a real merchant address to take it live.
export function CartCard({
  ua,
  cart,
  onRecord,
}: {
  ua: ReturnType<typeof useUniversalPay>;
  cart: ReturnType<typeof useCart>;
  onRecord: (entry: Omit<ActivityEntry, "timestamp">) => void;
}) {
  const [cat, setCat] = useState<MerchantCategory | "All">("All");
  const { lines, count, total, add, decrement, removeItem, clear } = cart;

  const shown =
    cat === "All" ? MERCHANTS : MERCHANTS.filter((m) => m.category === cat);

  const insufficient =
    ua.balanceUsd !== null && total > 0 && total > ua.balanceUsd;
  const canCheckout = !!ua.eoa && total > 0 && !ua.busy && !insufficient;

  async function checkout() {
    if (!ua.eoa || total <= 0) return;
    const names = lines.map((l) => l.merchant.name);
    const label =
      names.slice(0, 2).join(", ") +
      (names.length > 2 ? ` +${names.length - 2}` : "");

    // Demo payee: the user's own account — a real settlement on Arbitrum that
    // returns the funds, so live demos don't burn mainnet USDC.
    const payee = ua.eoa;

    await ua.preparePay(
      [{ address: payee, amount: total.toFixed(2) }],
      DEFAULT_SETTLEMENT_TOKEN,
      (res) => {
        onRecord({
          id: res.txHash || `shop-${Date.now()}`,
          kind: "shop",
          amount: total.toFixed(2),
          token: "USDC",
          label,
          txHash: res.txHash,
          explorerUrl: res.explorerUrl,
        });
        clear();
      },
      {
        action: "Checkout",
        summary: `Pay $${total.toFixed(2)} for ${count} item${count > 1 ? "s" : ""}`,
      }
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-medium text-white">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500/15 text-sm text-indigo-300">
              🛒
            </span>
            Bills &amp; Shopping
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Pay subscriptions &amp; orders from your one balance — any token, one tap.
          </p>
        </div>
        {count > 0 && (
          <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-semibold text-indigo-300">
            {count} in cart
          </span>
        )}
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              cat === c
                ? "bg-indigo-600 text-white"
                : "border border-white/10 text-zinc-400 hover:text-white"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Merchant catalogue */}
      <div className="grid grid-cols-2 gap-2">
        {shown.map((m) => (
          <button
            key={m.key}
            onClick={() => add(m.key)}
            className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.02] p-2.5 text-left transition hover:border-indigo-500/40 hover:bg-white/[0.05]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-lg">
              {m.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">
                {m.name}
              </span>
              <span className="block text-xs text-zinc-500">
                ${m.price.toFixed(2)}
                <span className="text-zinc-600"> {m.unit}</span>
              </span>
            </span>
            <span className="shrink-0 text-lg leading-none text-indigo-400">+</span>
          </button>
        ))}
      </div>

      {/* Cart summary */}
      {lines.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          {lines.map((l) => (
            <div key={l.merchant.key} className="flex items-center gap-2">
              <span className="text-base">{l.merchant.icon}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                {l.merchant.name}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => decrement(l.merchant.key)}
                  className="grid h-6 w-6 place-items-center rounded-md bg-white/5 text-zinc-300 hover:bg-white/10"
                  aria-label="decrease"
                >
                  −
                </button>
                <span className="w-5 text-center text-sm text-white">{l.qty}</span>
                <button
                  onClick={() => add(l.merchant.key)}
                  className="grid h-6 w-6 place-items-center rounded-md bg-white/5 text-zinc-300 hover:bg-white/10"
                  aria-label="increase"
                >
                  +
                </button>
              </div>
              <span className="w-16 text-right text-sm font-medium text-white">
                ${l.subtotal.toFixed(2)}
              </span>
              <button
                onClick={() => removeItem(l.merchant.key)}
                className="text-zinc-500 hover:text-red-400"
                aria-label="remove"
              >
                ✕
              </button>
            </div>
          ))}

          <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-2.5 text-sm">
            <span className="text-zinc-400">Total · {count} item{count > 1 ? "s" : ""}</span>
            <span className="font-semibold text-white">${total.toFixed(2)} USDC</span>
          </div>

          {insufficient && (
            <p className="text-xs text-amber-300">
              Short by ${(total - (ua.balanceUsd ?? 0)).toFixed(2)} — add funds to check out.
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={checkout}
              disabled={!canCheckout}
              className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {ua.busy
                ? "Processing…"
                : insufficient
                  ? "Insufficient balance"
                  : `Check out · $${total.toFixed(2)}`}
            </button>
            <button
              onClick={clear}
              className="rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-400 transition hover:text-white"
            >
              Clear
            </button>
          </div>
          <p className="text-[11px] text-zinc-600">
            Demo: settles USDC on Arbitrum to your own account (no funds lost).
            Swap in a real merchant address to go live.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-center text-xs text-zinc-500">
          Tap a service above to add it to your cart.
        </p>
      )}
    </section>
  );
}
