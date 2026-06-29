// Demo merchant catalogue for the "Bills & Shopping" cart. SSR-safe — no
// `@particle-network/*` imports, just plain data. These model real-world
// subscriptions and shops (Netflix, Spotify, Amazon…) so the demo can show the
// universal balance paying everyday bills in one tap. They are NOT live
// integrations: checkout settles USDC on Arbitrum to a demo payee (see
// CartCard), proving the chain-abstraction without faking a Netflix API.
export type MerchantCategory =
  | "Streaming"
  | "Music"
  | "Shopping"
  | "Gaming"
  | "Social";

export type Merchant = {
  key: string;
  name: string;
  category: MerchantCategory;
  /** Emoji glyph used as the tile icon. */
  icon: string;
  /** Price in USD (settled 1:1 in USDC). */
  price: number;
  /** Billing cadence label, e.g. "/mo", "one-time", "top-up". */
  unit: string;
};

export const MERCHANTS: Merchant[] = [
  { key: "netflix", name: "Netflix", category: "Streaming", icon: "🎬", price: 15.49, unit: "/mo" },
  { key: "spotify", name: "Spotify", category: "Music", icon: "🎧", price: 11.99, unit: "/mo" },
  { key: "amazon", name: "Amazon Prime", category: "Shopping", icon: "📦", price: 14.99, unit: "/mo" },
  { key: "youtube", name: "YouTube Premium", category: "Streaming", icon: "▶️", price: 13.99, unit: "/mo" },
  { key: "disney", name: "Disney+", category: "Streaming", icon: "🏰", price: 9.99, unit: "/mo" },
  { key: "applemusic", name: "Apple Music", category: "Music", icon: "🎵", price: 10.99, unit: "/mo" },
  { key: "xbox", name: "Xbox Game Pass", category: "Gaming", icon: "🎮", price: 16.99, unit: "/mo" },
  { key: "steam", name: "Steam Wallet", category: "Gaming", icon: "🕹️", price: 20.0, unit: "top-up" },
  { key: "xpremium", name: "X Premium", category: "Social", icon: "✦", price: 8.0, unit: "/mo" },
  { key: "amazoncart", name: "Amazon Order", category: "Shopping", icon: "🛒", price: 49.99, unit: "one-time" },
];

export function merchantByKey(key: string): Merchant | undefined {
  return MERCHANTS.find((m) => m.key === key);
}
