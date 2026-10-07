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
  застосунку отримають `403 APP_TOKEN`** (застосунок покаже загальну помилку
  сервера). Саме 403, а не 401: на 401 застосунок вважає, що сервер забув
  пристрій, і скидає ідентичність, а неправильний токен це помилка збірки. У
  логах Cloud Run шукай 403. Можна не задавати взагалі, тоді перевірка
  вимкнена.
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

### Резервні копії (один раз, до запуску)

Для людей, що ввійшли через Apple, документ у Firestore і є резервною копією
словника, а резервних копій самої бази за замовчуванням немає. Випадково
стерта колекція чи невдала міграція знищила б усе одразу: синхронізовані
словники (`dicts`), зв'язки з Apple ID (`appleAccounts`) і довічні лічильники
сканів (`users`), без жодного шляху назад. Увімкни відновлення на момент
часу (PITR; вікно відновлення до 7 днів) і щоденну копію:

```bash
gcloud firestore databases update --database='(default)' --enable-pitr
gcloud firestore backups schedules create --database='(default)' \
  --recurrence=daily --retention=14d
```

Назви прапорців і формат `--retention` можуть відрізнятись у твоїй версії
gcloud: звір з `gcloud firestore databases update --help` і
`gcloud firestore backups schedules create --help`. На нашому обсязі це
копійки за зберігання. Перевір, що все увімкнулось:
`gcloud firestore databases describe --database='(default)'` (відновлення на
момент часу має бути увімкнене) і
`gcloud firestore backups schedules list --database='(default)'` (розклад є).
Як відновлювати з копії, див. документацію Firestore (відновлення йде в нову
базу, а не поверх чинної).

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

Для релізу бери сейф (варіант А нижче). Прості змінні (варіант Б) видно в
консолі й вони лишаються в історії ревізій, а `AUTH_SECRET` після релізу
змінити не можна, тож загублену чи витеклу копію не відкличеш. Варіант Б лише
для швидкої першої перевірки: перенеси секрети в сейф до першої збірки в
TestFlight.

## 5. Деплой

Для релізу потрібен **платний** тариф Gemini: на безкоштовному Google може
використовувати запити для покращення моделей, а це суперечить нашій політиці
приватності. Або бери ключ Anthropic (`PROVIDER=anthropic`, `ANTHROPIC_API_KEY`).

**Варіант А — із Secret Manager (рекомендовано для релізу):**

```bash
cd ~/Documents/LinguaLens/server

gcloud run deploy lingualens-server \
  --source . \
  --region europe-central2 \
  --allow-unauthenticated \
  --max-instances 5 --min-instances 1 --concurrency 40 --timeout 60 --memory 512Mi \
  --set-env-vars "PROVIDER=gemini,GEMINI_MODEL=gemini-3.1-flash-lite,FIRESTORE_PROJECT=$PROJECT,SUPPORT_EMAIL=ТВОЯ_ПОШТА" \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest,AUTH_SECRET=auth-secret:latest,APP_TOKEN=app-token:latest,REVENUECAT_SECRET_KEY=revenuecat-secret:latest,REVENUECAT_WEBHOOK_AUTH=revenuecat-webhook-auth:latest"
```

**Варіант Б — усе в змінних (лише для першої перевірки):**

```bash
cd ~/Documents/LinguaLens/server

gcloud run deploy lingualens-server \
  --source . \
  --region europe-central2 \
  --allow-unauthenticated \
  --max-instances 5 --min-instances 1 --concurrency 40 --timeout 60 --memory 512Mi \
  --set-env-vars "PROVIDER=gemini,GEMINI_MODEL=gemini-3.1-flash-lite,GEMINI_API_KEY=ТВІЙ_КЛЮЧ,AUTH_SECRET=ТВІЙ_AUTH_SECRET,APP_TOKEN=ТВІЙ_APP_TOKEN,FIRESTORE_PROJECT=$PROJECT,REVENUECAT_SECRET_KEY=sk_…,REVENUECAT_WEBHOOK_AUTH=ТВІЙ_WEBHOOK_AUTH,SUPPORT_EMAIL=ТВОЯ_ПОШТА"
```

