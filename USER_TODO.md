# Що зробити тобі (реєстрації та ключі)

Код готовий працювати з усім нижче — бракує лише твоїх акаунтів і ключів.
Загальний план із датами, цінами й запуском — у
[`LAUNCH_PLAN.md`](LAUNCH_PLAN.md), тексти для App Store — у
[`APPSTORE.md`](APPSTORE.md).
Порядок важливий: кожен крок спирається на попередній. Орієнтовно 2–3 вечори
плюс очікування перевірок Apple.

Позначення: 🔑 — отримаєш ключ/значення, яке треба кудись вписати.

> **Терміново, до 6 жовтня:** кроки 1, 2, **1.4** (Small Business Program) і
> **13** (номінація на фічеринг). Apple просить номінацію щонайменше за 3
> тижні до запуску 27 жовтня.

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
   **Без цього покупки не продаватимуться** — навіть у TestFlight.
4. **App Store Small Business Program** — комісія 15% замість 30%:
   https://developer.apple.com/app-store/small-business-program/ → Enroll.
   Подає Account Holder, Paid Apps Agreement має бути вже прийнята; у полі
   про пов'язані акаунти (Associated Developer Accounts) — нічого, якщо
   інших акаунтів немає. 15% почнуть діяти з 15-го дня після кінця
   фінансового місяця Apple, у якому заявку схвалять, — тому подавай одразу.
5. **Статус трейдера для ЄС (Digital Services Act).** App Store Connect →
   Business → вкажи, чи ти трейдер. Хто продає підписки, той трейдер. Тоді
   адресу, телефон і пошту, які ти вкажеш, побачать на сторінці застосунку в
   країнах ЄС, а Apple їх перевірить. Без статусу застосунок у ЄС (Польща,
   Німеччина, Іспанія…) не з'явиться. Не хочеш показувати домашню адресу —
   на старті прибери країни ЄС у Pricing and Availability або вкажи адресу
   ФОП чи віртуального офісу.
6. **Податки в Україні.** Виплати від Apple надходять на твій рахунок як
   іноземний дохід. Як їх оформити (найчастіше ФОП 3-ї групи) і що робити
   з валютою — спитай бухгалтера до першої виплати. У формі податків Apple
   (W-8BEN) вкажи, що ти резидент України.

## 2. Застосунок в App Store Connect
1. https://appstoreconnect.apple.com → Apps → **+** → New App:
   iOS · назва **LinguaLens** · Bundle ID **com.marik.lingualens** · SKU `lingualens-001`.
   Це й бронює назву (повну назву для сторінки зміниш пізніше, за `APPSTORE.md`).
2. 🔑 **Apple ID застосунку** (10 цифр на сторінці App Information) → це `ascAppId`.
3. Впиши `appleTeamId` і `ascAppId` у `eas.json` → `submit.production.ios`.

## 3. Покупки в App Store Connect
Сітка на старті: **місяць, рік і «Назавжди»** (чому — [`MONETIZATION.md`](MONETIZATION.md)).

1. Твій застосунок → **Monetization → Subscriptions** → створи групу **LinguaLens Pro**.
2. У групі — 2 автоподовжувані підписки з **точно такими** Product ID:

   | Product ID | Тривалість | США | Україна (вручну, як у США) |
   |---|---|---|---|
   | `com.marik.lingualens.pro.month` | 1 місяць | $6.99 | $6.99 |
   | `com.marik.lingualens.pro.year` | 1 рік | $34.99 | $34.99 |

3. **Monetization → In-App Purchases** → **+** → **Non-Consumable**:

   | Product ID | Що це | США | Україна (вручну, як у США) |
   |---|---|---|---|
   | `com.marik.lingualens.pro.lifetime` | Pro назавжди, разовий платіж | $79.99 | $79.99 |

4. Ціни: задай базову ціну США, потім у кожного продукту **Prices** →
   змінити країну вручну. **Україна — ті самі $6.99 / $34.99 / $79.99**
   (рішення 4 жовтня 2026): не покладайся на автоматичний перерахунок —
   український стор у доларах, ціна там уже з ПДВ 20%, і Apple може поставити
   іншу сходинку. Вибери Україну руками й перевір після збереження. Решта
   країн — з [`MONETIZATION.md`](MONETIZATION.md), розділ 7.
