# Сервер у Google Cloud Run (з Mac)

Після цього застосунок працює будь-де, а не лише у твоїй Wi-Fi, і його можна
давати друзям і подавати в App Store. Сервер без npm-залежностей; Cloud Run сам
збирає його з папки `server/`.

Команди вводь у Terminal. Плейсхолдери `ТВІЙ_…` заміни своїми значеннями.

---

## 1. Одноразова підготовка

```bash
brew install --cask gcloud-cli      # колишня назва cask: google-cloud-sdk — теж спрацює
gcloud init                         # вхід у Google і вибір/створення проєкту, напр. lingualens
```

Увімкни білінг: https://console.cloud.google.com/billing (картка потрібна, але
безкоштовного ліміту Cloud Run, ~2 млн запитів на місяць, вистачить надовго).

Потрібні сервіси (gcloud однаково спитає про них при першому деплої, `y`):

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com
```

Запам'ятай ID проєкту, він ще знадобиться:

```bash
PROJECT=$(gcloud config get-value project)
echo $PROJECT
```

> Змінні на кшталт `PROJECT`, `SA`, `URL` живуть, поки відкрите вікно
> терміналу. У новому вікні виконай рядок із `PROJECT=…` (і `NUM=…`/`SA=…` з
> кроку 3) ще раз.

## 2. Згенеруй секрети

```bash
openssl rand -hex 32      # AUTH_SECRET — підпис токенів пристроїв
openssl rand -hex 24      # APP_TOKEN — спільний токен застосунку
openssl rand -hex 24      # REVENUECAT_WEBHOOK_AUTH — пароль вебхука
```

Збережи їх у менеджері паролів.

- `AUTH_SECRET` живе лише на сервері. **Не міняй його після релізу:** кожен
  пристрій тихо отримає нову анонімну ідентичність, а лічильники сканів
  скинуться. Підписка не пропаде (її знає Apple і RevenueCat), але людям,
  можливо, доведеться натиснути «Відновити покупки». І гірше: зв'язок
  «Apple ID → акаунт зі словником» зберігається під HMAC цим секретом, тож
  після зміни вхід через Apple не знайде жодного старого словника.
- `APP_TOKEN` потрібен двічі: на сервері і в застосунку як
  `EXPO_PUBLIC_APP_TOKEN`. **Якщо задати його лише на сервері, усі запити
  застосунку отримають 401.** Можна не задавати взагалі, тоді перевірка вимкнена.
- `REVENUECAT_WEBHOOK_AUTH` піде на сервер і в налаштування вебхука
  RevenueCat (крок 8), символ у символ.

## 3. Firestore (сховище) і правила

Без Firestore сервер пише в `data.json` усередині контейнера, а контейнери
Cloud Run перезапускаються, тож дані зникали б.

```bash
gcloud firestore databases create --location=europe-central2
```

Або в браузері: https://console.cloud.google.com/firestore → **Create database**
→ режим **Native** → регіон `europe-central2` (Варшава).

**Правила доступу.** Сервер ходить у Firestore від імені сервісного акаунта
Cloud Run (IAM), а клієнти напряму туди не стукають узагалі. Поки проєкт **не
підключений до Firebase**, прямого доступу ззовні немає, і правила не потрібні.
Якщо колись додаси Firebase до цього проєкту (Analytics, Crashlytics тощо),
одразу відкрий Firebase Console → Firestore Database → Rules і встав:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Серверу ці правила не заважають: доступ через IAM їх обходить.

Сервісному акаунту потрібна роль **Cloud Datastore User**. У нових проєктах
її в дефолтного акаунта може не бути, тож додай одразу:

```bash
NUM=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
SA="$NUM-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role=roles/datastore.user
```

**Словники синхронізації** лежать у колекції `dicts`: увесь словник людини —
одне стиснене поле `data` до мегабайта. Шукати по ньому нічого, а індекс
такого поля лише коштує місця й часу на кожен запис. Вимкни індексацію
(колекції ще може не бути — це не заважає):

```bash
gcloud firestore indexes fields update data --collection-group=dicts --disable-indexes
```

**Відповіді онбордингу** (цілі, сфера, рівень, звідки дізнались) лежать у
записі пристрою: `users/<id>.profile`. Особистих даних там немає, лише
варіанти зі списків. Порахувати, скільки людей прийшло, наприклад, з TikTok
(замість `profile.heardFrom` і `tiktok` можна підставити `profile.field` і
`finance` чи `profile.level` і число без лапок, тоді `integerValue`):

```bash
curl -s -X POST "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents:runAggregationQuery" \
  -H "authorization: Bearer $(gcloud auth print-access-token)" -H 'content-type: application/json' \
  -d '{"structuredAggregationQuery":{"structuredQuery":{"from":[{"collectionId":"users"}],
       "where":{"fieldFilter":{"field":{"fieldPath":"profile.heardFrom"},"op":"EQUAL","value":{"stringValue":"tiktok"}}}},
       "aggregations":[{"alias":"n","count":{}}]}}'
