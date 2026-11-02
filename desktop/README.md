# DavaDesk desktop app

Installs as one package and opens straight into the app, with nothing to set up. Billing, purchases, CSV import, stock, customers, suppliers, returns and reports run on the computer with no internet.

## How it's built

- `main/`: the Electron shell, and the optional counters window.
- `server/`: the local server. It runs the backend's own routes and services from `backend-node`, copied at build time into `backend/`.
- `server/docdb/`: a MongoDB-compatible store over encrypted SQLite. `mongoose.connection.db` resolves to it, so route code doesn't change.
- `server/hooks.js` and `server/stubs/`: local replacements for cloud dependencies (Redis, R2, S3, email, AI).
- Each write request runs in one SQLite transaction, so a bill saves whole or not at all.
- `frontend/src/lib/desktop.js`: `IS_DESKTOP` hides online-only buttons in this build only.

Nothing outside this folder runs differently on the web, except for the `IS_DESKTOP` checks, which are false there.

## Commands

```bash
npm install
npm test
npm run prepare:all
npx electron .
npm run dist:mac
npm run dist:win
```

`dist:mac` makes Intel and Apple Silicon packages, and `dist:win` makes the Windows installer. Output goes to `dist/`.

## Data

The data folder is the app's user data folder: `~/Library/Application Support/DavaDesk` on Mac, `%APPDATA%\DavaDesk` on Windows.

- `shop/davadesk.db`: the encrypted database.
- `shop/backups/`: a daily copy, refreshed hourly while data changes, 7 days kept.
- `db.key`: the database key. Keep it with any backup you move. Windows seals it with DPAPI. On a Mac it's a file only this user can read, because the Keychain would prompt for a password on first launch.
- `server.log`: the local server's log.

## Counters (optional)

Menu: Counters and Network, or Settings, Preferences.

One computer becomes the main computer. Others find it on the network, or use its address, and join with a 6-digit code that works once for 10 minutes. Traffic is TLS, pinned to the main computer's certificate. A counter uses the main computer's data, and goes back to its own if disconnected.

## Not in this version

- Sync with the cloud, browser sign-in and subscription checks. Every install currently runs a full local shop with no expiry.
- The medicine catalogue. Each product is added by hand, with its manufacturer and salt.
- AI, scanning, email, WhatsApp links, support tickets.
- Bill number changes and auto-update.
- Signing: Mac packages are ad-hoc signed and not notarised; Windows is unsigned.
