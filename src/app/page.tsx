"use client";

import { useEffect, useState } from "react";
import {
  DepositProvider,
  DepositModal,
  useDeposit,
  CHAIN,
  getChainName,
} from "@particle-network/universal-deposit/react";
import { useUniversalPay, type Recipient, type PayResult } from "@/hooks/useUniversalPay";
import { useActivity, type ActivityEntry } from "@/hooks/useActivity";

export default function Home() {
  const ua = useUniversalPay();

  return (
    // Cross-chain deposits all consolidate to the user's account on Arbitrum —
    // the same chain Universal Pay settles transfers on.
    <DepositProvider config={{ destination: { chainId: CHAIN.ARBITRUM } }}>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-8">
        <Header />
        {ua.status === "loading" && <Skeleton />}
        {ua.status === "idle" && (
          <Login busy={ua.busy} error={ua.error} onLogin={ua.login} />
        )}
        {ua.status === "ready" && <Dashboard ua={ua} />}
        <Footer />
      </main>
    </DepositProvider>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
          U
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Universal Pay</h1>
      </div>
      <p className="text-sm text-zinc-500">
        Pay or split with anyone — any chain, any token, one balance.
      </p>
    </header>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-28 rounded-2xl bg-zinc-200/70 dark:bg-zinc-800" />
      <div className="h-40 rounded-2xl bg-zinc-200/70 dark:bg-zinc-800" />
    </div>
  );
}

function Login({
  busy,
  error,
  onLogin,
}: {
  busy: boolean;
  error: string | null;
  onLogin: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) onLogin(email.trim());
      }}
      className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-medium">Sign in</h2>
        <p className="text-sm text-zinc-500">
          No wallet, no seed phrase. Just your email — we upgrade it into a
          chain-abstracted account behind the scenes.
        </p>
      </div>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="rounded-xl border border-zinc-300 bg-transparent px-4 py-3 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? "Setting up your account…" : "Continue with email"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </form>
  );
}

