"use client";

import { useEffect, useRef, useState } from "react";
import { FEATURES } from "@/lib/features";

// Landing-page sidebar that showcases everything the app does. On large screens
// it sits beside the sign-in card; on mobile it stacks beneath it.
export function FeatureSidebar() {
  return (
    <aside className="rise-in flex flex-col gap-5 rounded-3xl border border-zinc-900/10 bg-white/70 p-6 backdrop-blur lg:sticky lg:top-8">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-indigo-600/80">
          Chain-abstracted payments · Particle × Magic
        </p>
        <h2 className="mt-3 font-display text-[2rem] font-semibold leading-tight tracking-tight text-zinc-900">
          One balance, every chain.{" "}
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text italic text-transparent">
            Pay in one tap.
          </span>
        </h2>
        <p className="mt-3 text-sm text-zinc-600">
          Sign in with an email and pay, split, request, or top up — without ever
          touching a seed phrase or thinking about networks.
        </p>
      </div>

      <ul className="flex flex-col gap-1">
        {FEATURES.map((f, i) => (
          <li
            key={f.title}
            className="feature-row rise-in flex items-start gap-3 rounded-2xl px-3 py-2.5"
            style={{ animationDelay: `${0.05 * i}s` }}
          >
            <span className="feature-icon grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-600/15 text-lg">
              {f.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900">{f.title}</p>
              <p className="text-xs leading-relaxed text-zinc-500">{f.desc}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-4 border-t border-zinc-900/10 pt-4 text-center">
        <Stat value="3" label="tokens" />
        <Stat value="0" label="seed phrases" />
        <Stat value="1" label="balance" />
      </div>
    </aside>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const count = useCountUp(value);
  return (
    <div className="flex-1">
      <p className="text-xl font-semibold text-zinc-900">{count}</p>
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  );
}

// Counts a numeric stat up from 0 once, on mount — a small "the app is alive"
// flourish for otherwise-static numbers. Non-numeric values pass through as-is.
function useCountUp(target: string, durationMs = 900) {
  const isNumeric = /^\d+$/.test(target);
  const [display, setDisplay] = useState(isNumeric ? "0" : target);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (!isNumeric) return;
    const targetNum = Number(target);
    if (targetNum === 0) {
      setDisplay("0");
      return;
    }
    let frame: number;
    const step = (t: number) => {
      if (start.current === null) start.current = t;
      const progress = Math.min((t - start.current) / durationMs, 1);
      setDisplay(String(Math.round(progress * targetNum)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}