Ключ Sign in with Apple (крок 9) додається окремо, але **до першої збірки в
TestFlight**: токен для відкликання входу сервер отримує лише в момент входу.

- `--allow-unauthenticated` потрібен: застосунок ходить без Google-логіна, а
  захист робить сам сервер (токени пристроїв, ліміти).
- **`GEMINI_MODEL` закріплений явно**, щоб зміна значення за замовчуванням у
  коді не підмінила модель без твого відома. Перед запуском відкрий список
  моделей Gemini API (ai.google.dev, розділ про моделі) і переконайся, що
  `gemini-3.1-flash-lite` стабільна (GA), а не `-preview`: пробні моделі
  можуть зникнути без попередження, і тоді кожен скан дає 502. Я не міг
  перевірити цей id із середовища розробки. Якщо id інший, заміни його в
  команді й у розрахунку вартості (`MONETIZATION.md`, «Собівартість скану»).
- **Розмір сервісу** (стартові значення для тижня запуску, не виміряні):
  - `--max-instances 5`: ліміти частоти (`RATE_PER_MIN`, нові пристрої)
    живуть у пам'яті одного інстансу, тож кожен новий інстанс множить їх, а
    стеля інстансів обмежує й паралельні виклики Firestore та AI під час
    стрибка трафіку. Це не стеля сканів, лише стеля розміру сервісу.
  - `--min-instances 1`: рецензент і перші люди не зловлять холодний старт
    (скан у застосунку чекає 25 с, бюджет AI на сервері 21 с, запасу мало).
    Один постійно ввімкнений інстанс коштує невелику суму на місяць (дивись
    калькулятор Cloud Run; бюджетний алерт із кроку 10 лишається). Після
    запуску можна повернути 0:
    ```bash
    gcloud run services update lingualens-server --region europe-central2 --min-instances 0
    ```
  - `--concurrency 40`, `--memory 512Mi`: тіло `/scan` може сягати 4 МБ, а за
    стандартних 80 паралельних запитів пам'яті могло б не стачити на
    стрибку (оцінка, не вимірювання); 40 удвічі менше.
  - `--timeout 60`: бюджет AI на сервері 21 с, тож 60 с вистачає із запасом, а
    завислі запити не висять довше.
- Якщо перший `gcloud run deploy --source` на свіжому проєкті падає з помилкою
  прав на збірку, зазвичай допомагає видати сервісному акаунту (з кроку 3,
  `$SA`) роль `roles/run.builder` (перевір поточну пораду в документації Cloud
  Run).
