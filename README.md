# Universal Pay

**Pay or split with anyone — any chain, any token, one balance.**

A Venmo-style consumer payments app where the user never thinks about wallets, gas,
bridges, or chains. Sign in with an email, and send or split money that gets settled
on Arbitrum — funded from whatever assets you hold across any chain.

## How it qualifies (3 prizes, one app)

| Prize | How |
|---|---|
| **Particle — Universal Accounts Track** | `UniversalAccount` initialized in **EIP-7702 mode** (`smartAccountOptions.useEIP7702 = true`). The user's EOA is upgraded in-place — one balance, cross-chain transfers. |
| **Arbitrum — Road to Open House** | Every payment settles in USDC on **Arbitrum One** (`createTransferTransaction` → token on chainId 42161). |
| **Magic Labs — Bonus** | Onboarding is **Magic embedded wallet** email OTP login — no MetaMask, no seed phrase. |

## Architecture

```
Magic embedded wallet (email OTP → EOA + ethers signer)
        ↓ ownerAddress
Particle Universal Account (EIP-7702 mode — EOA upgraded in place)
        ↓ createTransferTransaction → sign rootHash → sendTransaction
Cross-chain USDC settled on Arbitrum One
```

Key files:
- `src/lib/magic.ts` — Magic client (email OTP)
- `src/hooks/useUniversalPay.ts` — session bootstrap, UA init (7702), balance, pay/split
- `src/app/page.tsx` — consumer UI

## Run locally

1. `cp .env.local.example .env.local` and fill in:
   - `NEXT_PUBLIC_MAGIC_KEY` — from https://dashboard.magic.link
   - `NEXT_PUBLIC_PARTICLE_PROJECT_ID` / `_CLIENT_KEY` / `_APP_ID` — from
     https://dashboard.particle.network
2. `npm install`
3. `npm run dev` → http://localhost:3000

## The cross-chain value moment

A single tap on **Send** / **Split** calls `createTransferTransaction` targeting USDC
on Arbitrum, signs the returned `rootHash` with the Magic signer, and submits via
`sendTransaction`. The Universal Account sources the funds from the user's aggregated
cross-chain balance — the user picks neither a chain nor a source token.
