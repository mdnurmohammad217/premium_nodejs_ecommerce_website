# License Server v2 Integration — Report (v3.5)

This version connects the eCommerce/POS app to your **existing** License Server. It follows
*"License Server v2 API Contract — eCommerce/POS Client"* exactly:

- No new endpoints were invented.
- No licensing server was created.
- No License Server code was copied in.
- **Only the public key** is used. The private signing key appears nowhere in the project (this was checked automatically).

---

## 1. Changed files

| File | Change |
|---|---|
| `src/server/license-core.ts` | **New.** Pure verification code with no database or network: <br>• Ed25519 token check (`QCT`, `kid`, signature before claims are read) <br>• `LSR1` response-envelope check (signature, nonce, action, jti) <br>• `normalizeDomain()` <br>• domain / installation / product binding <br>• the offline decision table (section 9) |
| `src/server/license.ts` | **New.** The service: <br>• database state <br>• activate / sync / deactivate / report calls <br>• backoff and the signed-schedule checker <br>• the reusable **license gate** middleware <br>• the `/api/license/*` endpoints |
| `src/server/license-config.ts` | **New.** Optional baked-in connection values for distributed builds. When filled, they win over `.env`. |
| `server.ts` | Creates the service and registers the gate **before every route**. Adds the license tables to the automatic migration, starts the checker at boot, version 3.5.0. |
| `src/components/admin/AdminLicensePage.tsx` | **New.** Super Admin → License page. |
| `src/components/admin/LicenseGate.tsx` | **New.** Lock screen around the dashboard and POS. |
| `src/lib/license.ts` | **New.** Frontend types, API calls and the shared license state. |
| `src/lib/api.ts` | A license refusal from the server opens the License screen. |
| `src/App.tsx` | Dashboard and POS wrapped in the license gate. |
| `src/components/admin/AdminLayout.tsx` | **License** item under System, grace-period warning banner on every page. |
| `src/components/admin/AdminDatabaseHealth.tsx` | Shows the license tables. |
| `database/database.sql` | Fresh installs include the two license tables (42 tables). |
| `database/upgrade-v3.5.sql` | **New.** Manual fallback. |
| `.env.example`, `README.md` (section 2a), `package.json` | Configuration and documentation. |

## 2. Database migration

The existing migration system (`ensureSchema()`) now also creates two tables when they are missing:

- **`license_state`** — one row:
  - the random 64-hex installation id, created once and kept forever;
  - the **encrypted** license key (AES-256-GCM, keyed from `SESSION_SECRET`) and its masked form;
  - the last verified signed token and its jti;
  - the bound domain and product;
  - the pinned public key, used only if you don't set one in `.env`;
  - sync times, next check, backoff and connectivity.
- **`license_events`** — the license activity and security log (last ~500 entries).

The migration only adds these tables. Nothing is dropped, truncated, reset or recreated, and your products, orders, customers, inventory and POS data are untouched. This was tested on a copy of an existing store database. Running it again changes nothing.

## 3. License middleware / guard

`license.gate` runs on the server for **every `/api/*` request**, before any route:

| Request | Rule |
|---|---|
| `/api/license/*`, `/api/auth/*` (sign-in, session, password recovery, owner credentials), health checks | Always allowed |
| `/api/admin`, `/api/pos`, `/api/dashboard`, `/api/media`, `/api/webhooks` | **Needs a valid license**, whoever calls |
| Any other request made with an **admin or staff session**, except public storefront reads | **Needs a valid license**. Endpoints added in the future are covered automatically. |
| `POST /api/orders` (online checkout) | Needs a valid license. Visitors get a polite 503 message. |
| Public storefront reads (products, categories, settings…) | Allowed, so the shop pages stay online |

More details:

- **Upper-case or trailing-slash variants of a path** (Express matches those too) are gated the same way.
- **Answers:**
  - `403 {code: LICENSE_REQUIRED | LICENSE_BLOCKED | LICENSE_INVALID | LICENSE_DOMAIN_MISMATCH}` for back-office requests. It is a 403, not a 401, so nobody is signed out.
  - `503` for checkout.
- **Domain binding:** every protected request's domain, normalized the contract's way, must equal the licensed domain. A copied installation on another domain is refused, and the copy is reported.
- **Who manages the license:** only the **Super Admin** (the owner account). Staff, including staff with the admin role, can't activate, check or deactivate. While the license is locked, staff are locked out of the POS as well.

