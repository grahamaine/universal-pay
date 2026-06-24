// Shareable "request money" links. A request encodes who to pay, how much, and
// an optional note as query params on the app's own URL, so opening the link
// pre-fills the send form. Pure string helpers — safe in the SSR graph.

export type PayRequest = {
  to: string;
  amount?: string;
  note?: string;
};

/** Build a "?to=…&amount=…&note=…" link, given an origin (e.g. location.origin). */
export function buildPayLink(origin: string, req: PayRequest): string {
  const params = new URLSearchParams();
  params.set("to", req.to.trim());
  if (req.amount && Number(req.amount) > 0) params.set("amount", req.amount.trim());
  if (req.note?.trim()) params.set("note", req.note.trim());
  return `${origin.replace(/\/$/, "")}/?${params.toString()}`;
}

/** Parse an incoming request from URLSearchParams, or null if there's no `to`. */
export function parsePayRequest(search: URLSearchParams): PayRequest | null {
  const to = search.get("to");
  if (!to) return null;
  return {
    to,
    amount: search.get("amount") ?? undefined,
    note: search.get("note") ?? undefined,
  };
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function isAddress(value: string): boolean {
  return ADDRESS_RE.test(value.trim());
}

/**
 * Pull an address out of scanned QR text. Accepts a raw 0x address, an
 * EIP-681 "ethereum:0x…" URI, or one of our own pay links (returns full request).
 */
export function parseScanned(text: string): PayRequest | null {
  const raw = text.trim();

  // Our own pay link?
  try {
    const url = new URL(raw);
    const req = parsePayRequest(url.searchParams);
    if (req && isAddress(req.to)) return req;
  } catch {
    /* not a URL — fall through */
  }

  // EIP-681 ethereum: URI, possibly "ethereum:0x…@chain" with a value param.
  if (raw.toLowerCase().startsWith("ethereum:")) {
    const body = raw.slice("ethereum:".length);
    const addr = body.split(/[@?]/)[0];
    if (isAddress(addr)) return { to: addr };
  }

  // Bare address.
  if (isAddress(raw)) return { to: raw };

  return null;
}
