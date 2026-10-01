# Що зробити тобі (реєстрації та ключі)

Код готовий працювати з усім нижче — бракує лише твоїх акаунтів і ключів.
Порядок важливий: кожен крок спирається на попередній. Орієнтовно 1–2 вечори
плюс очікування перевірок Apple.

Позначення: 🔑 — отримаєш ключ/значення, яке треба кудись вписати.

---

## 0. Mac
Усе встанови за [`SETUP_MAC.md`](SETUP_MAC.md) і переконайся, що застосунок
запускається в симуляторі з `npm run dev` у `server/`.

---

## 1. Apple Developer Program — $99/рік
1. https://developer.apple.com/programs/enroll/ → оплати. Перевірка: від кількох годин до 2 діб.
2. 🔑 **Team ID**: https://developer.apple.com/account → Membership details (вигляд `A1B2C3D4E5`).
3. App Store Connect → **Business** (раніше «Agreements, Tax, and Banking»):
   підпиши **Paid Apps Agreement**, заповни банк і податки.
   **Без цього підписки не продаватимуться** — навіть у TestFlight.

## 2. Застосунок в App Store Connect
1. https://appstoreconnect.apple.com → Apps → **+** → New App:
   iOS · назва **LinguaLens** · Bundle ID **com.marik.lingualens** · SKU `lingualens-001`.
2. 🔑 **Apple ID застосунку** (10 цифр на сторінці App Information) → це `ascAppId`.
3. Впиши `appleTeamId` і `ascAppId` у `eas.json` → `submit.production.ios`.

## 3. Підписки в App Store Connect
Твій застосунок → **Monetization → Subscriptions**:
1. Створи групу **LinguaLens Pro**.
2. Створи 4 автоподовжувані підписки з **точно такими** Product ID (вони вже в коді):

   | Product ID | Тривалість | Ціна (як у MONETIZATION.md) |
   |---|---|---|
   | `com.marik.lingualens.pro.week` | 1 тиждень | $4.99 |
   | `com.marik.lingualens.pro.month` | 1 місяць | $6.99 |
   | `com.marik.lingualens.pro.quarter` | 3 місяці | $16.99 |
   | `com.marik.lingualens.pro.year` | 1 рік | $34.99 |

3. Для річної: **Subscription Prices → Introductory Offers → Free trial, 1 week**.
4. Для кожної — назва й опис (англійською + українською) і скріншот пейволу
   (Apple просить його для перевірки підписки; зроби в симуляторі `⌘S`).

## 4. RevenueCat — є безкоштовний тариф для старту
1. https://app.revenuecat.com → зареєструйся → **Create project** «LinguaLens».
2. **Apps & providers → App Store**: Bundle ID `com.marik.lingualens` і
   **In-App Purchase Key** (.p8): App Store Connect → Users and Access →
   Integrations → In-App Purchase → згенеруй ключ і завантаж його в RevenueCat.
3. **Product catalog → Products**: імпортуй 4 підписки з App Store Connect.
4. **Entitlements** → створи `pro` (саме так, маленькими) і прикріпи до нього всі 4 продукти.
5. **Offerings** → `default` (Current) з пакетами:
   Weekly → `.pro.week`, Monthly → `.pro.month`, 3 Month → `.pro.quarter`, Annual → `.pro.year`.
   Застосунок розпізнає саме ці типи пакетів.
6. 🔑 **API keys**: публічний iOS-ключ `appl_…` → у застосунок (крок 7).
   🔑 **Secret API key** `sk_…` → на сервер (крок 5). Нікому не показуй.
7. **Integrations → Webhooks** → Add:
   URL `https://<адреса-сервера>/webhooks/revenuecat`,
   🔑 Authorization header — придумай довгий рядок, напр. `Bearer <випадкові 32 символи>`;
   той самий рядок піде в `REVENUECAT_WEBHOOK_AUTH` на сервері.