5. Для річної: **Subscription Prices → Introductory Offers → Free trial, 1 week**.
6. Для кожного продукту — назва й опис англійською та українською (готові —
   [`APPSTORE.md`](APPSTORE.md), «Покупки на сторінці») і скріншот пейволу
   для рецензента (симулятор, `⌘S`).
7. **Billing Grace Period**: Subscriptions → Billing Grace Period → увімкни:
   **16 днів**, **All Renewals**, **Production and Sandbox**. Якщо картка не
   пройшла, людина ще 16 днів лишається з Pro, поки Apple пробує списати.
8. Якщо колись уже створив `…pro.week` чи `…pro.quarter` — не видаляй і
   просто не додавай їх в offering (крок 4): Product ID не можна використати
   вдруге навіть після видалення, а для тижневого експерименту він ще
   знадобиться.

## 4. RevenueCat — безкоштовно до $2 500 доходу на місяць

### А. Тестовий магазин (для розробки, можна вже зараз)
1. https://app.revenuecat.com → зареєструйся → **Create project** «LinguaLens».
2. **Apps & providers → Test Store** (тестовий магазин RevenueCat; якщо його
   немає в списку — додай). 🔑 Його публічний ключ `test_…` → у `.env` і в
   оточення EAS `development` і `preview` (крок 7). **Ніколи — у `production`.**
3. **Product catalog → Products** (Test Store): `monthly` — підписка на
   1 місяць, `yearly` — на 1 рік (з пробним тижнем, якщо форма дає), `lifetime`
   — разова покупка. Ціни — як у США.
4. **Entitlements** → створи **`lingualens_pro`** (саме так, маленькими, з
   підкресленням) і прикріпи до нього `monthly`, `yearly`, `lifetime`.
5. **Offerings** → `default` → **Make current**. Пакети:
   `$rc_monthly` (Monthly) → `monthly`, `$rc_annual` (Annual) → `yearly`,
   `$rc_lifetime` (Lifetime) → `lifetime`. Застосунок показує саме ті
   пакети, що є в поточному offering, і розпізнає їх за типом.
6. Offering `default` → **Metadata** → встав:
   ```json
   { "onboarding_paywall": "show", "paywall_ui": "custom" }
   ```
   Що означають ключі — [`MONETIZATION.md`](MONETIZATION.md), розділ 4.
7. **Customer Center** (екран «Керувати підпискою» для людей із Pro):
   увімкни, вкажи пошту підтримки з кроку 6, залиш стандартні дії
   (скасувати, попросити повернення, відновити покупки).
