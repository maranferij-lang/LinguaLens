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

> **App Store пише «Xcode не можна інсталювати… потрібна macOS 26.6 або новіша»?**
> Свіжий Xcode завжди вимагає свіжу macOS. Варіанти, від найкращого:
> 1. Параметри системи → Загальні → **Оновлення ПЗ** → постав останню macOS,
>    потім Xcode ще раз.
> 2. Оновлення не пропонується (старий Mac) — Xcode поки можна не ставити:
>    скан і все інше перевіряєш на iPhone в **Expo Go** (розділ 4, варіант Б),
>    а повні збірки (віджет, Instagram, вхід через Apple, TestFlight) робить
>    хмара EAS: `eas build --profile development --platform ios`.
>    Command Line Tools, потрібні для Homebrew і git, ставляться окремо й на
>    старіші macOS (Homebrew запропонує це сам).
> 3. Старіша версія Xcode з https://developer.apple.com/download/all (вхід
>    Apple ID): біля кожної вказано мінімальну macOS. Для Expo SDK 57 годиться
>    лише 26.4 або новіша — якщо твоя macOS не тягне й її, лишається варіант 2.

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

Щоб тестувати без пейволу, у тому ж `server/.env` заміни `FREE_SCANS=1` на
`FREE_SCANS=1000` і `FREE_SCENES=1` на `FREE_SCENES=100`: безкоштовно лише
**один скан на все життя**, і скан в онбордингу його вже витрачає. На
продакшн-сервері цього не роби.

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

### Варіант В — development build (віджети, наліпки, сповіщення, сплеш)

**Симулятор — без акаунта розробника:**
```bash
cd ~/Documents/LinguaLens
npm run sim
```
Команда перегенеровує нативну частину (теку `ios/`), збирає застосунок і
відкриває його в симуляторі. Перша збірка ~10–15 хв. Далі для звичайної
роботи досить `npx expo start` → `i`. `npm run sim` повторюй лише після
`git pull`, у якому з'явилися нові пакети чи плагіни.

> **Чому не просто `npx expo run:ios`.** У застосунку є «Вхід через Apple»,
> і через нього Expo вимагає сертифікат розробника навіть для симулятора:
> «Your computer requires some additional setup before you can build onto
> physical iOS devices… No code signing certificates are available», хоч
> збірка й іде в симулятор. `npm run sim` збирає без цього права
> (`LL_SIMULATOR=1`, див. `app.config.js`): кнопка Apple в Параметрах тоді
> покаже помилку входу, а решта працює як у справжній збірці. У хмарну
> збірку EAS цей прапорець не потрапить: `scripts/check-release-env.js`
> її зупинить.
>
> **`git pull` пише «Your local changes … package.json would be
> overwritten»?** Скинь ці зміни: `git checkout -- package.json`, потім
> повтори `git pull`.

**iPhone на кабелі** — потрібен платний акаунт розробника ($99): додай його в
Xcode → Settings → **Accounts**, потім
```bash
npx expo prebuild --platform ios --clean
npx expo run:ios --device       # вибери iPhone зі списку
```

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
| Лише Expo Go або хмарна збірка EAS | + симулятор iPhone (`npm run sim`) і локальні збірки на iPhone (`npx expo run:ios --device`) |
| Адреса сервера в `src/api.js` | `EXPO_PUBLIC_SERVER_URL` у `.env` (див. `.env.example`), локально визначається сама |
| SDK 54, Node 20 | SDK 57, Node 22, Xcode 26.4+ |