## 4. API integration (per the contract)

| Call | When | What is sent / checked |
|---|---|---|
| `GET /api/v2/license/public-key` | Only if `LICENSE_PUBLIC_KEY` is empty, once, then pinned | Must be Ed25519 and 32 bytes |
| `POST /api/v2/license/activate` | Super Admin enters a key | Exactly `licenseKey, domain, installationId, productSlug, pluginVersion, platform:"pos", nonce`, with a fresh random nonce each time |
| `POST /api/v2/license/sync` | On the signed `nchk` schedule (3/7/14/30/60/90 days), or **Check now** | Exactly `licenseKey, domain, installationId, productSlug, pluginVersion, nonce` |
| `POST /api/v2/license/deactivate` | Super Admin → Deactivate (with confirmation) | `licenseKey, domain, installationId, nonce` |
| `POST /api/v2/license/report` | Local tampering, domain or installation mismatch, or an unverifiable response | Fire-and-forget, at most once per reason every 6 hours |

What is verified before anything is trusted:

- **Token:**
  - signature;
  - `typ:"QCT"`, `alg`, `kid`;
  - `dom`, `iid`;
  - product (`pslug` decides; `slug` only if there is no `pslug`);
  - `ptype`, `tv:2`;
  - `jti`, `exp`;
  - `lst` / `reason`;
  - `rev`, `grace_end`, `warn_at`, `block_at`.
- **Response:**
  - `LSR1` signature and `kid`;
  - `typ:"license-response"`, the `act` that was called;
  - **the nonce that was sent**;
  - `payload.jti === token jti`;
  - `payload.dom` / `iid`.

How outcomes are handled:

- **Network error, timeout, any 5xx, or 429:** nothing changes locally. The last good token is kept.
  - A 429 waits exactly `retryAfterMs`.
  - Other failures back off exponentially: 5 min, 10 min, 20 min … up to 12 h.
- **Verified 200 with a token:** stored, **even when `success=false`**. A revocation carries its own signed countdown.
- **Verified 403 with `requireActivation`:** this install must be activated again.
- **Anything unverified:** ignored and reported.

The offline decision follows the contract's table:

| Condition | State |
|---|---|
| Invalid signature, or `dom`/`iid` ≠ this install | Invalid (locked) |
| `now ≥ block_at` | **Blocked** (locked) |
| `rev` | **Warning** with days left, still working |
| Soft-expired, or `now ≥ warn_at` | Warning |
| `now > exp` | Warning "stale", still working |
| Otherwise | Active |

A future `block_at` on a hard-expiry product is only shown as a schedule. The time used never goes below the token's own signed `iat`.

## 5. UI

**Dashboard → System → License** is responsive and matches the existing admin style:

- A status banner: Active / Needs attention / Blocked / Not valid here / Not activated.
- License status, product, masked license key, domain, installation ID (copy button), license type and seats, expiry and policy.
- Activation date, last sync, next check, grace / block status, License Server connectivity (including the next retry time).
- Support information, recent license activity, **Check now** and **Deactivate**.

When the license is not active, the dashboard and POS show a **lock screen**:

- The owner gets the activation form plus Account & Security.
- Staff are told to ask the owner.
- If the dashboard is opened on the wrong address, a button opens the licensed domain.

During a grace period, **every dashboard page** shows a warning with the block date.

## 6. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `LICENSE_SERVER_URL` | **Yes** | Your License Server, `https://` only |
| `LICENSE_PRODUCT_SLUG` | **Yes** | This product's slug on the License Server. Comma-separated if it has aliases. |
| `LICENSE_PUBLIC_KEY` | Recommended | `publicKey` from `/api/v2/license/public-key`. If empty, it is fetched once and pinned. |
| `LICENSE_KEY_ID` | Recommended | `keyId` from the same endpoint |
| `LICENSE_PRODUCT_TYPE` | No | Default `ecommerce_pos`. Leave empty to skip the check. |
| `LICENSE_SUPPORT_NAME` / `_EMAIL` / `_PHONE` / `_URL` | No | Shown on the License page |
| `LICENSE_HTTP_TIMEOUT_MS`, `LICENSE_SYNC_COOLDOWN_SECONDS` | No | Default 15000 ms and 60 s |
| `SESSION_SECRET` | Already required | Keep it fixed. It also encrypts the stored license key. If it changes, the license keeps working and the page asks for the key again before the next check. |

