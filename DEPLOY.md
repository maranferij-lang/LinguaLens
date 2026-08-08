# Деплой сервера в Google Cloud Run

Після цього апка працюватиме будь-де (не лише у твоїй Wi-Fi), і її можна давати друзям та класти в App Store. Усе робиться з Windows.

## 1. Одноразова підготовка

1. Постав **Google Cloud CLI**: https://cloud.google.com/sdk/docs/install (Windows-інсталятор).
2. У новому PowerShell:
   ```powershell
   gcloud init
   ```
   — залогінься Google-акаунтом і створи/обери проєкт (напр. `lingualens`).
3. Увімкни білінг (потрібна картка, але Cloud Run має великий безкоштовний ліміт ~2 млн запитів/міс): https://console.cloud.google.com/billing

## 2. Згенеруй два секрети

У PowerShell:

```powershell
# APP_TOKEN — токен апки
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"

# AUTH_SECRET — підпис токенів входу користувачів
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`APP_TOKEN` знадобиться двічі (на сервері і в апці), `AUTH_SECRET` — лише на сервері.

> ⚠️ Якщо потім змінити `AUTH_SECRET`, усі користувачі вилетять з акаунтів і муситимуть увійти знову.

## 3. Увімкни Firestore (сховище юзерів)

Один раз, у браузері: https://console.cloud.google.com/firestore → **Create database** → режим **Native**, регіон `eur3` (або `europe-central2`).

Без цього сервер зберігатиме юзерів у файл `data.json` усередині контейнера — а Cloud Run контейнери перезапускаються, і дані зникнуть.

## 4. Задеплой сервер (одна команда)

```powershell
cd "$HOME\Documents\LinguaLens\server"

gcloud run deploy lingualens-server `
  --source . `
  --region europe-central2 `
  --allow-unauthenticated `
  --set-env-vars "PROVIDER=gemini,GEMINI_API_KEY=ТВІЙ_GEMINI_КЛЮЧ,GEMINI_MODEL=gemini-3.1-flash-lite,APP_TOKEN=ТВІЙ_ТОКЕН,AUTH_SECRET=ТВІЙ_AUTH_SECRET,RATE_PER_MIN=20,FIRESTORE_PROJECT=ID_ТВОГО_ПРОЄКТУ"
```

- `europe-central2` — Варшава, найближчий регіон.
- `FIRESTORE_PROJECT` — ID проєкту з `gcloud config get-value project`. Порожньо = файлове сховище (лише для локальних тестів).
- Ключі й токени живуть у змінних середовища Cloud Run; файл `.env` у хмару не потрапляє (`.gcloudignore`).
- При першому запуску gcloud спитає дозволи на сервіси — відповідай `y`.
- Сервіс-акаунту Cloud Run потрібна роль **Cloud Datastore User** — зазвичай вона вже є у дефолтного Compute service account.

Наприкінці отримаєш URL типу:

```
https://lingualens-server-xxxxx-lm.a.run.app
```

Перевір у браузері: `https://...run.app/health` → `{"ok":true,...}`.

## 5. Підключи апку до хмари

У `src/api.js` заміни два рядки:

```js
export const SERVER_URL = 'https://lingualens-server-xxxxx-lm.a.run.app';
export const APP_TOKEN = 'ТВІЙ_ТОКЕН'; // той самий, що в APP_TOKEN сервера
```

Перезапусти expo (`r`) — тепер апка працює через хмару звідусіль, і сервер приймає запити лише з правильним токеном.

## 6. Оновити сервер після змін

Та сама команда `gcloud run deploy ...` ще раз.

## Перевірити, що акаунти працюють

```powershell
$u = "https://lingualens-server-xxxxx-lm.a.run.app"
curl.exe -s -X POST "$u/auth/register" -H "content-type: application/json" -H "x-app-token: ТВІЙ_ТОКЕН" -d '{\"email\":\"test@test.com\",\"password\":\"123456\",\"name\":\"Test\"}'
```

Має повернути `{"token":"...","user":{...}}`. Другий такий самий запит → `email_taken`.

## Перемкнути провайдера на Claude (краща якість)

```powershell
gcloud run services update lingualens-server --region europe-central2 `
  --set-env-vars "PROVIDER=anthropic,ANTHROPIC_API_KEY=sk-ant-...,APP_TOKEN=ТВІЙ_ТОКЕН"
```

## Захист, який уже вбудований

- **Акаунти користувачів**: пароль ніколи не зберігається — лише `scrypt`-хеш із власною сіллю. Токен сесії підписаний HMAC-SHA256 (`AUTH_SECRET`), живе 180 днів, лежить на телефоні в `expo-secure-store` (Keychain).
- **Токен апки** (`APP_TOKEN`): без правильного заголовка `x-app-token` сервер відповідає 401 гостям. Зупиняє випадкове зловживання твоїм URL.
- **Ліміт на IP** (`RATE_PER_MIN`, дефолт 20/хв): захист від флуду.
- Для повного контролю витрат постав ще **ліміт бюджету** в Google Cloud Billing і квоту в Gemini.

> Токен у бінарнику апки — це захист «від випадкових», не «від хакерів». Основний захист тепер — акаунти: залогінений юзер ходить із власним Bearer-токеном.