# → [{"result":{"aggregateFields":{"n":{"integerValue":"…"}}}, …}]
```

Цілей може бути кілька, тож для них фільтр інший:
`"op":"ARRAY_CONTAINS"` на `profile.goals` зі значенням `"work"`.

## 4. Ключі в Secret Manager (рекомендовано)

Простими словами: змінні середовища видно кожному, хто відкриє сервіс у
консолі, і вони потрапляють в історію ревізій. Secret Manager — це сейф. Cloud
Run дістає з нього значення на старті й підставляє як звичайну змінну, тож код
міняти не треба.

```bash
printf '%s' 'ТВІЙ_GEMINI_КЛЮЧ'          | gcloud secrets create gemini-api-key --data-file=-
printf '%s' 'ТВІЙ_AUTH_SECRET'          | gcloud secrets create auth-secret --data-file=-
printf '%s' 'ТВІЙ_APP_TOKEN'            | gcloud secrets create app-token --data-file=-
printf '%s' 'sk_ТВІЙ_REVENUECAT_SECRET' | gcloud secrets create revenuecat-secret --data-file=-
printf '%s' 'ТВІЙ_WEBHOOK_AUTH'         | gcloud secrets create revenuecat-webhook-auth --data-file=-

# дозволити Cloud Run читати сейф
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" \
  --role=roles/secretmanager.secretAccessor
```

`printf '%s'` не додає перенесення рядка в кінець, і ключ лишається точним.

Хочеш почати швидше? Можна пропустити цей крок і передати все через
`--set-env-vars` (варіант Б нижче), а в сейф перенести пізніше.

## 5. Деплой

Для релізу потрібен **платний** тариф Gemini: на безкоштовному Google може
використовувати запити для покращення моделей, а це суперечить нашій політиці
приватності. Або бери ключ Anthropic (`PROVIDER=anthropic`, `ANTHROPIC_API_KEY`).

**Варіант А — із Secret Manager:**

```bash
cd ~/Documents/LinguaLens/server

gcloud run deploy lingualens-server \
  --source . \
  --region europe-central2 \
  --allow-unauthenticated \
  --set-env-vars "PROVIDER=gemini,FIRESTORE_PROJECT=$PROJECT,SUPPORT_EMAIL=ТВОЯ_ПОШТА" \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest,AUTH_SECRET=auth-secret:latest,APP_TOKEN=app-token:latest,REVENUECAT_SECRET_KEY=revenuecat-secret:latest,REVENUECAT_WEBHOOK_AUTH=revenuecat-webhook-auth:latest"
```

**Варіант Б — усе в змінних (для старту):**

```bash
cd ~/Documents/LinguaLens/server