## 7. Tests performed

These ran against a test License Server that implements the contract with its own throwaway keys. It is not part of the project.

**136/136 server checks passed.**

| Your scenario | Result |
|---|---|
| First activation | Activates. Token stored, key encrypted, dashboard, POS and checkout unlock. |
| Valid license | Active; all features work |
| Invalid license | 404 "not found"; stays locked |
| Wrong product | Rejected locally in the server's log mode (`pslug` differs), and refused with 403 in enforce mode |
| Wrong domain | 403 "locked to …" |
| Activation limit | 403 "all seats in use" |
| Duplicate activation | Idempotent: still one seat |
| Server offline | Activation: clear message, nothing stored. Sync: license unchanged, keeps working, retry scheduled. Also tested with the License Server process fully stopped and the app restarted. |
| Timeout | Same as offline |
| 429 | Unchanged; waits exactly `retryAfterMs` |
| 500 | Unchanged; backs off |
| Valid sync | New token; next check follows the signed 7-day interval |
| Revoked license | Token stored despite `success=false`; warning with 10 days left; still working |
| Suspended license | Warning with reason and days left |
| Grace period | Works during grace. A signed deadline passing **while the server is offline** blocks locally. |
| blockAt reached | Blocked: dashboard, POS and checkout refused. The server going offline doesn't unblock it. Renewing and syncing unblocks it. |
| Expired license | Soft expiry: warning, still working. Hard expiry past `block_at`: blocked. A future hard-expiry date: informational only. |
| Invalid signature | Response or token signed by another key: ignored, license unchanged, reported |
| Tampered token | In transit: rejected. Edited in the database: locked, reported, repaired by activating again. Also tested a replayed nonce and a jti mismatch. |
| Installation mismatch | Locked; activating again reuses the same seat |
| Unknown installationId | Verified 403 `requireActivation`: locked until activated again |
| Deactivation / reactivation | Seat released, install locked; reactivation works |
| Staff trying to bypass | Staff, including admin-role staff, can't activate or deactivate; their POS and dashboard are refused while locked |
| Direct backend API bypass | Every back-office prefix is refused, as are upper-case and trailing-slash variants, a not-yet-built admin route, a new non-admin route called with an admin session, and calls with no session |
| Existing database migration | Tables added on a copy of an existing store; products, customers and settings unchanged; restart is idempotent |

Also tested:

- A copied installation served on another domain is refused.
- Key pinning when no key is configured (fetched once, never again).
- The status endpoint never reveals the key or token.
- Every request carries a fresh nonce.
- The exact request fields match the contract.
- Unit checks of domain normalization and the decision table: 22/22.
- **Browser: 15/15.**
  - Lock screen and activation.
  - Wrong-key message.
  - License page.
  - "Check now" picking up a revocation.
  - Warning banner on every page.
  - Switching to the lock screen at the block time.
  - Staff lock screen on a phone.
  - Storefront stays up while checkout is refused.
  - Unlocking from the lock screen.
  - No sideways scrolling on phones.
- The previous round's browser checks (32/32) still pass.
- A fresh install from `database.sql`: 42 tables, starts locked, activates, health OK.

## 8. What you need to configure

1. **Set these in `.env` on the live server:**
   - `LICENSE_SERVER_URL`
   - `LICENSE_PRODUCT_SLUG` — must match the product's slug on your License Server
   - `LICENSE_PUBLIC_KEY` and `LICENSE_KEY_ID` — from `https://<your-license-server>/api/v2/license/public-key`
   - optionally the `LICENSE_SUPPORT_*` values
2. **On the License Server:** make sure the product row has `product_type = ecommerce_pos`, and check its verify interval, grace days and expiry policy. Create or issue the license key for the customer.
3. **Deploy:** upload, `npm install`, `npm run build`, restart.
4. **Activate:** sign in with the **owner** account on the real domain (e.g. `https://your-shop.com/admin`), then enter the key. Until then the dashboard, POS and online checkout are locked, as you asked. The shop pages stay visible.
5. **After activation,** open **License** and press **Check now** once to confirm the live connection.

Two things can't be confirmed from here:
- The real `productSlug`, public key and server address. They must come from your server.
- Whether your server's own responses match the contract byte-for-byte. The client is written strictly to the contract; if something differs, the License page's activity list will show the exact reason.
