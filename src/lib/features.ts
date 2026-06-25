// Single source of truth for the product's feature list. Used by the landing
// sidebar (and anywhere else we showcase what the app does). Pure data — safe
// in the SSR graph.

export type Feature = {
  icon: string;
  title: string;
  desc: string;
};

export const FEATURES: Feature[] = [
  {
    icon: "✉️",
    title: "Email sign-in",
    desc: "No wallet, no seed phrase. Your email becomes a chain-abstracted account.",
  },
  {
    icon: "💸",
    title: "Pay & split",
    desc: "Send to one person or split a bill across many — in a single tap.",
  },
  {
    icon: "🪙",
    title: "Any token",
    desc: "Pay or get paid in USDC, USDT or ETH, sourced from any asset you hold.",
  },
  {
    icon: "🧾",
    title: "Requests & invoices",
    desc: "Create trackable payment requests with shareable links and QR codes.",
  },
  {
    icon: "🌉",
    title: "Cross-chain deposit",
    desc: "Top up from any chain; funds consolidate on Arbitrum automatically.",
  },
  {
    icon: "⛓️",
    title: "One balance",
    desc: "A Particle Universal Account (EIP-7702) turns every chain into one number.",
  },
  {
    icon: "⌗",
    title: "QR & scan",
    desc: "Show a QR to get paid, or scan a code to pay someone instantly.",
  },
  {
    icon: "⭐",
    title: "Contacts",
    desc: "Save payees once and send to them by name, not a 0x address.",
  },
];