gcloud run deploy lingualens-server \
  --source . \
  --region europe-central2 \
  --allow-unauthenticated \
  --set-env-vars "PROVIDER=gemini,GEMINI_API_KEY=ТВІЙ_КЛЮЧ,AUTH_SECRET=ТВІЙ_AUTH_SECRET,APP_TOKEN=ТВІЙ_APP_TOKEN,FIRESTORE_PROJECT=$PROJECT,REVENUECAT_SECRET_KEY=sk_…,REVENUECAT_WEBHOOK_AUTH=ТВІЙ_WEBHOOK_AUTH,SUPPORT_EMAIL=ТВОЯ_ПОШТА"
```

- `--allow-unauthenticated` потрібен: застосунок ходить без Google-логіна, а
  захист робить сам сервер (токени пристроїв, ліміти).
- `server/.env` у хмару не потрапляє (`.gcloudignore`), значення беруться лише з
  команди.
- Перша збірка триває 3–5 хв. Наприкінці буде адреса на кшталт
  `https://lingualens-server-xxxxx-lm.a.run.app`. Подивитись її знову:

```bash
gcloud run services describe lingualens-server --region europe-central2 --format='value(status.url)'
```

### Усі змінні сервера

Повний зразок із поясненнями лежить у [`server/.env.example`](server/.env.example).

| Змінна | Обов'язкова | Що це |
|---|---|---|
| `PROVIDER` | так | `gemini`, `anthropic` або `mock` (без ключа, завжди «кружка», тільки для тестів). Якщо не задано — `gemini` |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | так, для свого провайдера | ключ AI |
| `GEMINI_MODEL` / `ANTHROPIC_MODEL` | ні | модель; за замовчуванням `gemini-3.1-flash-lite` / `claude-haiku-4-5` |
| `AUTH_SECRET` | **так** | підпис токенів пристроїв. Без нього сервер бере випадковий при кожному старті, і всі пристрої «губляться» |
| `FIRESTORE_PROJECT` | **так** у хмарі | ID проєкту; порожньо — файл `data.json` |
| `APP_TOKEN` | рекомендовано | спільний токен; той самий у `EXPO_PUBLIC_APP_TOKEN` |
| `REVENUECAT_SECRET_KEY` | так, для Pro | секретний ключ RevenueCat `sk_…`: сервер сам перевіряє Pro |
| `REVENUECAT_WEBHOOK_AUTH` | так, для Pro | значення заголовка `Authorization` вебхука. Без нього вебхук відповідає 401 |
| `REVENUECAT_ENTITLEMENT` | ні | ідентифікатор entitlement у RevenueCat, за замовчуванням `lingualens_pro`. Має збігатися з дашбордом символ у символ, інакше сервер не побачить жодного Pro |
| `APPLE_AUDIENCES` | ні | bundle id застосунку для перевірки входу через Apple; за замовчуванням `com.marik.lingualens`. Кілька — через кому |
| `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | так, для релізу з входом через Apple | ключ Sign in with Apple (крок 9). Без них вхід працює, але при видаленні акаунта вхід не відкликається — App Review цього вимагає |
| `SUPPORT_EMAIL` | так | пошта на сторінках `/privacy` і `/support` |
| `FREE_SCANS` | ні | безкоштовних сканів **за все життя** запису (анонімний пристрій чи акаунт Apple), не на день; за замовчуванням `1`. Скани в Pro теж рахуються. Понад ліміт — `402 SCAN_LIMIT` до виклику AI |
| `FREE_SCENES` | ні | скільки сканів цілої кімнати (сцен) пристрій без Pro має **за все життя**, за замовчуванням `1`; `0` — сцени лише в Pro. Безкоштовна сцена забирає ще й безкоштовний скан, тож із `FREE_SCANS=1` після неї й звичайний скан — уже Pro. Понад пробу — `402 SCENE_PRO` до виклику AI |
| `RATE_PER_MIN` | ні | сканів з однієї IP за хвилину, за замовчуванням 20 |
| `TRUST_PROXY_HOPS` | ні | скільки проксі перед сервером. Cloud Run напряму — `1` (за замовчуванням), за External Load Balancer — `2` |
| `PORT` | ні | Cloud Run задає сам, не чіпай |
| `DATA_FILE` | ні | шлях до файлу сховища; потрібен лише тестам |

Ліміти (`FREE_SCANS`, `FREE_SCENES`) — цілі числа від 0. Опечатку на
кшталт `FREE_SCANS=три` сервер не перетворить на безлімітні скани: пише
попередження в лог і бере значення за замовчуванням.

`FREE_SCANS_PER_DAY` (денний ліміт до 4 жовтня 2026) **більше нічого не
робить**. Якщо сервіс її ще має, сервер при старті пише в лог
`billing: FREE_SCANS_PER_DAY=… ігнорую — ліміт тепер на все життя запису, його
задає FREE_SCANS` і працює з `FREE_SCANS`. Прибери її:

```bash
gcloud run services update lingualens-server --region europe-central2 \
  --remove-env-vars FREE_SCANS_PER_DAY
