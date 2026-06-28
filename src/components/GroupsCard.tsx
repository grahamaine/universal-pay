"use client";

import { useState } from "react";
import {
  useGroups,
  computeBalances,
  computeSettleUp,
  type Group,
  type GroupMember,
  type GroupExpense,
} from "@/hooks/useGroups";
import {
  DEFAULT_SETTLEMENT_TOKEN,
  settlementTokenByKey,
  SETTLEMENT_TOKENS,
  type SettlementToken,
} from "@/lib/tokens";
import { TokenPicker } from "@/components/TokenPicker";
import type { useUniversalPay } from "@/hooks/useUniversalPay";

type UA = ReturnType<typeof useUniversalPay>;

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function label(addr: string, members: GroupMember[]) {
  const m = members.find((m) => m.address.toLowerCase() === addr.toLowerCase());
  return m?.name ?? short(addr);
}

// ─── Top-level card ──────────────────────────────────────────────────────────

export function GroupsCard({
  ua,
}: {
  ua: UA;
}) {
  const groups = useGroups(ua.eoa);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-white">Groups &amp; Settle-up</h2>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          {creating ? "Cancel" : "+ New group"}
        </button>
      </div>

      {creating && (
        <CreateGroupForm
          ownerAddress={ua.eoa}
          onCreate={(name, members) => {
            const g = groups.createGroup(name, members);
            setCreating(false);
            setExpanded(g.id);
          }}
        />
      )}

      {groups.groups.length === 0 && !creating && (
        <p className="text-sm text-zinc-500">
          Create a group to track shared expenses and settle up with one tap.
        </p>
      )}

      {groups.groups.map((g) => (
        <GroupRow
          key={g.id}
          group={g}
          ua={ua}
          expanded={expanded === g.id}
          onToggle={() => setExpanded(expanded === g.id ? null : g.id)}
          onAddExpense={(exp) => groups.addExpense(g.id, exp)}
          onRemoveExpense={(eid) => groups.removeExpense(g.id, eid)}
          onRemoveGroup={() => groups.removeGroup(g.id)}
        />
      ))}
    </section>
  );
}

// ─── Create group form ───────────────────────────────────────────────────────

