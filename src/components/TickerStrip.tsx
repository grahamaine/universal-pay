import { TOKEN_META } from "@/lib/tokens";

const ITEMS = [
  { icon: "⛓️", label: "Arbitrum" },
  { icon: "⛓️", label: "Ethereum" },
  { icon: "⛓️", label: "Base" },
  { icon: "⛓️", label: "Polygon" },
  { icon: "⛓️", label: "BNB Chain" },
  ...Object.values(TOKEN_META).map((t) => ({ icon: t.icon, label: t.symbol })),
];

// Infinite horizontal marquee of chains/tokens the Universal Account sources
// from. Doubled list + -50% translate keeps the loop seamless; hover pauses it.
export function TickerStrip() {
  return (
    <div className="ticker-row rise-in overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] py-3">
      <div className="ticker-track flex w-max gap-8 whitespace-nowrap px-4">
        {[...ITEMS, ...ITEMS].map((item, i) => (
          <span
            key={`${item.label}-${i}`}
            className="inline-flex items-center gap-2 text-sm text-zinc-400"
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