```

Старий лічильник записів (`usage.scans`) береться в рахунок довічного. Але
він знає лише скани **останнього активного дня** запису, і старий сервер
обнуляв його невдалим сканом: тестувальник, що вчора сканував, а сьогодні мав
лише невдалий скан, отримає ще один безкоштовний. Історії, якої немає, код не
відновить; стосується лише записів до запуску (TestFlight, dev). Якщо це
важливо — постав таким записам `scans: 1` вручну.

## 6. Перевірка

```bash
URL=$(gcloud run services describe lingualens-server --region europe-central2 --format='value(status.url)')

curl -s $URL/health
# {"ok":true,"provider":"gemini","store":"firestore"}   ← store має бути firestore!

curl -s -X POST $URL/auth/device -H 'x-app-token: ТВІЙ_APP_TOKEN'
# {"user":{"id":"…","createdAt":…},"token":"…"}
```

Відкрий у браузері `$URL/privacy` і `$URL/support`: обидві сторінки мають показати твою пошту
в розділі «Контакти», без плейсхолдера.

Якщо щось не так, дивись логи:

```bash
gcloud run services logs read lingualens-server --region europe-central2 --limit 50
```

## 7. Підключи застосунок

Адреса й токен ідуть у змінні EAS (докладно — [`USER_TODO.md`](USER_TODO.md), крок 7):

```bash
cd ~/Documents/LinguaLens
eas env:set production --name EXPO_PUBLIC_SERVER_URL --value $URL --visibility plaintext
# EXPO_PUBLIC_PRIVACY_URL не потрібен: застосунок сам відкриє $URL/privacy
eas env:set production --name EXPO_PUBLIC_APP_TOKEN --value ТВІЙ_APP_TOKEN --visibility plaintext
```

Те саме для `preview` і `development`, якщо збираєш ці профілі. Для локальної
перевірки з хмарним сервером впиши ті самі значення в кореневий `.env` і
перезапусти Metro з `npx expo start -c`.

> `EXPO_PUBLIC_APP_TOKEN` усе одно опиниться в бінарнику, тож справжнім секретом
> він не є (див. [`SECURITY.md`](SECURITY.md)). Тому `plaintext`, а не `secret`.

## 8. Вебхук RevenueCat

RevenueCat → твій проєкт → **Integrations → Webhooks → Add**:

- URL: `https://lingualens-server-…run.app/webhooks/revenuecat`
- Authorization header: те саме значення, що в `REVENUECAT_WEBHOOK_AUTH`,
  символ у символ (якщо там `Bearer abc…`, то і на сервері `Bearer abc…`)
- Environment: обидва (production і sandbox)

Натисни **Send test event**: RevenueCat має показати `200`. Якщо `401`,
значення заголовка не збігаються.

## 9. Sign in with Apple (синхронізація словника)

Вхід через Apple переносить словник між телефонами. Сам вхід працює без
жодних налаштувань сервера: identityToken перевіряється відкритими ключами
Apple. Але **App Store вимагає**, щоб «Видалити акаунт» відкликав і вхід
через Apple, а для цього серверу потрібен приватний ключ Sign in with Apple.