function CreateGroupForm({
  ownerAddress,
  onCreate,
}: {
  ownerAddress: string | null;
  onCreate: (name: string, members: GroupMember[]) => void;
}) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<GroupMember[]>([
    { address: ownerAddress ?? "", name: "Me" },
    { address: "", name: "" },
  ]);

  function updateRow(i: number, patch: Partial<GroupMember>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function submit() {
    const valid = rows.filter((r) => r.address.trim());
    if (!name.trim() || valid.length < 2) return;
    onCreate(name.trim(), valid.map((r) => ({ address: r.address.trim(), name: r.name?.trim() || undefined })));
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name (e.g. Trip to NYC)"
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
      />
      <p className="text-xs text-zinc-500">Members (at least 2)</p>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={r.address}
            onChange={(e) => updateRow(i, { address: e.target.value })}
            placeholder="0x address"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white outline-none focus:border-indigo-500"
          />
          <input
            value={r.name ?? ""}
            onChange={(e) => updateRow(i, { name: e.target.value })}
            placeholder="Name"
            className="w-24 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-xs text-white outline-none focus:border-indigo-500"
          />
          {i >= 2 && (
            <button
              onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              className="text-zinc-500 hover:text-red-400"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() => setRows((prev) => [...prev, { address: "", name: "" }])}
        className="self-start text-xs text-indigo-400 hover:text-indigo-300"
      >
        + Add member
      </button>
      <button
        onClick={submit}
        disabled={!name.trim() || rows.filter((r) => r.address.trim()).length < 2}
        className="rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
      >
        Create group
      </button>
    </div>
  );
}

// ─── Group row (collapsible) ─────────────────────────────────────────────────

function GroupRow({
  group,
  ua,
  expanded,
  onToggle,
  onAddExpense,
  onRemoveExpense,
  onRemoveGroup,
}: {
  group: Group;
  ua: UA;
  expanded: boolean;
  onToggle: () => void;
  onAddExpense: (exp: Omit<GroupExpense, "id" | "createdAt">) => void;
  onRemoveExpense: (id: string) => void;
  onRemoveGroup: () => void;
}) {
  const balances = computeBalances(group);
  const primaryToken = group.expenses[0]?.tokenKey ?? "usdc";
  const settleUp = computeSettleUp(balances, primaryToken);
  const allSettled = settleUp.length === 0 && group.expenses.length > 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <span className="font-medium text-white">{group.name}</span>
          <span className="ml-2 text-xs text-zinc-500">
            {group.members.length} members · {group.expenses.length} expense
            {group.expenses.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {allSettled && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
              settled
            </span>
          )}
          {settleUp.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
              {settleUp.length} to settle
            </span>
          )}
          <span className="text-xs text-zinc-500">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-white/10 px-4 pb-4 pt-3">
          {/* Expenses */}
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Expenses
            </p>
            {group.expenses.length === 0 ? (
              <p className="text-xs text-zinc-500">No expenses yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {group.expenses.map((exp) => (
                  <li
                    key={exp.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0">
                      <span className="text-white">{exp.description}</span>
                      <span className="ml-1.5 text-zinc-500">
                        {exp.amount} {exp.tokenSymbol} paid by{" "}
                        {label(exp.paidBy, group.members)}
                      </span>
                    </div>
                    <button
                      onClick={() => onRemoveExpense(exp.id)}
                      className="ml-2 shrink-0 text-zinc-600 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add expense */}
          <AddExpenseForm group={group} onAdd={onAddExpense} />

          {/* Balances */}
          {group.expenses.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Balances
              </p>
              <ul className="flex flex-col gap-1">
                {balances.map((b) => (
                  <li key={b.address} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">
                      {b.name ?? short(b.address)}
                    </span>
                    <span
                      className={
                        b.net > 0.005
                          ? "text-emerald-400"
                          : b.net < -0.005
                          ? "text-red-400"
                          : "text-zinc-500"
                      }
                    >
                      {b.net > 0.005
                        ? `+${b.net.toFixed(2)}`
                        : b.net < -0.005
                        ? b.net.toFixed(2)
                        : "settled"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Settle-up */}
          {settleUp.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Settle up
              </p>
              <ul className="flex flex-col gap-2">
                {settleUp.map((tx, i) => (
                  <SettleRow
                    key={i}
                    tx={tx}
                    members={group.members}
                    ua={ua}
                  />
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={onRemoveGroup}
            className="self-start text-xs text-zinc-600 hover:text-red-400"
          >
            Delete group
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Add expense form ────────────────────────────────────────────────────────

function AddExpenseForm({
  group,
  onAdd,
}: {
  group: Group;
  onAdd: (exp: Omit<GroupExpense, "id" | "createdAt">) => void;
}) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<SettlementToken>(DEFAULT_SETTLEMENT_TOKEN);
  const [paidBy, setPaidBy] = useState(group.members[0]?.address ?? "");
  const [splitAmong, setSplitAmong] = useState<string[]>(
    group.members.map((m) => m.address)
  );
  const [splitMode, setSplitMode] = useState<"equal" | "share">("equal");
  const [shares, setShares] = useState<Record<string, number>>({});

  function toggleMember(addr: string) {
    setSplitAmong((prev) =>
      prev.includes(addr) ? prev.filter((a) => a !== addr) : [...prev, addr]
    );
  }

  function submit() {
    if (!desc.trim() || !Number(amount) || splitAmong.length === 0) return;
    onAdd({
      description: desc.trim(),
      amount: Number(amount),
      tokenKey: token.key,
      tokenSymbol: token.symbol,
      paidBy,
      splitAmong,
      splitMode,
      shares: splitMode === "share" ? shares : undefined,
    });
    setDesc("");
    setAmount("");
    setOpen(false);
  }

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
        >
          + Add expense
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What was it for?"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
          />
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center rounded-lg border border-white/10 bg-white/5 px-2">
              <span className="text-xs text-zinc-500">{token.icon}</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder={token.stable ? "0.00" : "0.0"}
                className="w-full bg-transparent px-2 py-2 text-sm text-white outline-none"
              />
            </div>
            <TokenPicker token={token} onToken={setToken} />
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs text-zinc-500">Paid by</p>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-xs text-white outline-none"
            >
              {group.members.map((m) => (
                <option key={m.address} value={m.address}>
                  {m.name ?? short(m.address)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">Split among</p>
              <div className="flex items-center gap-1 rounded-full border border-white/10 p-0.5 text-[10px]">
                <button
                  onClick={() => setSplitMode("equal")}
                  className={`rounded-full px-2 py-0.5 font-medium transition ${
                    splitMode === "equal"
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Equal
                </button>
                <button
                  onClick={() => setSplitMode("share")}
                  className={`rounded-full px-2 py-0.5 font-medium transition ${
                    splitMode === "share"
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  By share
                </button>
              </div>
            </div>
            {group.members.map((m) => (
              <div key={m.address} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={splitAmong.includes(m.address)}
                  onChange={() => toggleMember(m.address)}
                  className="accent-indigo-500"
                />
                <span className="flex-1 text-xs text-zinc-300">
                  {m.name ?? short(m.address)}
                </span>
                {splitMode === "share" && splitAmong.includes(m.address) && (
                  <div className="flex items-center gap-1 text-xs text-zinc-400">
                    <span>×</span>
                    <input
                      type="number"
                      min="1"
                      value={shares[m.address] ?? 1}
                      onChange={(e) =>
                        setShares((prev) => ({
                          ...prev,
                          [m.address]: Number(e.target.value) || 1,
                        }))
                      }
                      className="w-10 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-center text-white outline-none"
                    />
                    <span>share{(shares[m.address] ?? 1) !== 1 ? "s" : ""}</span>
                  </div>
                )}
                {splitMode === "equal" && splitAmong.includes(m.address) && Number(amount) > 0 && (
                  <span className="text-xs text-zinc-500">
                    {(Number(amount) / splitAmong.length).toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!desc.trim() || !Number(amount) || splitAmong.length === 0}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              Add expense
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-400 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settle-up row with Pay button ───────────────────────────────────────────

function SettleRow({
  tx,
  members,
  ua,
}: {
  tx: { from: string; to: string; amount: number; tokenKey: string };
  members: GroupMember[];
  ua: UA;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const token = settlementTokenByKey(tx.tokenKey);
  const isMe =
    ua.eoa?.toLowerCase() === tx.from.toLowerCase();

  async function settle() {
    setState("busy");
    setErrMsg("");
    try {
      await ua.pay(
        [{ address: tx.to, amount: tx.amount.toFixed(token.stable ? 2 : 6) }],
        token
      );
      setState("done");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <span className="text-zinc-300">
        <span className={isMe ? "font-semibold text-white" : ""}>
          {label(tx.from, members)}
        </span>{" "}
        <span className="text-zinc-500">→</span>{" "}
        {label(tx.to, members)}{" "}
        <span className="font-medium text-amber-300">
          {tx.amount.toFixed(2)} {token.symbol}
        </span>
      </span>
      {state === "done" ? (
        <span className="text-emerald-400">✓ Sent</span>
      ) : state === "error" ? (
        <span className="text-red-400" title={errMsg}>
          Failed
        </span>
      ) : (
        <button
          onClick={settle}
          disabled={state === "busy" || !isMe}
          title={isMe ? "Pay now via Universal Account" : "Not your payment"}
          className="rounded-lg bg-indigo-600/80 px-2.5 py-1 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
        >
          {state === "busy" ? "Sending…" : "Pay"}
        </button>
      )}
    </li>
  );
}
