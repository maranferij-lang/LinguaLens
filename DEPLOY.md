# Deploying the server to Google Cloud Run

After this the app will work anywhere (not only on your Wi-Fi), and you can give it to friends and put it in the App Store. Everything is done from Windows.

## 1. One-time setup

1. Install the **Google Cloud CLI**: https://cloud.google.com/sdk/docs/install (the Windows installer).
2. In a new PowerShell:
   ```powershell
   gcloud init
   ```
   Sign in with a Google account and create/choose a project (e.g. `lingualens`).
3. Enable billing (a card is required, but Cloud Run has a large free limit of ~2 million requests/month): https://console.cloud.google.com/billing

## 2. Generate two secrets

In PowerShell:

```powershell
# APP_TOKEN: the app token
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"

# AUTH_SECRET: signs the users' login tokens
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`APP_TOKEN` is needed twice (on the server and in the app), `AUTH_SECRET` only on the server.

> ⚠️ If you change `AUTH_SECRET` later, all users will be logged out of their accounts and will have to sign in again.

## 3. Enable Firestore (user storage)

Once, in the browser: https://console.cloud.google.com/firestore → **Create database** → **Native** mode, region `eur3` (or `europe-central2`).

Without this the server will store users in a `data.json` file inside the container, and Cloud Run containers restart, so the data will disappear.

## 4. Deploy the server (one command)

```powershell
cd "$HOME\Documents\LinguaLens\server"

gcloud run deploy lingualens-server `
  --source . `
  --region europe-central2 `
  --allow-unauthenticated `
  --set-env-vars "PROVIDER=gemini,GEMINI_API_KEY=ТВІЙ_GEMINI_КЛЮЧ,GEMINI_MODEL=gemini-3.1-flash-lite,APP_TOKEN=ТВІЙ_ТОКЕН,AUTH_SECRET=ТВІЙ_AUTH_SECRET,RATE_PER_MIN=20,FIRESTORE_PROJECT=ID_ТВОГО_ПРОЄКТУ"
```

The Ukrainian placeholders mean: `ТВІЙ_GEMINI_КЛЮЧ` is your Gemini key, `ТВІЙ_ТОКЕН` is your token, `ТВІЙ_AUTH_SECRET` is your AUTH_SECRET, `ID_ТВОГО_ПРОЄКТУ` is your project ID.

- `europe-central2` is Warsaw, the nearest region.
- `FIRESTORE_PROJECT` is the project ID from `gcloud config get-value project`. Empty = file storage (for local tests only).
- Keys and tokens live in Cloud Run environment variables; the `.env` file does not go to the cloud (`.gcloudignore`).
- On the first run gcloud will ask for permission to enable services: answer `y`.
- The Cloud Run service account needs the **Cloud Datastore User** role, which the default Compute service account usually already has.

At the end you will get a URL like:

```
https://lingualens-server-xxxxx-lm.a.run.app
```

Check it in the browser: `https://...run.app/health` → `{"ok":true,...}`.

## 5. Connect the app to the cloud

In `src/api.js` replace two lines:

```js
export const SERVER_URL = 'https://lingualens-server-xxxxx-lm.a.run.app';
export const APP_TOKEN = 'ТВІЙ_ТОКЕН'; // the same one as the server's APP_TOKEN
```

Restart expo (`r`). Now the app works through the cloud from anywhere, and the server accepts requests only with the correct token.

## 6. Updating the server after changes

Run the same `gcloud run deploy ...` command again.

## Check that accounts work

```powershell
$u = "https://lingualens-server-xxxxx-lm.a.run.app"
curl.exe -s -X POST "$u/auth/register" -H "content-type: application/json" -H "x-app-token: ТВІЙ_ТОКЕН" -d '{\"email\":\"test@test.com\",\"password\":\"123456\",\"name\":\"Test\"}'
```

It should return `{"token":"...","user":{...}}`. A second identical request → `email_taken`.

## Switch the provider to Claude (better quality)

```powershell
gcloud run services update lingualens-server --region europe-central2 `
  --set-env-vars "PROVIDER=anthropic,ANTHROPIC_API_KEY=sk-ant-...,APP_TOKEN=ТВІЙ_ТОКЕН"
```

## Protection that is already built in

- **User accounts**: the password is never stored, only a `scrypt` hash with its own salt. The session token is signed with HMAC-SHA256 (`AUTH_SECRET`), lives for 180 days, and is kept on the phone in `expo-secure-store` (Keychain).
- **App token** (`APP_TOKEN`): without the correct `x-app-token` header the server answers guests with 401. It stops casual abuse of your URL.
- **Per-IP limit** (`RATE_PER_MIN`, default 20/min): protection against flooding.
- For full control of spending, also set a **budget limit** in Google Cloud Billing and a quota in Gemini.

> A token in the app binary is protection "from the accidental", not "from hackers". The main protection now is accounts: a logged-in user makes requests with their own Bearer token.