**1. Можливість у App ID.** EAS вмикає її сам на наступній збірці (у
`app.json` стоїть `ios.usesAppleSignIn: true`). Перевір:
https://developer.apple.com/account/resources/identifiers/list →
`com.marik.lingualens` → галочка **Sign In with Apple**.

**2. Ключ.** https://developer.apple.com/account/resources/authkeys/list →
**+** (Create a key):

- Key Name: `LinguaLens Sign in with Apple`
- галочка **Sign in with Apple** → **Configure** → Primary App ID:
  `com.marik.lingualens` → **Save**
- **Continue** → **Register** → **Download**

Файл `AuthKey_XXXXXXXXXX.p8` завантажується **лише один раз**: поклади його в
менеджер паролів одразу. `XXXXXXXXXX` у назві — це **Key ID**. **Team ID**
видно в https://developer.apple.com/account → Membership details (10 символів).

**3. На сервер.** Ключ — у сейф, як є (справжні переноси рядків не заважають):

```bash
gcloud secrets create apple-private-key --data-file=$HOME/Downloads/AuthKey_XXXXXXXXXX.p8
gcloud run services update lingualens-server --region europe-central2 \
  --update-env-vars APPLE_TEAM_ID=ТВІЙ_TEAM_ID,APPLE_KEY_ID=XXXXXXXXXX \
  --update-secrets APPLE_PRIVATE_KEY=apple-private-key:latest
rm $HOME/Downloads/AuthKey_XXXXXXXXXX.p8      # копія вже в сейфі й менеджері паролів
```

Для локального `server/.env` ключ записується одним рядком (див.
`server/.env.example`).

**4. Перевір логи** після деплою: рядка `apple: APPLE_PRIVATE_KEY не
розібрався` бути не повинно. Після першого входу через Apple на справжньому
iPhone і «Видалити акаунт» у лозі має з'явитися `apple: вхід відкликано`, а
LinguaLens зникне зі списку «Вхід через Apple» у налаштуваннях Apple ID на
iPhone.

> `APPLE_AUDIENCES` чіпати не треба, поки bundle id — `com.marik.lingualens`.
> Змінив bundle id — впиши новий, інакше кожен вхід отримає `APPLE_INVALID`
> (у лозі: `відхилено: APPLE_INVALID: aud`).

## 10. Ліміт бюджету

https://console.cloud.google.com/billing → **Budgets & alerts** → Create budget:
сума, напр. $20/міс, листи на 50%, 90% і 100%. Це не зупиняє сервер, а лише
попереджає. Різкий стрибок означає або вірусний ріст, або зловживання; в обох
випадках краще дізнатися першим.

Для Gemini можна ще й обмежити кількість запитів: Google Cloud Console →
APIs & Services → Generative Language API → **Quotas**.

## 11. Як оновлювати

Після змін у `server/`:

```bash
cd ~/Documents/LinguaLens/server
npm test                                                     # спершу тести
gcloud run deploy lingualens-server --source . --region europe-central2
```

Змінні й секрети з попереднього деплою зберігаються, передавати їх знову не треба.

Змінити одну змінну без перезбирання:

```bash
gcloud run services update lingualens-server --region europe-central2 \
  --update-env-vars FREE_SCANS=3
```

> `--set-env-vars` **замінює всі** змінні на ті, що в команді.
> Щоб змінити одну, використовуй `--update-env-vars`.

Новий ключ у сейфі:

```bash
printf '%s' 'НОВИЙ_КЛЮЧ' | gcloud secrets versions add gemini-api-key --data-file=-
gcloud run deploy lingualens-server --source . --region europe-central2   # щоб підхопив
```

Перемкнути провайдера на Claude:

```bash
printf '%s' 'sk-ant-…' | gcloud secrets create anthropic-api-key --data-file=-
gcloud run services update lingualens-server --region europe-central2 \
  --update-env-vars PROVIDER=anthropic \
  --update-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest
```

Відкотитись на попередню версію: Cloud Run Console → сервіс → **Revisions** →
попередня ревізія → Manage traffic → 100%.
