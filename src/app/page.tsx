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
import {
  DEFAULT_SETTLEMENT_TOKEN,
  settlementTokenByKey,
  type SettlementToken,
} from "@/lib/tokens";
import { TokenPicker } from "@/components/TokenPicker";
import { useRequests } from "@/hooks/useRequests";
import { RequestsCard } from "@/components/RequestsCard";
import { GroupsCard } from "@/components/GroupsCard";
import { SplashScreen } from "@/components/SplashScreen";
import { FeatureSidebar } from "@/components/FeatureSidebar";

export default function Home() {
  const ua = useUniversalPay();

  return (
    // Cross-chain deposits all consolidate to the user's account on Arbitrum —
    // the same chain Universal Pay settles transfers on.
    <DepositProvider config={{ destination: { chainId: CHAIN.ARBITRUM } }}>
      <SplashScreen />
      {ua.status === "ready" ? (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-8">
          <Header />
          <Dashboard ua={ua} />
          <Footer />
        </main>
      ) : (
        <Landing
          loading={ua.status === "loading"}
          busy={ua.busy}
          error={ua.error}
          onLogin={ua.login}
        />
      )}
    </DepositProvider>
  );
}

function Landing({
  loading,
  busy,
  error,
  onLogin,
}: {
  loading: boolean;
  busy: boolean;
  error: string | null;
  onLogin: (email: string) => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 lg:py-12">
      <Header />
      <div className="grid flex-1 items-start gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <FeatureSidebar />
        <div className="rise-in" style={{ animationDelay: "0.15s" }}>
          {loading ? (
            <Skeleton />
          ) : (
            <Login busy={busy} error={error} onLogin={onLogin} />
          )}
        </div>
      </div>
      <Footer />
    </main>
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
  const [token, setToken] = useState<SettlementToken>(DEFAULT_SETTLEMENT_TOKEN);
  const [sheet, setSheet] = useState<null | "receive" | "scan" | "contacts">(null);
  // Share-based split state
  const [splitMode, setSplitMode] = useState<"amount" | "share">("amount");
  const [shares, setShares] = useState<Record<number, number>>({});
  const [shareTotal, setShareTotal] = useState("");
  const activity = useActivity(ua.eoa);
  const contacts = useContacts(ua.eoa);
  const requests = useRequests(ua.eoa);

  // Cross-chain funding lives at the dashboard level so the deposit modal can be
  // opened from the quick-action, the empty-balance prompt, or the insufficient-
  // balance nudge under the Send button — all funnel through one controller.
  const deposit = useDepositController(ua.eoa, ua.refreshBalance, activity.add);

  // Honour an incoming "request money" link: ?to=…&amount=…&note=…&token=…
  useEffect(() => {
    const req = parsePayRequest(new URLSearchParams(window.location.search));
    if (!req) return;
    setIncoming(req);
    setRecipients([{ address: req.to, amount: req.amount ?? "" }]);
    if (req.token) setToken(settlementTokenByKey(req.token));
    // Clean the URL so a refresh doesn't keep re-prefilling.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const totalNum = recipients.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const total = token.stable
    ? totalNum.toFixed(2)
    : Number(totalNum.toFixed(6)).toString();
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
  // Split a single total equally across everyone currently in the form.
  function splitEvenly(totalStr: string) {
    const t = Number(totalStr);
    if (!(t > 0)) return;
    setRecipients((rs) => {
      const n = Math.max(rs.length, 1);
      const each = token.stable
        ? (t / n).toFixed(2)
        : Number((t / n).toFixed(6)).toString();
      return rs.map((r) => ({ ...r, amount: each }));
    });
  }
  // Compute each recipient's share-proportional amount (share mode only).
  function computedShareAmounts(): string[] {
    const total = Number(shareTotal);
    if (!total) return recipients.map(() => "");
    const totalShares = recipients.reduce((s, _, i) => s + (shares[i] ?? 1), 0);
    return recipients.map((_, i) => {
      const myShares = shares[i] ?? 1;
      const amt = (total * myShares) / totalShares;
      return token.stable ? amt.toFixed(2) : Number(amt.toFixed(6)).toString();
    });
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
      const effectiveRecipients =
        splitMode === "share" && isSplit
          ? computedShareAmounts().map((amt, i) => ({
              address: recipients[i].address,
              amount: amt,
            }))
          : recipients;
      const res = await ua.pay(effectiveRecipients, token);
      setResult(res);
      activity.add({
        id: res.txHash || `pay-${Date.now()}`,
        kind: res.recipients > 1 ? "split" : "sent",
        amount: res.total,
        recipients: res.recipients,
        token: res.symbol,
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

      {ua.eoa && ua.balanceUsd === 0 && (
        <FundCard
          ready={deposit.isReady}
          onAddFunds={deposit.open}
          onReceive={() => setSheet("receive")}
        />
      )}

      <QuickActions
        ownerReady={!!ua.eoa}
        depositReady={deposit.isReady}
        onAddFunds={deposit.open}
        onReceive={() => setSheet("receive")}
        onScan={() => setSheet("scan")}
        onContacts={() => setSheet("contacts")}
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
        token={token}
        onToken={setToken}
        busy={ua.busy}
        error={ua.error}
        balanceUsd={ua.balanceUsd}
        depositReady={deposit.isReady}
        onAddFunds={deposit.open}
        contacts={contacts}
        onUpdate={update}
        onAdd={addRecipient}
        onRemove={removeRecipient}
        onSplitEvenly={splitEvenly}
        onPay={handlePay}
        splitMode={splitMode}
        onSplitMode={setSplitMode}
        shares={shares}
        onShares={setShares}
        shareTotal={shareTotal}
        onShareTotal={setShareTotal}
        shareAmounts={computedShareAmounts()}
      />

      {result && <SuccessCard result={result} onDismiss={() => setResult(null)} />}

      <RequestsCard requests={requests} ownerAddress={ua.eoa} />

      <GroupsCard ua={ua} />

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
      <DepositModal
        isOpen={deposit.modalOpen}
        onClose={deposit.close}
        theme="dark"
      />
    </div>
  );
}

function QuickActions({
  ownerReady,
  depositReady,
  onAddFunds,
  onReceive,
  onScan,
  onContacts,
}: {
  ownerReady: boolean;
  depositReady: boolean;
  onAddFunds: () => void;
  onReceive: () => void;
  onScan: () => void;
  onContacts: () => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <ActionButton
        icon="+"
        label={depositReady ? "Add funds" : "…"}
        onClick={onAddFunds}
        disabled={!depositReady}
      />
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

// Single controller for cross-chain funding: owns the deposit modal's open
// state and listens for completed deposits to refresh balance + log activity.
// Lifted out of the quick-action button so the empty-balance prompt and the
// insufficient-balance nudge can all open the same modal.
function useDepositController(
  ownerAddress: string | null,
  onCredited: () => void,
  onRecord: (entry: Omit<ActivityEntry, "timestamp">) => void
) {
  const { isReady, recentActivity } = useDeposit({
    ownerAddress: ownerAddress ?? undefined,
  });
  const [modalOpen, setModalOpen] = useState(false);

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

  return {
    isReady,
    modalOpen,
    open: () => setModalOpen(true),
    close: () => setModalOpen(false),
  };
}

// Empty-balance funding prompt — shown when a freshly-created account holds $0,
// turning a bare "$0.00" into a clear next step for the user.
function FundCard({
  ready,
  onAddFunds,
  onReceive,
}: {
  ready: boolean;
  onAddFunds: () => void;
  onReceive: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-indigo-500/30 bg-indigo-500/[0.07] p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-600/25 text-xl">
          👋
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-medium text-white">
            Fund your account to get started
          </h2>
          <p className="mt-0.5 text-sm text-zinc-400">
            Move crypto in from any chain or token — ETH, USDC, USDT and more.
            It all lands as one spendable balance on Arbitrum.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onAddFunds}
          disabled={!ready}
          className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {ready ? "Add funds" : "Preparing…"}
        </button>
        <button
          onClick={onReceive}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.06]"
        >
          Show address
        </button>
      </div>
    </section>
  );
}

function SendCard({
  recipients,
  isSplit,
  total,
  token,
  onToken,
  busy,
  error,
  balanceUsd,
  depositReady,
  onAddFunds,
  contacts,
  onUpdate,
  onAdd,
  onRemove,
  onSplitEvenly,
  onPay,
  splitMode,
  onSplitMode,
  shares,
  onShares,
  shareTotal,
  onShareTotal,
  shareAmounts,
}: {
  recipients: Recipient[];
  isSplit: boolean;
  total: string;
  token: SettlementToken;
  onToken: (t: SettlementToken) => void;
  busy: boolean;
  error: string | null;
  balanceUsd: number | null;
  depositReady: boolean;
  onAddFunds: () => void;
  contacts: ReturnType<typeof useContacts>;
  onUpdate: (i: number, patch: Partial<Recipient>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onSplitEvenly: (total: string) => void;
  onPay: () => void;
  splitMode: "amount" | "share";
  onSplitMode: (m: "amount" | "share") => void;
  shares: Record<number, number>;
  onShares: (s: Record<number, number>) => void;
  shareTotal: string;
  onShareTotal: (v: string) => void;
  shareAmounts: string[];
}) {
  const [splitTotal, setSplitTotal] = useState("");
  const isShareMode = isSplit && splitMode === "share";

  // Total line for share mode: sum of computed amounts
  const shareSum = shareAmounts.reduce((s, a) => s + (Number(a) || 0), 0);
  const shareSumStr = token.stable ? shareSum.toFixed(2) : Number(shareSum.toFixed(6)).toString();

  // Insufficient-balance nudge. We only compare for stable settlement tokens,
  // where one token ≈ one dollar, so the amount is directly comparable to the
  // USD balance without needing a live price for the volatile tokens.
  const effectiveTotal = isShareMode ? shareSum : Number(total) || 0;
  const insufficient =
    token.stable &&
    balanceUsd !== null &&
    effectiveTotal > 0 &&
    effectiveTotal > balanceUsd;

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-white">
          {isSplit ? "Split a bill" : "Send money"}
        </h2>
        <TokenPicker token={token} onToken={onToken} />
      </div>

      {/* Share-mode total input */}
      {isShareMode && (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5">
          <span className="text-xs text-indigo-300">Total bill</span>
          <div className="flex flex-1 items-center justify-end gap-1">
            <span className="text-xs text-zinc-500">{token.icon}</span>
            <input
              value={shareTotal}
              onChange={(e) => onShareTotal(e.target.value)}
              inputMode="decimal"
              placeholder={token.stable ? "0.00" : "0.0"}
              className="w-24 bg-transparent text-right text-sm font-semibold text-white outline-none"
            />
          </div>
        </div>
      )}

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
              {isShareMode ? (
                /* Share count input — computed amount shown as hint */
                <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2">
                  <span className="text-xs text-zinc-500">×</span>
                  <input
                    type="number"
                    min="1"
                    value={shares[i] ?? 1}
                    onChange={(e) =>
                      onShares({ ...shares, [i]: Number(e.target.value) || 1 })
                    }
                    className="w-10 bg-transparent py-2.5 text-center text-sm text-white outline-none"
                  />
                  <span className="text-xs text-zinc-500">
                    {shareAmounts[i] ? `= ${shareAmounts[i]}` : "share"}
                  </span>
                </div>
              ) : (
                <div className="flex items-center rounded-xl border border-white/10 bg-white/5 px-2">
                  <span className="text-xs text-zinc-500">{token.icon}</span>
                  <input
                    value={r.amount}
                    onChange={(e) => onUpdate(i, { amount: e.target.value })}
                    inputMode="decimal"
                    placeholder={token.stable ? "0.00" : "0.0"}
                    className="w-16 bg-transparent px-1 py-2.5 text-right text-sm text-white outline-none"
                  />
                </div>
              )}
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={onAdd}
          className="text-sm font-medium text-indigo-400 hover:text-indigo-300"
        >
          + Add person to split
        </button>

        {isSplit && (
          <div className="flex items-center gap-1.5">
            {/* Split-mode toggle */}
            <div className="flex items-center gap-0.5 rounded-full border border-white/10 p-0.5 text-[11px]">
              <button
                onClick={() => onSplitMode("amount")}
                className={`rounded-full px-2.5 py-1 font-medium transition ${
                  splitMode === "amount"
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                By amount
              </button>
              <button
                onClick={() => onSplitMode("share")}
                className={`rounded-full px-2.5 py-1 font-medium transition ${
                  splitMode === "share"
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                By share
              </button>
            </div>

            {splitMode === "amount" && (
              <>
                <div className="flex items-center rounded-lg border border-white/10 bg-white/5 px-2">
                  <span className="text-xs text-zinc-500">{token.icon}</span>
                  <input
                    value={splitTotal}
                    onChange={(e) => setSplitTotal(e.target.value)}
                    inputMode="decimal"
                    placeholder="total"
                    className="w-16 bg-transparent px-1 py-1.5 text-right text-xs text-white outline-none"
                  />
                </div>
                <button
                  onClick={() => onSplitEvenly(splitTotal)}
                  className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                >
                  Split evenly
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-3 text-sm">
        <span className="text-zinc-400">
          Total {isSplit ? `· ${recipients.length} people` : ""}
        </span>
        <span className="font-semibold text-white">
          {isShareMode ? shareSumStr : total} {token.symbol}
        </span>
      </div>

      {insufficient && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs">
          <span className="text-amber-200">
            Short by {(effectiveTotal - (balanceUsd ?? 0)).toFixed(2)}{" "}
            {token.symbol} — balance is ${(balanceUsd ?? 0).toFixed(2)}.
          </span>
          <button
            onClick={onAddFunds}
            disabled={!depositReady}
            className="shrink-0 rounded-lg bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-100 transition hover:bg-amber-500/30 disabled:opacity-50"
          >
            Add funds
          </button>
        </div>
      )}

      <button
        onClick={onPay}
        disabled={busy || insufficient}
        className="rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy
          ? "Sending…"
          : insufficient
            ? "Insufficient balance"
            : `${isSplit ? "Split" : "Send"} ${isShareMode ? shareSumStr : total} ${token.symbol}`}
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
      {ua.assets.length > 0 && (
        <div className="relative mt-4 flex flex-wrap gap-1.5">
          {ua.assets.map((a) => (
            <span
              key={a.type}
              title={`${a.amount} ${a.symbol} · $${a.amountInUSD.toFixed(2)}`}
              className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs"
            >
              <span className="text-indigo-100">{a.icon}</span>
              <span className="font-medium">{a.symbol}</span>
              <span className="text-indigo-200/90">
                ${a.amountInUSD.toFixed(2)}
              </span>
            </span>
          ))}
        </div>
      )}

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
        <h3 className="font-medium text-emerald-300">
          ✓ {result.total} {result.symbol} sent
        </h3>
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportActivityCsv(entries)}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Export CSV
          </button>
          <button
            onClick={onClear}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Clear
          </button>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-white/5">
        {entries.map((e) => (
          <ActivityRow key={e.id} entry={e} />
        ))}
      </ul>
    </section>
  );
}

// Download the activity feed as a CSV the user can keep for their records.
function exportActivityCsv(entries: ActivityEntry[]) {
  const header = ["date", "type", "amount", "token", "recipients", "txHash"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = entries.map((e) =>
    [
      new Date(e.timestamp).toISOString(),
      e.kind,
      e.amount,
      e.token ?? "",
      e.recipients ?? "",
      e.txHash ?? "",
    ]
      .map(esc)
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `universal-pay-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