function Dashboard({ ua }: { ua: ReturnType<typeof useUniversalPay> }) {
  const [recipients, setRecipients] = useState<Recipient[]>([
    { address: "", amount: "" },
  ]);
  const [result, setResult] = useState<PayResult | null>(null);
  const activity = useActivity(ua.eoa);

  const total = recipients
    .reduce((s, r) => s + (Number(r.amount) || 0), 0)
    .toFixed(2);
  const isSplit = recipients.length > 1;

  function update(i: number, patch: Partial<Recipient>) {
    setRecipients((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRecipient() {
    setRecipients((rs) => [...rs, { address: "", amount: "" }]);
  }
  function removeRecipient(i: number) {
    setRecipients((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function handlePay() {
    ua.setError(null);
    try {
      const res = await ua.pay(recipients);
      setResult(res);
      activity.add({
        id: res.txHash || `pay-${Date.now()}`,
        kind: res.recipients > 1 ? "split" : "sent",
        amount: res.total,
        recipients: res.recipients,
        token: "USDC",
        txHash: res.txHash,
        explorerUrl: res.explorerUrl,
      });
      setRecipients([{ address: "", amount: "" }]);
    } catch (e) {
      ua.setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <BalanceCard ua={ua} />
      <DepositSection
        ownerAddress={ua.eoa}
        onCredited={ua.refreshBalance}
        onRecord={activity.add}
      />

      <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">
            {isSplit ? "Split a bill" : "Send money"}
          </h2>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
            settles on Arbitrum
          </span>
        </div>

        {recipients.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={r.address}
              onChange={(e) => update(i, { address: e.target.value })}
              placeholder="0x recipient address"
              className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 font-mono text-xs outline-none focus:border-indigo-500 dark:border-zinc-700"
            />
            <div className="flex items-center rounded-xl border border-zinc-300 px-2 dark:border-zinc-700">
              <span className="text-xs text-zinc-400">$</span>
              <input
                value={r.amount}
                onChange={(e) => update(i, { amount: e.target.value })}
                inputMode="decimal"
                placeholder="0.00"
                className="w-16 bg-transparent px-1 py-2.5 text-right text-sm outline-none"
              />
            </div>
            {recipients.length > 1 && (
              <button
                onClick={() => removeRecipient(i)}
                className="text-zinc-400 hover:text-red-500"
                aria-label="remove"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <button
          onClick={addRecipient}
          className="self-start text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          + Add person to split
        </button>

        <div className="mt-1 flex items-center justify-between border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
          <span className="text-zinc-500">
            Total {isSplit ? `· ${recipients.length} people` : ""}
          </span>
          <span className="font-semibold">${total} USDC</span>
        </div>

        <button
          onClick={handlePay}
          disabled={ua.busy}
          className="rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {ua.busy
            ? "Sending…"
            : isSplit
              ? `Split $${total}`
              : `Send $${total}`}
        </button>

        {ua.error && <p className="text-sm text-red-500">{ua.error}</p>}
      </section>

      {result && <SuccessCard result={result} onDismiss={() => setResult(null)} />}

      <ActivityFeed entries={activity.entries} onClear={activity.clear} />
    </div>
  );
}

function DepositSection({
  ownerAddress,
  onCredited,
  onRecord,
}: {
  ownerAddress: string | null;
  onCredited: () => void;
  onRecord: (entry: Omit<ActivityEntry, "timestamp">) => void;
}) {
  const { isReady, recentActivity } = useDeposit({
    ownerAddress: ownerAddress ?? undefined,
  });
  const [open, setOpen] = useState(false);

  // Once a cross-chain deposit lands and is swept to Arbitrum, refresh the
  // balance and log it to the activity feed (deduped by id inside `add`).
  const completed = recentActivity.filter((a) => a.type === "complete");
  const completedCount = completed.length;
  useEffect(() => {
    if (completedCount === 0) return;
    onCredited();
    for (const a of completed) {
      onRecord({
        id: a.id,
        kind: "deposit",
        amount: a.amountUSD.toFixed(2),
        token: a.token,
        chainId: a.chainId,
        explorerUrl: a.result?.explorerUrl,
      });
    }
    // `completed` is derived; gate on its length to avoid re-running each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedCount, onCredited, onRecord]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!isReady}
        className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-indigo-300 py-3 text-sm font-semibold text-indigo-600 transition hover:border-indigo-400 hover:bg-indigo-50/50 disabled:opacity-50 dark:border-indigo-800 dark:hover:bg-indigo-950/30"
      >
        ↓ Add funds {isReady ? "from any chain" : "(connecting…)"}
      </button>
      <DepositModal isOpen={open} onClose={() => setOpen(false)} theme="dark" />
    </>
  );
}

function BalanceCard({ ua }: { ua: ReturnType<typeof useUniversalPay> }) {
  return (
    <section className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-indigo-200">
            Universal balance
          </p>
          <p className="mt-1 text-3xl font-bold">
            {ua.balanceUsd === null ? "—" : `$${ua.balanceUsd.toFixed(2)}`}
          </p>
        </div>
        <button
          onClick={ua.refreshBalance}
          className="rounded-lg bg-white/15 px-2 py-1 text-xs hover:bg-white/25"
        >
          ↻ Refresh
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-indigo-100">
        <span title={ua.eoa ?? ""}>
          {ua.email} · {ua.eoa ? `${ua.eoa.slice(0, 6)}…${ua.eoa.slice(-4)}` : ""}
        </span>
        <button onClick={ua.logout} className="underline hover:text-white">
          Sign out
        </button>
      </div>
      <p className="mt-2 text-[11px] text-indigo-200">
        EOA upgraded in-place via EIP-7702 — assets from every chain, one number.
      </p>
    </section>
  );
}

function SuccessCard({
  result,
  onDismiss,
}: {
  result: PayResult;
  onDismiss: () => void;
}) {
  return (
    <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/40">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-emerald-700 dark:text-emerald-300">
          ✓ ${result.total} sent
        </h3>
        <button onClick={onDismiss} className="text-emerald-600">
          ✕
        </button>
      </div>
      <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-300/80">
        Paid {result.recipients} {result.recipients > 1 ? "people" : "person"},
        settled on Arbitrum.
      </p>
      <a
        href={result.explorerUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-sm font-medium text-emerald-700 underline dark:text-emerald-300"
      >
        View on Arbiscan →
      </a>
    </section>
  );
}

function ActivityFeed({
  entries,
  onClear,
}: {
  entries: ActivityEntry[];
  onClear: () => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">Activity</h2>
        <button
          onClick={onClear}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          Clear
        </button>
      </div>
      <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
        {entries.map((e) => (
          <ActivityRow key={e.id} entry={e} />
        ))}
      </ul>
    </section>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const incoming = entry.kind === "deposit";
  const title =
    entry.kind === "split"
      ? `Split with ${entry.recipients} people`
      : entry.kind === "sent"
        ? "Sent"
        : `Deposit${
            entry.chainId ? ` from ${getChainName(entry.chainId)}` : ""
          }`;

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm ${
            incoming
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
          }`}
        >
          {incoming ? "↓" : "↑"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="text-xs text-zinc-400">{timeAgo(entry.timestamp)}</p>
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span
          className={`text-sm font-semibold ${
            incoming ? "text-emerald-600 dark:text-emerald-400" : ""
          }`}
        >
          {incoming ? "+" : "−"}${entry.amount}
        </span>
        {entry.explorerUrl && (
          <a
            href={entry.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-indigo-500 hover:underline"
          >
            View ↗
          </a>
        )}
      </div>
    </li>
  );
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

function Footer() {
  return (
    <footer className="mt-auto pt-4 text-center text-[11px] text-zinc-400">
      Particle Universal Accounts (EIP-7702) · Magic · Arbitrum
    </footer>
  );
}
