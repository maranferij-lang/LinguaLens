# Запуск LinguaLens на новому Mac

Інструкція для чистого MacBook, на якому ще нічого не встановлено.
Раніше проєкт збирався на Windows — на Mac усе простіше: є симулятор iPhone,
а нативну збірку можна робити локально, без черги в хмарі.

> Команди вводь у **Terminal** (Програми → Утиліти → Термінал) по одній.

---

## 1. Інструменти (один раз, ~30–60 хв, здебільшого чекання)

### 1.1. Xcode — для симулятора й нативних збірок
1. App Store → **Xcode** → Встановити (≈ 10 ГБ). Потрібна версія **26.4 або новіша**:
   на ній збирається Expo SDK 57.
2. Відкрий Xcode один раз, погодься з ліцензією, дочекайся «Installing components».
3. Xcode → Settings → **Components** → постав симулятор **iOS 26** (якщо не стоїть).
4. У терміналі:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app
   xcodebuild -runFirstLaunch
   ```

### 1.2. Homebrew — менеджер пакетів
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Наприкінці інсталятор надрукує дві команди `echo … >> ~/.zprofile` і `eval …` — виконай їх.

### 1.3. Node.js 22, Watchman, Git, CocoaPods
```bash
brew install node@22 watchman git cocoapods
brew link --overwrite node@22
node -v   # має бути v22.13 або новіше
```

### 1.4. EAS CLI (збірки й відправка в App Store)
```bash
npm install -g eas-cli
```

---

## 2. Проєкт

```bash
cd ~/Documents
git clone https://github.com/maranferij-lang/LinguaLens.git
cd LinguaLens
npm install
```

---

## 3. Сервер локально (без жодних ключів)

```bash
cd server
cp .env.example .env
npm run dev          # PROVIDER=mock: завжди «кружка», ключ AI не потрібен
```
Перевірка в браузері: http://localhost:3000/health → `{"ok":true,"provider":"mock",…}`.

Щоб розпізнавати справжні предмети, впиши в `server/.env` `PROVIDER=gemini` і
`GEMINI_API_KEY=…` (безкоштовно: https://aistudio.google.com/apikey), потім `npm start`.

Залиш це вікно терміналу відкритим. Нове вікно — `⌘T`.

---

## 4. Застосунок

### Варіант А — симулятор iPhone на Mac (найшвидше)
```bash
cd ~/Documents/LinguaLens
npm run start:go
```
Натисни `i` — відкриється симулятор, Expo сам поставить у нього Expo Go.
(Саме `start:go`: у проєкті є `expo-dev-client`, тож звичайний `npx expo start`
чекає на development build з варіанта В.) Застосунок сам знайде локальний
сервер (`localhost:3000`). Камери в симуляторі немає, тож скан перевіряй на
телефоні; усе інше (словник, картки, профіль, пейвол) — тут.

### Варіант Б — Expo Go на iPhone
1. Постав **Expo Go** з App Store (він підтримує лише останній SDK — у нас 57).
2. `npm run start:go` → відскануй QR камерою iPhone.
3. Телефон і Mac — в одній Wi-Fi. Не підключається? `npx expo start --go --tunnel`
   (але тоді потрібен хмарний сервер, див. `DEPLOY.md`).

Покупки в Expo Go працюють у «Preview»-режимі RevenueCat (без оплати).

### Варіант В — development build (справжні покупки, сповіщення, сплеш)
```bash
npx expo run:ios                 # симулятор
npx expo run:ios --device        # підключений кабелем iPhone
```
Після першої збірки наступні запуски — просто `npx expo start` (без `--go`).
Перша збірка ~10 хв. Для iPhone знадобиться твій Apple ID у Xcode
(Xcode → Settings → Accounts).

---

## 5. Перевірки перед комітом

```bash
npm test              # тести застосунку (jest)
npm run test:server   # тести сервера
npm run doctor        # expo-doctor: версії пакетів
```

---

## 6. Що змінилось порівняно з Windows-інструкціями

| Було (Windows) | Тепер (Mac) |
|---|---|
| `copy .env.example .env` | `cp .env.example .env` |
| PowerShell, `npm.cmd`, проблеми з `'` у шляху | звичайний Terminal (zsh) |
| Лише Expo Go або хмарна збірка EAS | + симулятор iPhone і локальні збірки `npx expo run:ios` |
| Адреса сервера в `src/api.js` | `EXPO_PUBLIC_SERVER_URL` у `.env` (див. `.env.example`), локально визначається сама |
| SDK 54, Node 20 | SDK 57, Node 22, Xcode 26.4+ |
