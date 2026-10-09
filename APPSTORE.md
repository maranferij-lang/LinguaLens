# Releasing LinguaLens on the App Store

Everything is done from Windows, no Mac needed. EAS builds on its own macOS machines
in the cloud and uploads the build to App Store Connect by itself.

---

## What costs money

| | Price | Why |
|---|---|---|
| **Apple Developer Program** | **$99/year** | You cannot get into the App Store without it. This is the only mandatory expense. |
| EAS Build | a free tier exists | On the free plan the queue is longer (a build may wait 20-40 min). The paid plan starts at $19/month if waiting gets annoying. |
| Google Cloud Run | ~$0 | The free limit (2 million requests/month) will last a long time. |
| Gemini API | ~$0 | A free key gives ~250 scans/day. |

---

## Step 0. Two blockers to clear first

### 0.1. The server must be in the cloud, not on your Wi-Fi

Currently in `src/api.js`:

```js
export const SERVER_URL = 'http://192.168.0.102:3000';
```

This is your computer's address. For a user in America the app simply cannot reach it.
First follow **`DEPLOY.md`** (deploying to Google Cloud Run), get a URL like
`https://lingualens-server-xxxxx-lm.a.run.app` and paste it here.

> iOS blocks plain `http://` (App Transport Security). Cloud Run serves
> `https://` out of the box, so this will not be a problem, but the local address cannot be left in.

### 0.2. A privacy policy is required

Since the app has **accounts** (email + password), Apple requires a privacy policy
URL. Without it, the App Store Connect record will not save.

The fastest way: create a page on GitHub Pages or Notion and give a public
link. What the text should contain:

- what data is collected: email, name, saved words, learning statistics;
- why: to sync progress between devices;
- that camera photos are **not stored**: the frame goes to the AI for recognition and
  disappears immediately (this is true, the server does not write it to disk);
- the third party: Google Gemini processes the image for recognition;
- how to delete an account (Apple requires this ability in the app; see "What still
  needs to be done before submission" below).

---

## Step 1. Apple account

1. Sign up: https://developer.apple.com/programs/enroll/ ($99, paid by card).
   Identity verification takes from a few hours to 2 days.
2. After approval, get your **Team ID**: https://developer.apple.com/account →
   Membership details. It looks like `A1B2C3D4E5`.

## Step 2. Create the app record in App Store Connect

1. https://appstoreconnect.apple.com → My Apps → **+** → New App
2. Fill in:
   - Platform: **iOS**
   - Name: **LinguaLens** (must be unique across the whole App Store)
   - Primary Language: **Ukrainian** (or English)
   - Bundle ID: **com.marik.lingualens** - choose it from the list; if it is not there,
     create it at developer.apple.com → Identifiers
   - SKU: anything, e.g. `lingualens-001`
3. After creating it, get the **Apple ID of the app**: a 10-digit number at the top
   of the page (not your email). This is the `ascAppId`.

## Step 3. Fill in eas.json

Open `eas.json` and replace the two placeholders:

```json
"ios": {
  "appleId": "maranferij@gmail.com",
  "ascAppId": "6740000000",        ← number from step 2
  "appleTeamId": "A1B2C3D4E5"      ← Team ID from step 1
}
```

## Step 4. Build

```powershell
cd "$HOME\Documents\LinguaLens"
npm install
npm install -g eas-cli
eas login                 # Expo account, free
eas init                  # creates the projectId and writes it into app.json
eas build --platform ios --profile production
```

The first run asks about certificates: answer **Yes**, and EAS will generate and
store them itself. You will need your Apple ID password and the two-factor code.

The build takes 15-40 minutes. Progress is visible at the link the command prints.

> Before the first build it is worth running `npm run doctor`: expo-doctor finds
> package version mismatches.

## Step 5. Submit

```powershell
eas submit --platform ios --profile production
```

After 10-15 minutes the build appears in App Store Connect → TestFlight.
Install it on your phone through the TestFlight app and **click through everything**:
scan, saving a word, flashcards, quiz, registration, the Word of the Day push.

## Step 6. Store page materials

Prepare these in advance:

| What | Requirement |
|---|---|
| 6.9" screenshots | 1320×2868 or 1290×2796, from 3 to 10 of them. Capture them on the iPhone 16 Pro Max simulator or make them from the Figma mockups. |
| Description | up to 4000 characters |
| Keywords | up to 100 characters, comma-separated: `англійська,слова,камера,переклад,вимова,вивчення мов` (English, words, camera, translation, pronunciation, language learning) |
| Promotional text | up to 170 characters, can be changed without a new build |
| Icon | 1024×1024 **without an alpha channel**: already fixed, it is in `assets/icon.png` |
| Age rating | 4+ |
| Category | Education (primary), Reference (secondary) |

### App Privacy: what to declare

In the App Privacy section, honestly check:

- **Contact Info → Email Address** - Linked to user, for app functionality
- **User Content → Photos or Videos** - NOT linked, for app functionality
  (the frame goes to the AI and is not stored)
- **Identifiers → User ID** - Linked to user
- **Usage Data** - if you will not add analytics, check nothing

The question "Does your app use tracking?" → **No**.

---

## What still needs to be done before submission

These are not whims; they are what Apple actually rejects apps for:

- [ ] **Account deletion in the app.** Guideline 5.1.1(v): if there is registration,
      there must also be a delete-account button, not only "sign out". Currently there is only sign out.
      You need to add `DELETE /me` on the server and an item in settings.
- [ ] **A no-internet screen.** Right now, when the server is down, the user sees a scan
      error. The reviewer often tests in airplane mode.
- [ ] **Text for a denied camera permission.** If the user taps "Don't Allow", the screen must
      explain how to enable the permission in Settings, not just fall into emptiness.
- [ ] **Check pushes on a real device.** In Expo Go local notifications
      work, but it is worth confirming again in a production build.

---

## How long to wait

| Stage | Time |
|---|---|
| Apple Developer Program verification | from hours to 2 days |
| EAS build | 15-40 min |
| Processing in App Store Connect | 10-15 min |
| **Apple review** | usually 24-48 hours |

The first submission often comes back with a remark, and that is normal. The most common reasons
for an app like this: no account deletion, a broken link to the privacy
policy, screenshots that do not match the real appearance.

---

## Quick cheat sheet

```powershell
npm run doctor          # project check
npm run build:preview   # test build for yourself
npm run build:ios       # production build
npm run submit:ios      # submit to App Store Connect
```