- `--set-env-vars` **замінює всі** змінні, тож після кожного деплою дивись
  `/health` (крок 6): прапорець `false` означає, що змінну тихо знято.
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
| `GEMINI_MODEL` / `ANTHROPIC_MODEL` | ні, але закріпи | модель; за замовчуванням `gemini-3.1-flash-lite` / `claude-haiku-4-5`. У командах деплою вище `GEMINI_MODEL` вписаний явно, і перевірити його на GA-статус треба до запуску |
| `AUTH_SECRET` | **так** | підпис токенів пристроїв. Без нього сервер бере випадковий при кожному старті, і всі пристрої «губляться» |
| `FIRESTORE_PROJECT` | **так** у хмарі | ID проєкту; порожньо — файл `data.json` |
| `APP_TOKEN` | рекомендовано | спільний токен; той самий у `EXPO_PUBLIC_APP_TOKEN` |
| `REVENUECAT_SECRET_KEY` | так, для Pro | секретний ключ RevenueCat `sk_…`: сервер сам перевіряє Pro |
| `REVENUECAT_WEBHOOK_AUTH` | так, для Pro | значення заголовка `Authorization` вебхука. Без нього вебхук відповідає 401 |
| `REVENUECAT_ENTITLEMENT` | ні | ідентифікатор entitlement у RevenueCat, за замовчуванням `lingualens_pro`. Має збігатися з дашбордом символ у символ, інакше сервер не побачить жодного Pro |
| `APPLE_AUDIENCES` | ні | bundle id застосунку для перевірки входу через Apple; за замовчуванням `com.marik.lingualens`. Кілька — через кому |
| `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | **так**, до першої збірки в TestFlight | ключ Sign in with Apple (крок 9). Без них вхід працює, але при видаленні акаунта вхід не відкликається, а App Review цього вимагає. Токен для відкликання сервер бере лише в момент входу, тож акаунти, що увійшли до налаштування ключа, відкликати вже не вийде. `/health` показує `config.appleRevoke` |
| `SUPPORT_EMAIL` | так | пошта на сторінках `/privacy` і `/support` |
| `FREE_SCANS` | ні | безкоштовних сканів **за все життя** запису (анонімний пристрій чи акаунт Apple), не на день; за замовчуванням `1`. Скани в Pro теж рахуються. Понад ліміт — `402 SCAN_LIMIT` до виклику AI |
| `FREE_SCENES` | ні | скільки сканів цілої кімнати (сцен) пристрій без Pro має **за все життя**, за замовчуванням `1`; `0` — сцени лише в Pro. Безкоштовна сцена забирає ще й безкоштовний скан, тож із `FREE_SCANS=1` після неї й звичайний скан — уже Pro. Понад пробу — `402 SCENE_PRO` до виклику AI |
| `RATE_PER_MIN` | ні | сканів з однієї IP за хвилину, за замовчуванням 20 |
| `DEVICE_LIMIT_PER_HOUR` | ні | скільки нових установок (`POST /auth/device`) пускати з однієї IP за годину, за замовчуванням `20`. Лічильник у кожного інстансу свій. Ціле число більше 0: інакше (порожньо, `0`, текст) сервер пише попередження в лог і бере 20. Підняти без нової збірки: `gcloud run services update lingualens-server --region europe-central2 --update-env-vars DEVICE_LIMIT_PER_HOUR=60` |
| `TRUST_PROXY_HOPS` | ні | скільки проксі перед сервером. Cloud Run напряму — `1` (за замовчуванням), за External Load Balancer — `2` |
| `PORT` | ні | Cloud Run задає сам, не чіпай |
| `DATA_FILE` | ні | шлях до файлу сховища; потрібен лише тестам |

### Що сервер перевіряє при старті і що показує `/health`

Якщо `PROVIDER` не `mock`, сервер при кожному старті пише в лог **по одному
рядку `config: …` на кожну відсутню настройку** і все одно запускається
(поганий старт у Cloud Run означав би недоступний сервіс за кілька днів до
релізу). Той самий стан дає `GET /health`: до `ok`, `provider` і `store` додано
`config`, у якому лише булеві прапорці (самих значень там немає й не буде).
Для `PROVIDER=mock` (локальна розробка й тести) рядків немає.

| Прапорець `config` | Що має бути задано | Якщо `false` |
|---|---|---|
| `ai` | `GEMINI_API_KEY` або `ANTHROPIC_API_KEY` (за `PROVIDER`) | скани й слово дня віддають 502 |
| `authSecret` | `AUTH_SECRET` не коротший за 32 символи | підпис токенів тимчасовий: пристрої губляться при рестарті й на інших інстансах |
| `firestore` | `FIRESTORE_PROJECT` | дані лежать у файлі всередині контейнера й зникнуть при рестарті |
| `revenuecat` | `REVENUECAT_SECRET_KEY` | Pro визнається лише за вебхуком, без перевірки в RevenueCat |
| `webhookAuth` | `REVENUECAT_WEBHOOK_AUTH` | вебхук відповідає 401, покупки не доходять до сервера |
| `supportEmail` | `SUPPORT_EMAIL` | `/privacy` і `/support` лишаються із заглушкою замість пошти |
| `appleRevoke` | `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | при видаленні акаунта вхід через Apple не відкликається |

Прапорець каже, що змінну задано, а не що ключ робочий: перевірка справжнього
скану й Pro лишається окремо (крок 6). Також `/health` не звертається до
Firestore, тож сам по собі не доводить, що база відповідає.

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
# {"ok":true,"provider":"gemini","store":"firestore","config":{"ai":true,"authSecret":true,
#   "firestore":true,"revenuecat":true,"webhookAuth":true,"supportEmail":true,"appleRevoke":true}}
#   ← store має бути firestore, а всі сім прапорців config true

