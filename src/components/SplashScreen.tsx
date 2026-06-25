"use client";

import { useEffect, useState } from "react";

// Branded intro overlay shown once per browser session. It fades itself out via
// CSS (.splash-root) and we unmount shortly after so it never blocks taps.
export function SplashScreen() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("up:splash-seen")) return;
      sessionStorage.setItem("up:splash-seen", "1");
    } catch {
      /* private mode — still show it once this mount */
    }
    setShow(true);
    const t = setTimeout(() => setShow(false), 2500);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div
      className="splash-root fixed inset-0 z-50 grid place-items-center"
      style={{
        background:
          "radial-gradient(50rem 40rem at 50% 30%, rgba(99,102,241,0.25), transparent 60%), #07070b",
      }}
      aria-hidden
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative grid h-24 w-24 place-items-center">
          <span className="splash-ring absolute inset-0 rounded-3xl border border-indigo-400/40" />
          <span className="splash-logo grid h-24 w-24 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-4xl font-bold text-white shadow-2xl shadow-indigo-900/50">
            U
          </span>
        </div>
        <div className="rise-in text-center" style={{ animationDelay: "0.4s" }}>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Universal Pay
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Any chain · any token · one balance
          </p>
        </div>
      </div>
    </div>
  );
}
