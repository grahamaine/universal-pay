"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Chrome's install event — not yet in the DOM lib types.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Whether the app is already running installed (standalone display mode).
// Server snapshot says "yes" so the button stays hidden until the client knows.
function useStandalone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(display-mode: standalone)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true,
    () => true
  );
}

// iOS never fires beforeinstallprompt; detect it to offer the manual how-to.
function useIsIos(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => /iphone|ipad|ipod/i.test(navigator.userAgent),
    () => false
  );
}

// "Add to home screen" button. Chromium fires `beforeinstallprompt` once the
// manifest makes the app installable — we stash the event and replay it on
// click. iOS Safari has no install API at all, so there the button opens a
// short how-to (Share → Add to Home Screen). Hidden entirely when the app is
// already running installed.
export function InstallApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const standalone = useStandalone();
  const isIos = useIsIos();

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || installed || (!deferred && !isIos)) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } else {
      setIosHint((v) => !v);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-xl border border-zinc-900/10 bg-white/60 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-900/20 hover:bg-white"
      >
        <span aria-hidden>⤓</span> Install app
      </button>
      {iosHint && (
        <div className="absolute right-0 top-full z-20 mt-2 w-60 rounded-2xl border border-zinc-900/10 bg-white p-3.5 text-xs text-zinc-700 shadow-xl shadow-zinc-900/15">
          <p className="mb-1 font-medium text-zinc-900">Add to Home Screen</p>
          <p>
            Tap the <span className="text-indigo-600">Share</span> button in
            Safari, then choose{" "}
            <span className="text-indigo-600">&ldquo;Add to Home Screen&rdquo;</span>.
          </p>
          <button
            onClick={() => setIosHint(false)}
            className="mt-2 text-[11px] text-zinc-500 underline"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
