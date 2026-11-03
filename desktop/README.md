# DavaDesk desktop app

Installs as one package. After one browser sign-in with an active subscription, billing, purchases, CSV import, stock, customers, suppliers, returns and reports run on the computer with no internet, and stay in sync with the web app. Online, every cloud feature works too.

## How it's built

- `main/`: the Electron shell, and the optional counters window.
- `server/`: the local server. It runs the backend's own routes and services from `backend-node`, copied at build time into `backend/`.
- `server/docdb/`: a MongoDB-compatible store over encrypted SQLite. `mongoose.connection.db` resolves to it, so route code doesn't change.
- `server/hooks.js` and `server/stubs/`: local replacements for cloud dependencies (Redis, R2, S3, email, AI).
- Each write request runs in one SQLite transaction, so a bill saves whole or not at all.
- `main/gate.html`: the sign-in screen. `frontend/src/pages/SyncCenterPage.jsx`: the Sync Center.
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

## Account, licence and sync

- **First setup:** after sign-in the app copies the shop's data, then waits for the full catalogue. The user may carry on sooner; search then uses the cloud until the download finishes.
- **Sign-in:** the app opens the normal browser on the website. The signed-in user allows the computer, and only an active subscription can. The app proves it started the request (PKCE), and the code works once for 2 minutes.
- **Licence:** signed by the cloud (Ed25519). The app holds only the public key. It runs offline until the licence's date: 30 days on a paid plan, 3 on a trial, never past the subscription's end.
- **Sync:** each write request becomes one change set in a local outbox. Changes go up first, and pulls apply only when nothing is waiting. Counts such as stock travel as differences. See `server/sync.js` and `backend-node/routes/desktop.js`.
- **Online features:** forwarded to the cloud with a normal API token, so the cloud's usual checks apply. No keys are in the app.
- **Catalogue:** an encrypted file, `shop/catalog.db`, searched with limits, with no listing or export route.

## What protects it, and the limit

Enforced by the server, whatever is done to the app: subscription checks, which collections and fields a device may change, pharmacy scoping, AI, payments and all keys.

Enforced on the computer: signed licence, encrypted files, Electron fuses (asar integrity, no plain Node, no inspect), refusal of debug switches, no developer tools.

Limit: someone who controls their own computer, and is willing to reverse-engineer the app, can eventually read what is stored there and patch local checks. That gets them offline use of data they already had, and any catalogue already downloaded. It gets them nothing from the cloud.

## Releases and updates

Pushing to `main` runs **Desktop App (dev)** in GitHub Actions: checks and tests, Mac and Windows builds, then upload to S3 (`desktop/dev/` in the private bucket), using the dev server's AWS access. Each build gets a new version.

- **Downloads:** `GET /api/desktop/releases/<file>` redirects to a short-lived S3 link. The channel follows the API's address (`api-dev` is dev), or `DESKTOP_RELEASE_CHANNEL`.
- **Updates:** the app reads `latest.json` when it starts and every hour. Windows downloads updates and installs them on close. A Mac needs Apple signing for that, so until `macSigned` is set in the channel's config it offers the download instead.
- **Forcing an update:** raise `min_version` in `config/release.json`. Older apps then ask for the update before more work, and their unsent work still syncs.
- **Offer on the website:** on for `store-dev` by hostname, in `frontend/src/lib/desktop.js`.

## When a feature changes

Features are built once, in `frontend` and `backend-node`. `npm run check` fails the build if a new MongoDB collection or backend library hasn't been classified, and says what to add. A route using a cloud service also needs adding to the forwarded list in `server/index.js`. Keep the backend able to serve older apps, because they update later than the server.

## Going live on production

1. Set `DESKTOP_LICENCE_PRIVATE_KEY` on the production API, then deploy the backend. Its public key is in `config/production.json`.
2. Add a workflow for `production` like the dev one, using `build-release.js production` and the production server.
3. Turn the offer on in `frontend/src/lib/desktop.js`, then deploy the web app.

## Tests

`npm test` runs the store, the offline routes, and sync against a private cloud in Docker (MongoDB and Redis, no `.env`).

## Not in this version

- Bill number changes.
- Signing: Mac packages are ad-hoc signed and not notarised, and Windows is unsigned. Signed Mac builds can also move the key files into the Keychain.
- The Windows package has the default icon until it is built on Windows.

## Trying it before going live

```bash
npm run dist:test
npm run test-cloud
```

`dist:test` makes Mac installers in `dist-test/` that connect to the test cloud. `test-cloud` runs a private copy of the cloud on this computer, with sample data and test accounts listed in `.test-cloud/accounts.txt`. Stopping it with Ctrl+C acts like losing the internet. It never reaches production.
