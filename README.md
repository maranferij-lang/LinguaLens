# LinguaLens 📷 → 🌍

An iPhone app: point the camera at an object and get its name in the language you are learning, with transcription, translation, an example sentence and audio. Words go into a dictionary, and from there into spaced-repetition flashcards and a quiz.

Architecture: **app → your server → AI API**. Keys live only on the server, and the user configures nothing.

---

## Features

| | |
|---|---|
| 📷 **Scanner** | object recognition in 1.5-2 s, zoom, language pair selection (29 languages) |
| 📖 **Dictionary** | saved words, search, native-pronunciation audio |
| 🎴 **Learning** | flashcards with a 3D flip + SRS, a 10-question quiz with a timer |
| 🌟 **Word of the Day** | one new word every day + a push notification; each user has their own order, with no repeats for 320 days |
| 👤 **Profile** | level, streak, weekly chart, per-language statistics, 17 achievements |
| ⚙️ **Settings** | account, languages, push time, 8 themes + auto, server check |
| 🎨 **Design** | Nunito, soft floating cards, the Lingo mascot, light and dark themes, animations |

---

## 1. Start the server (required)

```powershell
cd server
copy .env.example .env
```

Open `.env` in a text editor and fill it in:

- **For testing (free):** `PROVIDER=gemini` and `GEMINI_API_KEY=...`. The key takes 1 minute to get at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), and no card is needed.
- **For quality (paid):** `PROVIDER=anthropic` and `ANTHROPIC_API_KEY=...` from [console.anthropic.com](https://console.anthropic.com/settings/keys).
- **`AUTH_SECRET`**: required for accounts. Generate it with:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

Then:

```powershell
npm start
```

The server prints its address, e.g. `http://192.168.0.102:3000`. To check it: `http://localhost:3000/health` → `{"ok":true,"provider":"gemini","store":"file"}`.

Locally, users are stored in `server/data.json`. In the cloud, they are stored in Firestore (see `DEPLOY.md`).

## 2. Server address in the app

In `src/api.js`:

```js
export const SERVER_URL = 'http://192.168.0.102:3000';
export const APP_TOKEN = ''; // empty locally
```

The phone and the computer must be on the same Wi-Fi network.

## 3. Run the app

```powershell
npm install
npx expo start
```

## Design system

Mockups: [Figma](https://www.figma.com/design/c5DX8UXHJUdO58fwjIRTFq), 11 screens
in the light theme, 3 in the dark theme, with tokens and components on the Foundations page.
The code and the mockups use the same values; the cross-check is in `figma/STATE.md`.

**Warm chalk + one accent.** The background is never pure white (`#FAF8F4`). The accent
`#5B4FD6` was picked with an eyedropper from the skin of the Lingo mascot and deepened to a contrast of
5.6:1 on this background. It is the only saturated color in the interface: the turquoise from its
belly is used only for success states, amber only for the day streak,
and red only for errors. Shadows are warm (`#5C4F3D`), not gray: a gray shadow on a
warm background looks dirty.

Instead of a gallery of eight themes there is one signature theme in a light and a dark variant,
plus "Auto". Old theme keys are migrated automatically (`resolveThemeKey`).


Motion and typography follow two published rule sets:
[emilkowalski/skills](https://github.com/emilkowalski/skills) (design engineering, `apple-design`)
and [Nutlope/hallmark](https://github.com/Nutlope/hallmark).

`src/motion.js` is the single source of truth for animations:

| | |
|---|---|
| **Curves** | strengthened beziers: `out (0.23,1,0.32,1)`, `inOut`, and the iOS `drawer`. `ease-in` is not used anywhere in the UI: it slows things down exactly when the eye is most attentive |
| **Durations** | press 120 · hint 190 · panel 240 · sheet 280 · **exit 170**: an exit is always faster than an entrance |
| **Springs** | defined the Apple way, as a `(response, damping)` pair rather than mass/stiffness. The default is `damping 1.0`, **no overshoot**: an element that simply appeared was not thrown. Overshoot (`0.82`) is kept only for the card flip |
| **Stagger** | 40-45 ms between neighboring elements, capped at the sixth |
| **Performance** | all 10 animations run through `useNativeDriver` on the GPU. Progress bars scale along X instead of changing `width` |
| **Reduced motion** | the system "reduce motion" setting removes shifts, the mascot's bobbing and form shaking, and keeps opacity changes and haptics |

`src/theme.js`: tracking and leading depend on the font size (an Apple rule: a single
value for all sizes is always wrong somewhere): 34 pt → -0.75, 17 pt → -0.10,
small caps → +1.1. The `type(size, family)` function returns a ready-made style.

`src/Chrome.js`: the tab bar is a translucent material built with `expo-blur`; content
scrolls under it, and a light edge replaces a hard divider.

Scan the QR code with the iPhone camera and it opens in Expo Go.
Not connecting? Use `npx expo start --tunnel` (it bypasses VPNs and firewalls).

> SDK incompatible with Expo Go? `npx expo install expo@^<version shown in Expo Go>` + `npx expo install --fix`.

## 4. Structure

```
App.js                     - 5 tabs, onboarding/login gates, achievement detection
src/api.js                 - server calls (SERVER_URL and APP_TOKEN are here!)
src/auth.js                - session: SecureStore + AsyncStorage
src/AuthScreen.js          - sign in / sign up
src/ScannerScreen.js       - camera + result card
src/DictionaryScreen.js    - dictionary
src/FlashcardsScreen.js    - learning hub + flashcards
src/QuizScreen.js          - quiz
src/ProfileScreen.js       - profile, statistics, achievements
src/SettingsScreen.js      - settings
src/WordOfDayCard.js       - "Word of the Day" card
src/wordOfDay.js           - word cache + scheduling of local push notifications
src/achievements.js        - 17 achievements and levels
src/theme.js               - 8 themes, fonts, shadows
src/icons.js  src/Mascot.js  src/Logo.js  src/ui.js
src/i18n.js                - en / uk

server/server.js           - /health /scan /auth/* /me /word-of-day
server/auth.js             - scrypt password hashes, HMAC tokens
server/store.js            - storage: file or Firestore
server/words.js            - 320 curated words + shuffling by the user's seed
server/.env                - keys (do NOT commit to git!)
```

## 5. Next steps before release

1. `DEPLOY.md`: deploy the server to Google Cloud Run + enable Firestore.
2. `eas build` + `eas submit`: publish to the App Store without a Mac (Apple Developer, $99/year).
3. A privacy policy (required by the App Store because there are accounts) and the app page texts.

## How "Word of the Day" works

1. Each user gets a random `seed` at registration.
2. The server shuffles the list of 320 words deterministically by this seed → each user has their own order.
3. The word for day N = `order[(day_index + N) % 320]`, so there are no repeats for ~11 months.
4. The app fetches 7 days ahead, caches them locally and schedules 7 local notifications for the chosen hour.
5. Translations are cached on the server, so the same translation is never requested from the AI twice.