## 5. Сервер у Google Cloud Run
Деталі — у [`DEPLOY.md`](DEPLOY.md). Коротко:
1. `brew install --cask gcloud-cli` → `gcloud init` → увімкни білінг.
2. Увімкни **Firestore** (Native mode). Сервер ходить у базу через свій сервісний акаунт;
   правила безпеки потрібні, лише якщо колись підключиш Firebase (DEPLOY.md, крок 3).
3. Ключ AI: для релізу — **платний** тариф Gemini (на безкоштовному Google може
   використовувати запити для покращення моделей — це суперечило б політиці приватності)
   або ключ Anthropic.
4. Задеплой із змінними: `PROVIDER`, `GEMINI_API_KEY`/`ANTHROPIC_API_KEY`, `AUTH_SECRET`,
   `FIRESTORE_PROJECT`, `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `SUPPORT_EMAIL`.
   🔑 Необов'язково `APP_TOKEN` — довгий випадковий рядок. **Якщо задаєш його тут, той самий
   рядок обов'язково впиши в `EXPO_PUBLIC_APP_TOKEN` (крок 7)**, інакше кожен запит застосунку
   отримає 401.
5. 🔑 Адреса сервера `https://lingualens-server-…run.app`. Перевір `/health`, `/privacy` і `/support`.
6. Google Cloud → Billing → **Budgets & alerts**: постав ліміт (напр. $20) з листом-попередженням.

## 6. Пошта підтримки
Заведи окрему скриньку (напр. `lingualens.app@gmail.com`). Вона йде в
`SUPPORT_EMAIL` на сервері (з'явиться на сторінках `/privacy` і `/support`) і в
`EXPO_PUBLIC_SUPPORT_EMAIL` (пункт «Написати в підтримку» в налаштуваннях).

## 7. Змінні для збірки (EAS)
```bash
cd ~/Documents/LinguaLens
eas login
eas init                        # прив'яже проєкт і впише projectId в app.json
eas env:set production --name EXPO_PUBLIC_SERVER_URL --value https://<сервер> --visibility plaintext
eas env:set production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_… --visibility plaintext
eas env:set production --name EXPO_PUBLIC_SUPPORT_EMAIL --value <пошта> --visibility plaintext
# лише якщо на сервері задано APP_TOKEN (крок 5):
eas env:set production --name EXPO_PUBLIC_APP_TOKEN --value <той самий рядок> --visibility plaintext
```
Політику приватності застосунок сам відкриє з `<сервер>/privacy` — окремо її задавати не треба.
Те саме для `preview` (TestFlight-збірки для себе). Для локального запуску —
скопіюй `.env.example` у `.env` і заповни.

## 8. Перша збірка й TestFlight
```bash
npm run build:ios      # EAS зібере на своїх Mac і підпише сам (спитає Apple ID)
npm run submit:ios     # відправить у App Store Connect → TestFlight
```
Постав білд через TestFlight і пройди чеклист із [`TESTING.md`](TESTING.md).
Покупки в TestFlight — тестові (sandbox), гроші не списуються.

## 9. Сторінка в App Store
- Скріншоти 6.9" (1320×2868): симулятор iPhone 17 Pro Max → `⌘S`. 3–10 штук:
  сканер з наліпкою, колекція, картка «поділитись», флешкартки, слово дня.
- Опис, ключові слова, промо-текст — чернетки в [`APPSTORE.md`](APPSTORE.md).
- **App Privacy** — відповіді в APPSTORE.md (акаунтів більше немає — анкета коротша).
- Privacy Policy URL: `https://<сервер>/privacy`. Support URL: `https://<сервер>/support`.
- Age rating 4+, категорія Education.
- Submit for Review.

---

## Необов'язково, але варто

- **Instagram Stories напряму** (наліпка поверх історії, а не просто картинка):
  потрібен Facebook App ID (https://developers.facebook.com → Create App).
  Без нього картка шариться через системне меню — Instagram там теж є.
  Коли буде ID — скажи, додам пряму інтеграцію.
- **Sentry** (звіти про падіння): https://sentry.io → проєкт React Native → DSN.
  Скажи, коли буде, — підключу.
- **Домен** (напр. lingualens.app) — для гарнішої адреси політики й пошти.