curl -s -X POST $URL/auth/device -H 'x-app-token: ТВІЙ_APP_TOKEN'
# {"user":{"id":"…","createdAt":…},"token":"…"}
```

Будь-який `false` у `config`: дивись у лозі рядки `config: …` (вони пишуться
при старті) і додай змінну (таблиця вище). Робити це треба після **кожного**
деплою.

Відкрий у браузері `$URL/privacy` і `$URL/support`: обидві сторінки мають показати твою пошту
в розділі «Контакти», без плейсхолдера.

**Скан зі справжнім фото (обов'язково до першої збірки).** `/health` не питає
ані Gemini, ані Firestore, тож id моделі, ключ чи квоту він не перевіряє. Один
запит із малим фото предмета (чашка, чайник; 100–400 КБ, не порожня стіна)
перевіряє весь ланцюг за півхвилини:

```bash
H='x-app-token: ТВІЙ_APP_TOKEN'     # без APP_TOKEN прибери цей рядок і -H "$H" нижче
T=$(curl -s -X POST $URL/auth/device -H "$H" | sed -E 's/.*"token":"([^"]+)".*/\1/')

IMG=$(base64 < ~/Desktop/mug.jpg | tr -d '\n')
printf '{"image":"%s","lang":"en","nativeLang":"uk"}' "$IMG" > /tmp/scan.json
curl -s -w '\nHTTP %{http_code}\n' -X POST $URL/scan -H "$H" -H "authorization: Bearer $T" \
  -H 'content-type: application/json' --data-binary @/tmp/scan.json
# → {"word":"mug", …}   і   HTTP 200

curl -s -X DELETE $URL/me -H "$H" -H "authorization: Bearer $T"    # прибрати тимчасовий запис
rm /tmp/scan.json
```

- `200` і слово в відповіді: модель, ключ і запис у Firestore працюють. Тимчасовий
  запис мав свій один безкоштовний скан, і той витрачено, тож це ≈ $0.001.
- `502` («AI тимчасово недоступний»): у лозі буде `AI ERROR: …`: найчастіше
  неправильний id моделі (`GEMINI_MODEL`), ключ без платного тарифу чи квота.
- `422` («Не бачу чіткого об'єкта»): фото без предмета, візьми інше.
- `403`: не збігається `APP_TOKEN`; `402`: чомусь вичерпано скан нового запису,
  перевір `FREE_SCANS`.

**Запасний провайдер.** Один раз до запуску перемкни сервіс на Anthropic
(крок 11, «Перемкнути провайдера на Claude»), повтори той самий запит і
поверни `PROVIDER=gemini`. Так ти знаєш, що запасний шлях справді працює, а не
відкриваєш його вперше під час збою Gemini. Людей до запуску немає, тож
перемикання нічого не ламає.

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

Це вебхук від RevenueCat до нашого сервера. Окремо від нього має працювати
ланка Apple → RevenueCat (App Store Server Notifications): без неї повернення
коштів і закінчення підписки доходять до RevenueCat із запізненням, а отже й
сюди. Як її ввімкнути: [`USER_TODO.md`](USER_TODO.md), крок 4, частина Б,
пункт 10.

## 9. Sign in with Apple (синхронізація словника)

Вхід через Apple переносить словник між телефонами. Сам вхід працює без
жодних налаштувань сервера: identityToken перевіряється відкритими ключами
Apple. Але **App Store вимагає**, щоб «Видалити акаунт» відкликав і вхід
через Apple, а для цього серверу потрібен приватний ключ Sign in with Apple.

> **Зроби цей крок до першої збірки в TestFlight.** Токен для відкликання
> сервер отримує лише в момент входу через Apple. Хто увійшов (зокрема твої
> тестери) до того, як ключ стоїть на сервері, лишиться без токена: його вхід
> уже не відкликати, і це видно лише як рядок `в акаунта, що видаляється, немає
> refresh-токена` в лозі. Без ключа сервер не падає й не скаржиться ніде,
> крім рядка `config: APPLE_TEAM_ID… не задано` при старті й
> `config.appleRevoke: false` у `/health`.

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

**4. Перевір** після деплою: у `/health` `config.appleRevoke` має бути
`true`, а рядка `apple: APPLE_PRIVATE_KEY не розібрався` у лозі бути не
повинно. Після першого входу через Apple на справжньому iPhone і «Стерти всі
мої дані» (в застосунку це і є видалення акаунта) у лозі має з'явитися
`apple: вхід відкликано`, а LinguaLens зникне зі списку «Вхід через Apple» у
налаштуваннях Apple ID на iPhone. Якщо Apple тимчасово недоступний, сервер
робить ще одну спробу; після неї невдача лишається рядком у лозі, а людина
може прибрати LinguaLens зі списку сама.

> `APPLE_AUDIENCES` чіпати не треба, поки bundle id — `com.marik.lingualens`.
> Змінив bundle id — впиши новий, інакше кожен вхід отримає `APPLE_INVALID`
> (у лозі: `відхилено: APPLE_INVALID: aud`).

## 10. Бюджет і моніторинг

### Ліміт бюджету

https://console.cloud.google.com/billing → **Budgets & alerts** → Create budget:
сума, напр. $20/міс, листи на 50%, 90% і 100%. Це не зупиняє сервер, а лише
попереджає. Різкий стрибок означає або вірусний ріст, або зловживання; в обох
випадках краще дізнатися першим.

Для Gemini можна ще й обмежити кількість запитів: Google Cloud Console →
APIs & Services → Generative Language API → **Quotas**.

### Моніторинг на тиждень запуску (до 25 жовтня)

Бюджет каже про гроші, але не про збій. Якщо Gemini віддає 429 чи 404, у
Firestore зламались права або відкликано ключ RevenueCat, сервер лишається
«здоровим», а ти дізнаєшся з відгуків. Налаштуй дві речі (точні назви пунктів
меню в консолі Google можуть відрізнятись; шукай Monitoring і Logging):

1. **Перевірка доступності (uptime check).** Cloud Monitoring → Uptime checks →
   створити: HTTPS, хост із `$URL` (без `https://`), шлях `/health`,
   сповіщення на пошту. Вона каже лише «процес відповідає»: `/health` не питає
   Firestore і AI, а прапорці `config` показують, що змінні задано, а не що
   ключі робочі. Тож цього мало.