8. *(Необов'язково)* **Paywalls** → новий пейвол із шаблону → прикріпи до
   offering → заповни тексти для **uk, en_US, de_DE, es_ES** (без усіх мов
   RevenueCat не опублікує), мова за замовчуванням — en_US. У текстах не
   обіцяй безкоштовних сканів «щодня» чи «на день»: безкоштовний скан один на
   все життя. Він покажеться,
   лише коли в метаданих `"paywall_ui": "revenuecat"` (зручно для
   експерименту, крок 18).

У development-збірці з ключем `test_…` покупка відкриває імітований аркуш
RevenueCat замість справжнього App Store — так і має бути.

### Б. App Store (для релізу, після кроку 3)
1. **Apps & providers → + App Store**: Bundle ID `com.marik.lingualens` і
   **In-App Purchase Key** (.p8): App Store Connect → Users and Access →
   Integrations → In-App Purchase → згенеруй ключ і завантаж його в RevenueCat.
2. **Product catalog → Products**: імпортуй `…pro.month`, `…pro.year`, `…pro.lifetime`.
3. Прикріпи всі три до **`lingualens_pro`**.
4. Offering `default`: у ті самі пакети додай продукти App Store
   (`$rc_monthly` → `…pro.month`, `$rc_annual` → `…pro.year`, `$rc_lifetime`
   → `…pro.lifetime`). Один пакет тримає по продукту для кожного магазину.
5. 🔑 **API keys**: публічний iOS-ключ App Store `appl_…` → лише в оточення
   EAS `production` (крок 7).
6. 🔑 **Secret API key** `sk_…` → на сервер (крок 5). Нікому не показуй.
7. **Integrations → Webhooks** → Add:
   URL `https://<адреса-сервера>/webhooks/revenuecat`,
   🔑 Authorization header — придумай довгий рядок, напр. `Bearer <випадкові 32 символи>`;
   той самий рядок піде в `REVENUECAT_WEBHOOK_AUTH` на сервері.
8. **Integrations → Apple Search Ads** → увімкни: тоді пробні й покупки
   видно по кампаніях Apple Ads (застосунок уже передає токен атрибуції, без
   запиту ATT).

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
   `REVENUECAT_ENTITLEMENT` не задавай: за замовчуванням сервер шукає
   `lingualens_pro`, як у кроці 4. Якщо раніше ставив `pro` — зміни на
   `lingualens_pro`, інакше сервер не побачить жодного Pro.
5. 🔑 Адреса сервера `https://lingualens-server-…run.app`. Перевір `/health`, `/privacy` і `/support`.
6. Google Cloud → Billing → **Budgets & alerts**: постав ліміт (напр. $20) з листом-попередженням.
7. **Ліміти безкоштовного рівня.** Стандарт: **1 скан на все життя** запису
   (анонімний пристрій чи акаунт Apple) і 1 скан кімнати, який забирає той
   самий скан. Для цього нічого задавати не треба. Якщо сервіс уже має стару
   `FREE_SCANS_PER_DAY` — прибери її: вона більше нічого не робить, сервер
   лише пише про неї попередження в лог.
   ```bash
   gcloud run services update lingualens-server --region europe-central2 \
     --remove-env-vars FREE_SCANS_PER_DAY
   ```
   Інші числа — лише якщо справді хочеш (наприклад, підняти безкоштовні
   скани до трьох, якщо дані покажуть, що одного мало):
   ```bash
   gcloud run services update lingualens-server --region europe-central2 \
     --update-env-vars FREE_SCANS=3
   ```
   `FREE_SCANS` — на все життя, не на день. `FREE_SCENES=0` — сцени лише в
   Pro, без спроби. Нова версія застосунку для цього не потрібна. Саме
   `--update-env-vars`: `--set-env-vars` замінив би всі змінні. **Не став
   `FREE_SCANS=1000` на продакшн-сервері** — це лише для тестів
   ([`TESTING.md`](TESTING.md)).

## 6. Пошта підтримки
Заведи окрему скриньку (напр. `lingualens.app@gmail.com`). Вона йде в
`SUPPORT_EMAIL` на сервері (з'явиться на сторінках `/privacy` і `/support`), в
`EXPO_PUBLIC_SUPPORT_EMAIL` (пункт «Написати в підтримку» в налаштуваннях) і в
Customer Center RevenueCat.

## 7. Змінні для збірки (EAS)
В EAS три оточення: `development` (dev-збірка), `preview` (збірки для своїх
пристроїв) і `production` (App Store й TestFlight).
```bash
cd ~/Documents/LinguaLens
eas login
eas init                        # прив'яже проєкт і впише projectId в app.json

# адреса сервера й пошта — для збірок, які ставиш на iPhone
for ENV in preview production; do
  eas env:set $ENV --name EXPO_PUBLIC_SERVER_URL --value https://<сервер> --visibility plaintext
  eas env:set $ENV --name EXPO_PUBLIC_SUPPORT_EMAIL --value <пошта> --visibility plaintext
done

# RevenueCat: тестовий магазин — для розробки, App Store — лише для релізу
eas env:set development --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value test_… --visibility plaintext
eas env:set preview     --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value test_… --visibility plaintext
eas env:set production  --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_… --visibility plaintext

# аналітика PostHog (крок 12) — лише в релізі
eas env:set production --name EXPO_PUBLIC_POSTHOG_KEY --value phc_… --visibility plaintext

# лише якщо на сервері задано APP_TOKEN (крок 5):
eas env:set production --name EXPO_PUBLIC_APP_TOKEN --value <той самий рядок> --visibility plaintext
```
- (У старих версіях EAS CLI команда звалась `eas env:create`.)
- **Захист від помилки:** продакшн-збірка зупиниться ще до початку, якщо в
  `production` немає ключа RevenueCat або там `test_…`. RevenueCat прямо
  забороняє подавати в App Store застосунок із ключем тестового магазину.
- Без `EXPO_PUBLIC_POSTHOG_KEY` аналітика просто мовчить — так і задумано для
  розробки. Адресу PostHog задавати не треба: за замовчуванням застосунок шле
  в ЄС (`https://eu.i.posthog.com`).
- TestFlight-збірки — це `production`, тож події бета-тестерів теж потраплять
  у PostHog. У дашбордах став фільтр «від 26 жовтня».
- Політику приватності застосунок сам відкриє з `<сервер>/privacy` — окремо її задавати не треба.
- Для локального запуску й development-збірки JavaScript береться з твого
  `.env` (Metro на Mac), тож скопіюй `.env.example` у `.env` і заповни (ключ
  RevenueCat — `test_…`). Адресу локального сервера застосунок у розробці
  знаходить сам.

## 8. Перша збірка й TestFlight
```bash
npm run build:ios      # EAS зібере на своїх Mac і підпише сам (спитає Apple ID)
npm run submit:ios     # відправить у App Store Connect → TestFlight
```
Постав білд через TestFlight і пройди чеклист із [`TESTING.md`](TESTING.md).
Покупки в TestFlight — тестові (sandbox), гроші не списуються.

## 9. Сторінка в App Store
Усе готове в [`APPSTORE.md`](APPSTORE.md):
- Локалі **English (U.S.)**, **Ukrainian**, **English (U.K.)**, **Spanish
  (Mexico)**, а також **French** і **Korean** — англійські «банки» для США
  (розділ «Сторінка застосунку»): назва, підзаголовок, ключові слова,
  промо-текст, опис. **Russian не додавай** (рішення 4 жовтня 2026).
  Українські ключові встав і подивись на лічильник: якщо рахує байти — бери
  короткий варіант.
- Скріншоти 6.9" (1320×2868): симулятор iPhone 17 Pro Max → `⌘S`, 6 штук з
  підписами для кожної мови.
- **App Privacy** — за таблицею в APPSTORE.md (з'явилась анонімна статистика).
- Privacy Policy URL: `https://<сервер>/privacy`. Support URL: `https://<сервер>/support`.
- Age rating 4+, категорія Education, додаткова Reference.
- На сторінці версії прикріпи місячну, річну й «Назавжди», In-App Event (крок 14)
  і обери **Manually release this version**.
- Нотатки для рецензента — з APPSTORE.md.
- Submit for Review — **до 20 жовтня**.

## 10. Instagram Stories: App ID від Meta (10 хвилин, безкоштовно)
Кнопка «Поділитися в Instagram Stories» в аркуші «Поділитися» відкриває
Instagram одразу з карткою (або з рухомою наліпкою — вигляд «Без тла»).
З 2023 року Instagram приймає таке лише разом з **App ID** застосунку Meta.
Без нього кнопки просто немає, а картки йдуть через системне меню.
1. https://developers.facebook.com → увійди своїм Facebook → **My Apps** →
   **Create app**.
2. Майстер спитає про сценарій (use case) — обери **Other**, тип застосунку —
   **Business**. Назва `LinguaLens`, пошта — та, що з кроку 6. Жодних
   продуктів (Facebook Login тощо) додавати не треба.
3. 🔑 **App ID** — число вгорі панелі застосунку (вигляд `1234567890123456`).
   Це **не секрет**: він однаково видний у кожному посиланні на Stories.
   Перевірка Meta (App Review) для цього не потрібна, а **App Secret** нікуди
   не вписуй.
4. Додай у збірку (як у кроці 7; або EAS → Project → **Environment variables**):
   ```bash
   eas env:set production --name EXPO_PUBLIC_FACEBOOK_APP_ID --value <App ID> --visibility plaintext
   eas env:set preview --name EXPO_PUBLIC_FACEBOOK_APP_ID --value <App ID> --visibility plaintext
   ```
   Для локального запуску — той самий рядок у `.env`.
5. Перезбери (`npm run build:ios`): App ID вшивається в бандл під час збірки.

## 11. Віджет «Слово дня» — нічого реєструвати не треба
- Віджет — окреме розширення застосунку (`com.marik.lingualens.ExpoWidgetsTarget`)
  зі спільною App Group `group.com.marik.lingualens`. Їх створить і
  підпише **EAS під час наступної збірки** (`npm run build:ios`): на питання
  про App Group і новий bundle ID відповідай «так».
- Працює лише в **development build** або **TestFlight** — в Expo Go віджетів немає.
- Додати на iPhone: довгий тап по порожньому місцю головного екрана →
  **Редагувати** → **Додати віджет** → знайди **LinguaLens** → обери розмір
  (малий або середній) → **Додати віджет**. На екран блокування: довгий тап
  по екрану блокування → **Налаштувати** → **Екран блокування** → поле під
  годинником → LinguaLens.
- Перед тим застосунок треба **один раз відкрити**: саме він передає віджету
  розмітку й слова на тиждень наперед.

## 12. PostHog — анонімна аналітика (безкоштовно)
1 млн подій і 1 млн запитів флагів на місяць безкоштовно; на безкоштовному
тарифі збір зупиняється на ліміті, рахунків не буде. Карта не потрібна.
1. https://eu.posthog.com/signup → регіон **EU Cloud** (дані у Франкфурті).
   Регіон обирається при реєстрації, потім його не зміниш.
2. Проєкт «LinguaLens». Майстер встановлення SDK пропусти — код уже готовий.
3. 🔑 **Project API key** (`phc_…`): Settings → Project → Project API key.
   Це не секрет (ключ лише для запису, він і так їде всередині застосунку) →
   `EXPO_PUBLIC_POSTHOG_KEY` (крок 7).
4. Settings → Project → **IP data capture** → **Discard client IP data**
   увімкнено (для проєктів у ЄС це стандарт — просто перевір).
5. **Data pipelines → Transformations → GeoIP** → вимкни. Інакше PostHog
   встигає визначити країну й місто з IP ще до того, як його відкине, — і в
   App Privacy довелося б додати Coarse Location. Пункти 4–5 обіцяє наша
   політика приватності («IP-адресу PostHog не зберігає, країну й місто не
   визначає»), тож не пропускай їх.
6. Session replay не вмикай (застосунок його й не шле).
7. **Experiments → New experiment**: назва «Onboarding flow», ключ флагу
   **`onboarding-flow`** (саме так), варіанти **`control`** і **`short`**,
   50/50, усі люди. Головна метрика — воронка `onboarding_step` (step =
   welcome) → `purchase_success`; додаткова — `onboarding_complete`.
   Збережи як **чернетку** й натисни **Launch 26 жовтня**, у день релізу.
   Поки експеримент у чернетці, застосунок бере `control` (варіант `short`
   покритий тестами в коді).
8. **Dashboards → New** «Запуск» і інсайти за [`LAUNCH_PLAN.md`](LAUNCH_PLAN.md),
   розділ 6.5. Перша — **Funnel** «Онбординг по кроках»: події
   `onboarding_step` із фільтром `step` = welcome, goals, level, plan, wow,
   push, heard, потім `onboarding_complete`; Breakdown → `flow`.
9. Перевір на своєму iPhone (TestFlight): Activity → нові події
   `onboarding_step`, `paywall_view`, `scan`. Вимкни в параметрах застосунку
   анонімну статистику — нові події мають зникнути.

## 13. Номінація на фічеринг — до 6 жовтня
Гарантії немає, але це безкоштовно. Потрібна роль Account Holder, Admin, App
Manager або Marketing.
1. App Store Connect → твій застосунок → **Featuring → Nominations → «+» →
   Create Nomination** → тип **App Launch**.
2. Дата публікації: **27 жовтня 2026**. Країни: США, Україна (можна ще
   Польщу й Німеччину). Мови: English, Ukrainian.
3. Опис (англійською, редактори читають його):
   ```
   LinguaLens is an indie app made in Ukraine that turns the world around you into vocabulary. Point the camera at any object and it is cut out as a sticker with its name in one of 29 languages, with pronunciation and an example sentence matched to your level. Scan a whole room and every object is labelled at once.

   Onboarding asks about your goals, your field and your level (A1–C2, on a slider), and the word of the day adapts: a finance professional at B2+ gets finance vocabulary, never beginner words. Spaced-repetition flashcards, a Home Screen and Lock Screen widget, and Strava-style share cards for Instagram Stories.

   The whole app is localised in Ukrainian, English, German and Spanish, with VoiceOver labels and Reduce Motion support throughout. No account required; Sign in with Apple is optional. We launch on October 27, 2026 in the US and Ukraine with a one-week "Label Your Kitchen" challenge.
   ```
4. Supporting URLs (до 5): публічне посилання TestFlight, якщо бета вже є;
   короткий ролик-демо; сторінка `/support`. Немає бети до 6 жовтня — подавай
   без посилання.
5. Helpful details: доступність (VoiceOver, Reduce Motion, темна тема),
   локалізація (4 мови інтерфейсу, 29 мов навчання).
6. Коли створиш подію (крок 14) — прикріпи її до номінації, якщо форма
   дозволяє редагування.

## 14. In-App Event «Підпиши кухню»
Подія для ще не схваленого застосунку йде **в тій самій подачі, що й перша
версія**.
1. App Store Connect → твій застосунок → **In-App Events → «+»**.
2. Reference name `kitchen-challenge-2026-10`, бейдж **Challenge**.
3. Дати події: **27 жовтня — 2 листопада 2026**; публікація — 27 жовтня
   (застосунку до релізу в сторі ще немає). Країни: усі, де продаємо.
4. Тексти en і uk — з [`APPSTORE.md`](APPSTORE.md), розділ «In-App Event на
   запуск» (назва ≤ 30, короткий опис ≤ 50, довгий ≤ 120 символів). Челендж
   уже переписано під один безкоштовний скан на все життя: кухня одним
   кадром і тиждень на її слова, а не «по предмету щодня».
   Вартість події: окремої покупки **не** позначай — для застосунків із
   підпискою Apple просить це лише тоді, коли подія коштує окремо (чому —
   там само в `APPSTORE.md`).
5. Картинки картки й сторінки події: кадр зі сценою кухні, підписаною
   словами; розміри підкаже форма.
6. Deep link не потрібен — подія відкриває застосунок.
7. **Add for Review** — разом із версією 1.0 (крок 9).

## 15. Apple Ads — $100 кредиту
Кредит дається, коли застосунок **уже в продажу**, тож реєструйся до
запуску, а кредит з'явиться після Release.
1. https://ads.apple.com → увійди Apple ID **власника акаунта розробника**
   (Account Holder) → обери **Advanced**.
2. Валюта — USD, якщо можна (інакше кредит перерахують у твою валюту).
3. У налаштуваннях **усього акаунта** прив'яжи App Store Connect. Якщо
   прив'язати лише групу кампаній — кредиту не буде.
4. Кампанії, бюджети й щотижневий ритм — [`LAUNCH_PLAN.md`](LAUNCH_PLAN.md),
   розділ 6.3. Brand — у день релізу, решта — з четвертого дня.
5. Перевір, що в RevenueCat увімкнено Apple Search Ads (крок 4Б, пункт 8).

## 16. Перевірка ключових слів (Astro або AppSprint)
Ми не знаємо популярності й складності ключових слів і не вигадуємо їх —
їх показують Astro (Mac) або AppSprint ASO (інструмент із відео). Вистачить
пробного періоду одного з них.
1. Додай застосунок (до релізу — тимчасовий запис).
2. Стор **United States**: усі слова й фрази з en-US, es-MX і «банків»
   (French, Korean) з [`APPSTORE.md`](APPSTORE.md). Стор **Ukraine**: uk і
   en-GB.
3. Для кожного запиши популярність і складність. Правило: **складність < 50,
   популярність > 20.** Що не проходить — заміни кандидатом зі списку в
   APPSTORE.md.
4. Надішли мені таблицю — я перерахую ліміти й повтори скриптом і поправлю
   APPSTORE.md. До подачі (20 жовтня), бо після релізу ключові слова
   міняються лише з новою версією.

## 17. A/B-тест сторінки (Product Page Optimization) — після релізу
Версія 1.0 виходить з **однією іконкою**, альтернативних у збірці немає
(рішення 4 жовтня 2026).
1. App Store Connect → твій застосунок → **Product Page Optimization →
   Create Test**.
2. Перший тест, у перші тижні — **скріншоти**: перший кадр «скан → наліпка»
   проти «ціла кімната». Локалізуй варіанти для тих мов, де вони є. Тест без
   альтернативних іконок іде на рецензію окремо, нова версія застосунку не
   потрібна.
3. Тест **іконки** — пізніше: спершу оновлення, яке додає альтернативні
   іконки в збірку (нова збірка й рецензія; скажи, коли час, — додам), потім
   тест: 2 варіанти, 50% трафіку.
4. Результати з'являються після 5 перших завантажень; рішення — коли App
   Store Connect покаже впевненість 90%. Подробиці — `LAUNCH_PLAN.md`, 6.4.

## 18. Експеримент у RevenueCat — через ~2 тижні після запуску
Спершу закінчи експеримент онбордингу в PostHog (крок 12). План усіх тестів
і правило зупинки — [`MONETIZATION.md`](MONETIZATION.md), розділ 6. Перший
(E1 — наш пейвол проти пейволу RevenueCat):
1. **Offerings → + New**: `default_rc` з **тими самими** трьома пакетами й
   продуктами, що й `default`. Metadata:
   `{ "onboarding_paywall": "show", "paywall_ui": "revenuecat" }`.
2. **Paywalls**: пейвол із шаблону, прикріплений до `default_rc`, з
   текстами uk, en_US, de_DE, es_ES (крок 4А, пункт 8). Перевір його на
   своєму iPhone: тимчасово зроби `default_rc` поточним, потім поверни `default`.
3. **Experiments → + New**: варіант A — `default`, B — `default_rc`; хто
   бере участь — **нові люди**; частка — 100% (мінімум 10%), поділ 50/50 → Start.
4. Sandbox і TestFlight у результат не йдуть. Зупиняй, коли в кожному
   варіанті ≥ 50 пробних чи покупок і минуло ≥ 14 днів. Переможця роби
   поточним offering.

---

## Необов'язково, але варто

- **Sentry** (звіти про падіння): https://sentry.io → проєкт React Native → DSN.
  Скажи, коли буде, — підключу (і додамо Crash Data в App Privacy).
- **Домен** (напр. lingualens.app) — для гарнішої адреси політики й пошти.

---

## v1.3 · W0 Фундамент

Розділи нижче (W1–W5) заповнює кожен потік v1.3 сам.

- **Перезібрати development build** (`eas build --profile development` або
  `npx expo run:ios` на Mac): v1.3 додає нативні пакети `expo-clipboard`,
  `expo-media-library`, `expo-image-picker` і ще два віджети в
  `app.json` (разом три). Без нової збірки віджети, «Копіювати» PNG і
  «Зберегти у Фото» перевірити неможливо (план, §9.3).
- Під час збірки EAS може спитати про App Group `group.com.marik.lingualens`
  для розширення віджетів — відповідай «так» (крок 11).

## v1.3 · W1 Сканер, «Навчання», серія 2.0

_Заповнює потік W1._

## v1.3 · W2 Віджети й Pro «кілька слів на день»

_Заповнює потік W2._

## v1.3 · W3 Онбординг 3.0 і скидання для розробки

_Заповнює потік W3._

## v1.3 · W4 Наліпки без тла: Stories, «Копіювати», «Зберегти»

- **Meta App ID (крок 10) тепер потрібен і для наліпок.** Без
  `EXPO_PUBLIC_FACEBOOK_APP_ID` в аркуші немає жодної кнопки Instagram:
  ні «Stories з цим фото», ні «або обрати фото з галереї», ні плитки
  «Stories». «Копіювати», «Зберегти» й «Ще» працюють і без нього. Зроби
  крок 10 до перевірки на телефоні (план §9.3, D9).
- **Перезібрати dev build** (крок v1.3 · W0 вище): цього разу змінився й наш
  Swift-модуль `modules/instagram-stories` — у ньому нова функція `copyPng`
  (наліпка в буфер саме як PNG з прозорістю). Стара збірка не впаде:
  «Копіювати» й «Зберегти» в ній просто сховані.
- **Перевірити на iPhone** пункти D7–D9 і D16 з `TESTING.md` (розділ
  v1.3 · W4): вставка в Нотатки/Stories/WhatsApp без білого прямокутника,
  PNG 900×1116 у «Фото», вибір фото з-під аркуша скану.
- **Розгорнути сервер** разом з v1.3 (як і для W2): у
  `server/public/privacy.html` додано речення про фото тлом для Stories
  (українською й англійською). Відповіді **App Privacy** в App Store Connect
  **не змінюються**: ці фото не залишають телефон.
- У «Фото» прозоре тло переглядач показує білим чи чорним — це нормально,
  тому тост і каже «з прозорим тлом». Якщо PNG на телефоні важчий за ~4 МБ
  (екрани P3 можуть дати 16-бітний PNG) — напиши, перекодуємо (ризик 2
  share.md).

## v1.3 · W5 Pro: кольорові теми, пейвол, умови тарифів

_Заповнює потік W5._
