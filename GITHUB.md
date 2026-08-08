# Залити проєкт у приватний GitHub

Я не зміг закомітити зі свого боку: git не тримає індекс через мережеве
монтування Windows-диска. З PowerShell це працює нормально — команди нижче
я вже підготував і перевірив, що секрети в коміт не потраплять.

**Вводь по одному рядку.**

---

## Крок 1. Перевірити, що секрети захищені

```powershell
cd "$HOME\Documents\LinguaLens"
```
```powershell
git status --short
```

У списку **не має бути**: `server/.env`, `server/data.json`, `node_modules/`.
Якщо вони там є — стоп, напиши мені.

---

## Крок 2. Перший коміт

```powershell
git add -A
```
```powershell
git commit -m "LinguaLens — AI-сканер предметів для вивчення мов"
```

---

## Крок 3. Створити приватний репозиторій

### Якщо є GitHub CLI

```powershell
gh auth login
```
```powershell
gh repo create LinguaLens --private --source=. --remote=origin --push
```

Готово, можна не читати далі.

### Якщо `gh` немає

1. Відкрий https://github.com/new
2. Repository name: **LinguaLens**
3. Visibility: **Private** ← обов'язково
4. **НЕ** став галочки «Add a README», «Add .gitignore», «Choose a license» —
   вони створять конфлікт із тим, що вже є
5. Create repository

Далі скопіюй URL і виконай:

```powershell
git remote add origin https://github.com/ТВІЙ_НІК/LinguaLens.git
```
```powershell
git branch -M main
```
```powershell
git push -u origin main
```

GitHub попросить логін. Пароль **не підійде** — потрібен Personal Access
Token: https://github.com/settings/tokens → Generate new token (classic) →
scope `repo` → скопіювати й вставити замість пароля.

---

## Далі — щоразу після змін

```powershell
git add -A
```
```powershell
git commit -m "коротко що зробив"
```
```powershell
git push
```

---

## Що лежить у репозиторії

```
App.js                  головний компонент, 5 вкладок, стан
index.js                точка входу + межа помилок + SafeAreaProvider

src/
  api.js                мережевий шар, автовизначення IP у розробці
  auth.js               сесія на пристрої
  subscription.js       тарифи, ліміти, воротар
  theme.js              дизайн-система: кольори, типографіка, тіні
  motion.js             ядро руху: криві, тривалості, пружини
  icons.js              17 іконок інтерфейсу
  AchIcons.js           27 іконок досягнень
  ProIcons.js           7 іконок пейволу
  Sticker.js            вирізання предмета по силуету
  Mascot.js  Logo.js  ui.js  Chrome.js  SafeArea.js
  ScannerScreen.js  DictionaryScreen.js  FlashcardsScreen.js
  QuizScreen.js  ProfileScreen.js  SettingsScreen.js
  PaywallScreen.js  AuthScreen.js  OnboardingScreen.js
  WordOfDayCard.js  AchievementToast.js  ErrorBoundary.js
  achievements.js  srs.js  speech.js  storage.js  wordOfDay.js  i18n.js

server/
  server.js             проксі до AI, авторизація, слово дня
  auth.js               scrypt + HMAC
  store.js              Firestore або файл
  words.js              320 курованих слів
  .env                  ключі — НЕ в git

figma/                  стан макетів, ID компонентів, шапка скриптів
assets/                 маскот, іконки, онбординг

README.md               опис і запуск
TESTING.md              як тестувати, чеклист на 10 хв
DEPLOY.md               сервер у Google Cloud Run
APPSTORE.md             реліз в App Store
MONETIZATION.md         тарифи, ліміти, що лишилось для StoreKit
SECURITY.md             що закрито, що відкрито, що критично
GITHUB.md               цей файл
```
