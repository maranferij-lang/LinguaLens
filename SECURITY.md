# LinguaLens Security

What is already closed, what is still open, and which of it is critical before release.

---

## Closed

### AI keys
They live **only** on the server (`server/.env` or Cloud Run variables). They do not get into the
app bundle. This was verified by scanning all 33 files for the patterns
`AIza…` and `sk-ant-…`. `.gitignore` covers `server/.env`, `*.p8`, `*.p12`,
`*.mobileprovision`, `credentials.json`.

### Passwords
`crypto.scryptSync` with a separate random salt for every password, 64 bytes
of output. Comparison via `crypto.timingSafeEqual`, which resists timing attacks.
Minimum **8 characters** (it was 6: six gave ~2 billion variants, which is actually
brute-forceable after a database leak). Maximum 200, so that a long string does not eat the CPU
in scrypt.

### Session tokens
HMAC-SHA256 signature, comparison via `timingSafeEqual`. They live for 180 days.
On the device they are in the Keychain (`expo-secure-store`), not in AsyncStorage.

### Password brute force
A separate counter: **10 attempts per 15 minutes** per IP. Before that, a general
limit of 20/min applied, which allowed 28,800 attempts per day, enough to guess
a weak password. The counter map cleans itself up so that it does not become a memory
exhaustion vector.

### Request body sizes
- `/auth/*`: **4 KB** (it was 64 KB for an email + password)
- `/scan`: **4 MB** (it was 15 MB; the app sends 150-400 KB)

### Headers
`nosniff`, `X-Frame-Options: DENY`, `no-referrer`, HSTS, `no-store` on all
responses.

### Logs
The email is no longer written to the logs. More people can see Cloud Run logs than the database.

### Frame privacy
The image goes to the AI and is **not stored** on the server. The object thumbnail
stays only on the user's device.

---

## Open: critical before release

### 1. The subscription state can be forged
`src/subscription.js` keeps the Pro status in `AsyncStorage`. Anyone with a
jailbreak or via a backup can set `pro: true`.

**How to close it:** after connecting StoreKit, validate the receipt via the App Store
Server API on our server and keep the status in Firestore next to the user.
The client should only cache the server's response, not be the source of truth.

### 2. The session token cannot be revoked
A signed token is valid for 180 days. If it leaks, the account can be stolen until
the end of its lifetime, and there is nothing we can do except change `AUTH_SECRET` (which logs
everyone out).

**How to close it:** a `tokenVersion` field on the user, included in the signature.
A password change or "sign out of all devices" increments it and instantly
invalidates the old tokens.

### 3. No account deletion
Apple Guideline 5.1.1(v) is mandatory for apps with registration.
It needs `DELETE /me` and an item in settings.

### 4. `APP_TOKEN` is empty
A public server URL without a token means open access to our Gemini key
for anyone who finds the address. The per-IP limit partly helps, but not against
distributed abuse.

**How to close it:** generate a token (`DEPLOY.md`, step 2), put it in Cloud Run
and in `src/api.js`. This is protection "from the accidental", not from the determined, so
the main protection remains a mandatory account for scanning.

### 5. Firestore without access rules
The server reaches Firestore through a service account, so the client cannot
reach it directly. But it is worth explicitly locking the database with the rules `allow read, write: if
false;`, so that an accidental opening via the web SDK does not expose the data.

---

## Open: worth doing, not critical

- **No `AUTH_SECRET` rotation.** Changing it logs everyone out. The solution: keep
  an array of secrets, sign with the first one, verify with any.
- **A per-user limit, not only per IP.** Right now a NAT network (a dormitory,
  an office) shares one limit. After mandatory authorization, count by `uid`.
- **No replay protection.** The same request can be
  replayed. For our scenario it is harmless, but paid actions will need it.
- **`Access-Control-Allow-Origin: *`.** Not a problem for a mobile app
  (no Origin is sent), and credentials do not pass with `*` according to the
  specification. But when a web version appears, remove it.
- **No monitoring.** A sharp jump in scans means either viral growth or
  abuse. It is worth setting up a spending alert in Google Cloud Billing.

---

## What to check before every release

```powershell
# 1. No key in the bundle
Select-String -Path src\*.js,App.js -Pattern "AIza|sk-ant-" 

# 2. Secrets are not tracked by git
git ls-files | Select-String "\.env$|\.p8$|\.p12$"

# 3. A budget limit is set in Google Cloud
# https://console.cloud.google.com/billing → Budgets & alerts
```
