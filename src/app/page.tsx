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
import { useContacts } from "@/hooks/useContacts";
import { ReceiveModal } from "@/components/ReceiveModal";
import { ScanModal } from "@/components/ScanModal";
import { ContactsModal } from "@/components/ContactsModal";
import { parsePayRequest, type PayRequest } from "@/lib/links";

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
    <header className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white shadow-lg shadow-indigo-900/40">
        U
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Universal Pay
        </h1>
        <p className="text-xs text-zinc-500">
          Pay or split with anyone — any chain, any token, one balance.
        </p>
      </div>
    </header>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-32 rounded-3xl bg-white/5" />
      <div className="h-16 rounded-2xl bg-white/5" />
      <div className="h-44 rounded-3xl bg-white/5" />
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
      className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-white">Sign in</h2>
        <p className="text-sm text-zinc-400">
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
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-500"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? "Setting up your account…" : "Continue with email"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}

function Dashboard({ ua }: { ua: ReturnType<typeof useUniversalPay> }) {
  const [recipients, setRecipients] = useState<Recipient[]>([
    { address: "", amount: "" },
  ]);
  const [result, setResult] = useState<PayResult | null>(null);
  const [incoming, setIncoming] = useState<PayRequest | null>(null);
  const [sheet, setSheet] = useState<null | "receive" | "scan" | "contacts">(null);
  const activity = useActivity(ua.eoa);
  const contacts = useContacts(ua.eoa);

  // Honour an incoming "request money" link: ?to=…&amount=…&note=…
  useEffect(() => {
    const req = parsePayRequest(new URLSearchParams(window.location.search));
    if (!req) return;
    setIncoming(req);
    setRecipients([{ address: req.to, amount: req.amount ?? "" }]);
    // Clean the URL so a refresh doesn't keep re-prefilling.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

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
  function fillFirstEmpty(address: string, amount?: string) {
    setRecipients((rs) => {
      const i = rs.findIndex((r) => !r.address.trim());
      const idx = i === -1 ? rs.length : i;
      const next = i === -1 ? [...rs, { address: "", amount: "" }] : [...rs];
      next[idx] = { address, amount: amount ?? next[idx]?.amount ?? "" };
      return next;
    });
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
      setIncoming(null);
    } catch (e) {
      ua.setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <BalanceCard ua={ua} />

      <QuickActions
        ownerReady={!!ua.eoa}
        onReceive={() => setSheet("receive")}
        onScan={() => setSheet("scan")}
        onContacts={() => setSheet("contacts")}
        depositSlot={
          <DepositAction
            ownerAddress={ua.eoa}
            onCredited={ua.refreshBalance}
            onRecord={activity.add}
          />
        }
      />

      {incoming && (
        <div className="flex items-start gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm">
          <span className="text-lg">💸</span>
          <div className="min-w-0">
            <p className="font-medium text-indigo-200">Payment request loaded</p>
            <p className="text-indigo-300/70">
              {incoming.note ? `“${incoming.note}” — ` : ""}
              {incoming.amount ? `$${incoming.amount} ` : ""}prefilled below.
            </p>
          </div>
        </div>
      )}

      <SendCard
        recipients={recipients}
        isSplit={isSplit}
        total={total}
        busy={ua.busy}
        error={ua.error}
        contacts={contacts}
        onUpdate={update}
        onAdd={addRecipient}
        onRemove={removeRecipient}
        onPay={handlePay}
      />

      {result && <SuccessCard result={result} onDismiss={() => setResult(null)} />}

      <ActivityFeed entries={activity.entries} onClear={activity.clear} />

      <ReceiveModal
        open={sheet === "receive"}
        onClose={() => setSheet(null)}
        address={ua.eoa ?? ""}
      />
      <ScanModal
        open={sheet === "scan"}
        onClose={() => setSheet(null)}
        onResult={(req) => fillFirstEmpty(req.to, req.amount)}
      />
      <ContactsModal
        open={sheet === "contacts"}
        onClose={() => setSheet(null)}
        contacts={contacts}
        onPick={(addr) => fillFirstEmpty(addr)}
      />
    </div>
  );
}

function QuickActions({
  ownerReady,
  onReceive,
  onScan,
  onContacts,
  depositSlot,
}: {
  ownerReady: boolean;
  onReceive: () => void;
  onScan: () => void;
  onContacts: () => void;
  depositSlot: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {depositSlot}
      <ActionButton icon="↓" label="Get paid" onClick={onReceive} disabled={!ownerReady} />
      <ActionButton icon="⌗" label="Scan" onClick={onScan} />
      <ActionButton icon="☆" label="Contacts" onClick={onContacts} />
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] py-3 text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-40"
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-600/20 text-base text-indigo-300">
        {icon}
      </span>
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

// The deposit hook lives here so it can sit inside the QuickActions row while
// still listening for completed cross-chain deposits to refresh balance + log.
function DepositAction({
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
      <ActionButton
        icon="+"
        label={isReady ? "Add funds" : "…"}
        onClick={() => setOpen(true)}
        disabled={!isReady}
      />
      <DepositModal isOpen={open} onClose={() => setOpen(false)} theme="dark" />
    </>
  );
}

function SendCard({
  recipients,
  isSplit,
  total,
  busy,
  error,
  contacts,
  onUpdate,
  onAdd,
  onRemove,
  onPay,
}: {
  recipients: Recipient[];
  isSplit: boolean;
  total: string;
  busy: boolean;
  error: string | null;
  contacts: ReturnType<typeof useContacts>;
  onUpdate: (i: number, patch: Partial<Recipient>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onPay: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-white">
          {isSplit ? "Split a bill" : "Send money"}
        </h2>
        <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-zinc-400">
          settles on Arbitrum
        </span>
      </div>

      {recipients.map((r, i) => {
        const known = contacts.find(r.address);
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <input
                value={r.address}
                onChange={(e) => onUpdate(i, { address: e.target.value })}
                placeholder="0x recipient address"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-xs text-white outline-none transition focus:border-indigo-500"
              />
              <div className="flex items-center rounded-xl border border-white/10 bg-white/5 px-2">
                <span className="text-xs text-zinc-500">$</span>
                <input
                  value={r.amount}
                  onChange={(e) => onUpdate(i, { amount: e.target.value })}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-16 bg-transparent px-1 py-2.5 text-right text-sm text-white outline-none"
                />
              </div>
              {recipients.length > 1 && (
                <button
                  onClick={() => onRemove(i)}
                  className="text-zinc-500 hover:text-red-400"
                  aria-label="remove"
                >
                  ✕
                </button>
              )}
            </div>
            {r.address.trim() &&
              (known ? (
                <span className="pl-1 text-xs text-emerald-400">★ {known.name}</span>
              ) : (
                <SaveContactInline address={r.address} contacts={contacts} />
              ))}
          </div>
        );
      })}

      <button
        onClick={onAdd}
        className="self-start text-sm font-medium text-indigo-400 hover:text-indigo-300"
      >
        + Add person to split
      </button>

      <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-3 text-sm">
        <span className="text-zinc-400">
          Total {isSplit ? `· ${recipients.length} people` : ""}
        </span>
        <span className="font-semibold text-white">${total} USDC</span>
      </div>

      <button
        onClick={onPay}
        disabled={busy}
        className="rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? "Sending…" : isSplit ? `Split $${total}` : `Send $${total}`}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </section>
  );
}

function SaveContactInline({
  address,
  contacts,
}: {
  address: string;
  contacts: ReturnType<typeof useContacts>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const valid = /^0x[a-fA-F0-9]{40}$/.test(address.trim());
  if (!valid) return null;

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="self-start pl-1 text-xs text-zinc-500 hover:text-indigo-400"
      >
        + Save as contact
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5 pl-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="w-28 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none"
      />
      <button
        onClick={() => {
          contacts.save(address, name);
          setEditing(false);
          setName("");
        }}
        className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
      >
        Save
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-xs text-zinc-500 hover:text-zinc-300"
      >
        Cancel
      </button>
    </div>
  );
}

function BalanceCard({ ua }: { ua: ReturnType<typeof useUniversalPay> }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 p-5 text-white shadow-xl shadow-indigo-950/40">
      <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-indigo-200">
            Universal balance
          </p>
          <p className="mt-1 text-4xl font-bold">
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
      <div className="relative mt-5 flex items-center justify-between text-xs text-indigo-100">
        <span title={ua.eoa ?? ""}>
          {ua.email} · {ua.eoa ? `${ua.eoa.slice(0, 6)}…${ua.eoa.slice(-4)}` : ""}
        </span>
        <button onClick={ua.logout} className="underline hover:text-white">
          Sign out
        </button>
      </div>
      <p className="relative mt-2 text-[11px] text-indigo-200/80">
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
    <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-emerald-300">✓ ${result.total} sent</h3>
        <button onClick={onDismiss} className="text-emerald-400">
          ✕
        </button>
      </div>
      <p className="mt-1 text-sm text-emerald-300/80">
        Paid {result.recipients} {result.recipients > 1 ? "people" : "person"},
        settled on Arbitrum.
      </p>
      <a
        href={result.explorerUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-sm font-medium text-emerald-300 underline"
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
    <section className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-white">Activity</h2>
        <button
          onClick={onClear}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Clear
        </button>
      </div>
      <ul className="flex flex-col divide-y divide-white/5">
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
        : `Deposit${entry.chainId ? ` from ${getChainName(entry.chainId)}` : ""}`;

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm ${
            incoming
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-indigo-500/15 text-indigo-300"
          }`}
        >
          {incoming ? "↓" : "↑"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-zinc-500">{timeAgo(entry.timestamp)}</p>
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span
          className={`text-sm font-semibold ${
            incoming ? "text-emerald-400" : "text-white"
          }`}
        >
          {incoming ? "+" : "−"}${entry.amount}
        </span>
        {entry.explorerUrl && (
          <a
            href={entry.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-indigo-400 hover:underline"
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
    <footer className="mt-auto pt-4 text-center text-[11px] text-zinc-600">
      Particle Universal Accounts (EIP-7702) · Magic · Arbitrum
    </footer>
  );
}
