# How to test LinguaLens right now

Two PowerShell windows: the server in one, Expo in the other. The phone and the computer
must be on the same Wi-Fi network.

---

## Window 1: the server

```powershell
cd "$HOME\Documents\LinguaLens\server"
node server.js
```

It should print something like this:

```
LinguaLens server запущено. Провайдер: gemini
  → у Wi-Fi мережі: http://192.168.0.102:3000
```

(The Ukrainian text is the server's startup log: "LinguaLens server started. Provider: gemini" and "on the Wi-Fi network".)

**Write this address down.** It may have changed since last time.
Check it in the browser: `http://localhost:3000/health` → `{"ok":true,...}`

If Windows asks about network access, allow it, otherwise the phone cannot reach the server.

---

## Window 2: the app

```powershell
cd "$HOME\Documents\LinguaLens"
npm install
npx expo start
```

This time `npm install` is mandatory, because four packages were added
(`expo-notifications`, `expo-secure-store`, `expo-blur`, `expo-splash-screen`).
It takes a minute or two.

Then scan the QR code with the iPhone camera and it opens in Expo Go.

### If the server address changed

Open `src/api.js`, line 8, and paste the new one:

```js
export const SERVER_URL = 'http://192.168.0.102:3000';
```

Then press `r` in the Expo window and the app will reload.

### If it does not connect

You have UrbanVPN / Grass / TAP adapters installed. They confuse Expo, which may
give the phone the address of a virtual adapter instead of the Wi-Fi one. The fix:

```powershell
npx expo start --tunnel
```

The tunnel is slower, but it bypasses the VPN and the firewall.

---

## What to check: 10 minutes

The order is deliberate: each next item builds on the previous one.

### First impression

- [ ] Onboarding: three screens, the «Почати» (Start) button is **at the bottom**, under the thumb
- [ ] The background is warm chalk, not pure white. The buttons are Lingo violet, not green
- [ ] Lingo does not twitch, but smoothly "breathes"

### Account

- [ ] Sign up with any email, a password of at least 6 characters
- [ ] The eye next to the password shows/hides the text
- [ ] Enter a wrong password → the form should **shake briefly** and give a vibration
- [ ] Close the app and open it again → you are still logged in

### Scanning: the main thing

- [ ] Point at an object, tap the big white circle
- [ ] The answer should arrive in **1.5-2 seconds**. If it takes 20+, something is wrong with the network
- [ ] On the card: the word, transcription, translation, example
- [ ] «Прослухати» (Listen) → the pronunciation is audible. **Check with the sound off on the
      side switch**: it should still play
- [ ] «Зберегти» (Save) → the word appears in the Dictionary

### Dictionary

- [ ] The rows are floating cards with a shadow, without divider lines
- [ ] Search with a magnifier icon, filters by word and translation
- [ ] Tapping a card expands the example
- [ ] Delete all words → an empty state with Lingo and the button «Сканувати перше слово» (Scan the first word),
      which **switches to the camera**

### Learning

- [ ] The "Word of the Day" card at the top, expands on tap
- [ ] Flashcards: the card flips with a slight overshoot (this is the only place
      where overshoot is allowed, since a card is a physical object)
- [ ] Quiz: the timer runs evenly, the correct answer is highlighted in turquoise

### Profile and settings

- [ ] Level, streak, three numbers, the weekly chart
- [ ] Change the Lingo avatar → it should persist after a restart
- [ ] **Theme**: three tiles, Auto / Light / Dark. Switch to Dark and the whole
      app should become warm graphite, not blue
- [ ] Switch the learning language to Spanish → scan → the word should be in Spanish

### Word of the Day and pushes

- [ ] Turn on "Daily notification" and allow notifications
- [ ] Set the hour closest to the current one (e.g. if it is 17:40 now, set 18:00)
- [ ] Minimize the app and wait: a push with the word should arrive

---

## What you CANNOT check in Expo Go

| | Why | Where it can be checked |
|---|---|---|
| Frosted glass tab bar | `expo-blur` needs a native build | in the EAS build |
| Splash screen | same | in the EAS build |
| App icon | Expo Go shows its own | in the EAS build |

This is normal: you will check it at the TestFlight step.

---

## If something went wrong

| Symptom | Cause | What to do |
|---|---|---|
| `running scripts is disabled on this system` | PowerShell blocks `.ps1`, and `npm`/`npx` are exactly those | either append `.cmd` (`npm.cmd install`), or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once |
| `Illegal characters in path` | the apostrophe in `Мар'ян` (a Ukrainian first name) breaks path parsing | quote the path or use `"$HOME\Documents\LinguaLens"` |
| `>>` appeared instead of a prompt | several lines were pasted together, and PowerShell is waiting for a continuation | `Ctrl+C` and enter one line at a time |
| «Час очікування вичерпано» (Timed out) | the server is not running or the IP is different | check window 1 and `src/api.js` |
| The scan returns 401 | the session token broke | sign out and sign in again |
| «Project is incompatible with this version of Expo Go» | Expo Go was updated | `npx expo install --fix` |
| A blank screen after the QR code | the VPN confuses the address | `npx expo start --tunnel` |
| No pronunciation sound | the language is not supported by the system | try English |
| The push does not arrive | permission was not granted or the hour has already passed | iOS Settings → LinguaLens → Notifications |

The server logs in the first window show every request, so you can see whether the scan arrived
and how long it took.
