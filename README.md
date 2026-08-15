# xoom / ledger

A minimal, mobile-first invoice workspace for sending Xoom Bangladesh bank-deposit details to clients.

## Run locally

```bash
npm install
npm run dev
```

The local fallback admin passcode is `xoom-admin`. Set `VITE_ADMIN_PASSWORD` when running or deploying if you want a different passcode.

## Deploy to Vercel

Import the repository into Vercel with the default Vite settings. Add `VITE_ADMIN_PASSWORD` as an environment variable before deploying. `vercel.json` keeps public `/invoice/<token>` links on the SPA entry point.

## Storage model

This version is intentionally setup-free: admin records and the session are stored in browser local storage. Public invoice links contain a URL-safe, snapshotted payload so a client can open the link on another device without a database or login. For multi-device persistence or multiple admin users, replace the small storage helpers in `src/main.jsx` with a database-backed API and server-side session auth.