2. **Сповіщення за логами (log-based alert)** на пошту, з фільтром:
   ```
   resource.type="cloud_run_revision"
   resource.labels.service_name="lingualens-server"
   (textPayload:"AI ERROR" OR textPayload:"UNHANDLED" OR textPayload:"revenuecat check failed")
   ```
   `AI ERROR` означає, що виклик Gemini чи Claude не вдався (ключ, модель,
   квота; людина бачить 502); `UNHANDLED` це необроблений виняток на сервері;
   `revenuecat check failed` каже, що перевірка Pro в RevenueCat не вдалась
   (ключ відкликано чи RevenueCat недоступний). Постав обмеження на частоту
   листів (наприклад, не частіше ніж раз на 30 хвилин), щоб один збій не
   засипав скриньку.

### Журнали: строк зберігання

Політика приватності (`/privacy`) обіцяє, що журнали запитів Google Cloud
зберігаються **до 30 днів**. Це типовий строк кошика `_Default`, але перевір
його: Logging → Logs Storage → `_Default` → Edit → Retention. Якщо
поставиш інакше, виправ число на сторінці (`server/public/privacy.html`, uk і
en). Власні рядки журналу сервера не містять ні фото, ні ідентифікатора
користувача; IP-адреси є лише у власних журналах запитів Google.

Після деплою й раз на день у перший тиждень подивись також
`gcloud run services logs read lingualens-server --region europe-central2
--limit 100` на рядки `config:` (відсутня настройка) і на відповіді `429` на
`POST /auth/device` (людей не пускає ліміт нових пристроїв; див.
`DEVICE_LIMIT_PER_HOUR` вище).

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
> Щоб змінити одну, використовуй `--update-env-vars`. Після будь-якої зміни
> глянь `/health` (крок 6): усі прапорці `config` мають лишитись `true`.

У день запуску так само піднімається ліміт нових установок з однієї IP
(кампус, офіс, оператор за спільним NAT), а за потреби й розмір сервісу:

```bash
gcloud run services update lingualens-server --region europe-central2 \
  --update-env-vars DEVICE_LIMIT_PER_HOUR=60
gcloud run services update lingualens-server --region europe-central2 \
  --max-instances 10
```

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
