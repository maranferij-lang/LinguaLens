# Реліз LinguaLens в App Store

Збірка й відправка йдуть через **EAS**: він збирає на своїх Mac, сам веде
сертифікати й профілі та завантажує білд в App Store Connect. Твій Mac
потрібен для симулятора, скріншотів і локальних перевірок.

> `npx expo run:ios --configuration Release --device` збирає релізну версію
> прямо на твій iPhone. Це корисно, щоб перевірити швидкість і поведінку без
> dev-меню, але в App Store вона **не потрапляє**. Для магазину — лише EAS.

Реєстрації, ключі й підписки (Apple Developer, App Store Connect, RevenueCat,
сервер, змінні EAS) розписані по кроках у [`USER_TODO.md`](USER_TODO.md). Тут —
збірка, тексти сторінки, App Privacy і перевірка перед подачею.

---

## Що коштує грошей

| | Ціна | Коментар |
|---|---|---|
| **Apple Developer Program** | **$99/рік** | єдина обов'язкова витрата |
| Комісія Apple з підписок | 15% | якщо вступиш в **App Store Small Business Program** (дохід до $1 млн/рік). Без заявки — 30% за перший рік підписки. Заява: developer.apple.com → Small Business Program |
| EAS Build | є безкоштовний тариф | на free-плані черга довша (20–40 хв) |
| RevenueCat | безкоштовно на старті | плата з'являється лише з відчутним доходом |
| Google Cloud Run + Firestore | ~$0 | безкоштовних лімітів вистачить надовго |
| Gemini API (платний тариф) | центи на сотню сканів | безкоштовний тариф не годиться для релізу, див. `DEPLOY.md` |

---

## Збірка і TestFlight

```bash
cd ~/Documents/LinguaLens
npm test && npm run test:server && npm run doctor   # усе зелене?
eas env:list production                             # змінні на місці?
npm run build:ios                                   # продакшн-збірка в EAS (15–40 хв)
npm run submit:ios                                  # → App Store Connect → TestFlight
```

- Перший `build:ios` спитає про сертифікати — відповідай **Yes**, EAS усе
  згенерує сам. Знадобиться пароль Apple ID і код двофакторки.
- Номер збірки EAS збільшує сам (`autoIncrement`). Версію для людей
  (`1.0.0`) міняй в `app.json` → `expo.version` перед кожним новим релізом.
- Через 10–15 хв після `submit` білд з'явиться в TestFlight. Постав його на
  телефон і пройди чеклист із [`TESTING.md`](TESTING.md). Покупки там
  тестові (sandbox), гроші не списуються.
- `npm run build:preview` — збірка для своїх пристроїв без TestFlight. iPhone
  спершу треба зареєструвати: `eas device:create`.

---

## Сторінка застосунку

Основна мова — **English (U.S.)** (її читає рецензент і більшість світу), плюс
локалізація **Ukrainian**. Ліміти: назва й підзаголовок до 30 символів,
ключові слова до 100 (через кому без пробілів, без слів, які вже є в назві чи
підзаголовку), промо-текст до 170, опис до 4000.

### English

**Name:** `LinguaLens` (якщо зайнята — `LinguaLens: Snap & Learn`)

**Subtitle:** `Snap objects, learn words`

**Keywords:**
```
vocabulary,flashcards,translate,english,spanish,german,french,language,camera,sticker,quiz,study
```

**Promotional text:**
```
Point your camera at anything and get its name in the language you're learning — cut out as a sticker for your collection. Share your best finds to Stories.
```

**Description:**
```
Point. Snap. Learn.

LinguaLens turns the world around you into vocabulary. Point your camera at a cup, a plant or your bike and get its name in the language you're learning — with pronunciation, IPA, translation and an example sentence.

YOUR WORDS, AS STICKERS
Every object you scan is cut out along its outline with a white sticker border. Your dictionary becomes a collection of real things from your life — much easier to remember than a list.

REMEMBER WHAT YOU SCAN
• Flashcards with spaced repetition bring words back right before you forget them
• A quick 10-question quiz; missed words return for review
• A new word of the day, with a gentle reminder at the hour you choose
• Streaks, levels and 27 achievements

SHARE THE BEST FINDS
Turn a word, an achievement or your week into a clean 9:16 card and share it to Instagram Stories or any messenger.

29 LANGUAGES
English, Spanish, German, French, Italian, Portuguese, Polish, Ukrainian, Japanese, Korean, Chinese and more. Nouns come with their article where it matters (die Tasse, la taza).

NO ACCOUNT NEEDED
Open the app and start scanning. Your words and progress stay on your phone. Want a backup? Sign in with Apple to keep your words in sync on all your iPhones — we never ask for your name or email. Photos are used only to recognise the object and are not stored on our servers.

LINGUALENS PRO
Free: 5 scans a day, up to 100 words, one language. Pro removes the limits: unlimited scans, unlimited words, all 29 languages. Weekly, monthly, 3-month and yearly plans; the yearly plan may include a free trial for new subscribers.
Payment is charged to your Apple ID at confirmation of purchase. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your Apple ID settings.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://<server>/privacy
```

### Українська

**Назва:** `LinguaLens`

**Підзаголовок:** `Наведи камеру — вивчи слово`

**Ключові слова:**
```
англійська,словник,переклад,вимова,флешкартки,картки,німецька,іспанська,мови,наліпки,квіз,лексика
```

**Промо-текст:**
```
Наведи камеру на будь-що — і отримай назву мовою, яку вчиш, у вигляді наліпки для колекції. Найкращими знахідками ділися в Stories.
```

**Опис:**
```
Наведи. Зніми. Запам'ятай.

LinguaLens перетворює світ навколо тебе на словник. Наведи камеру на чашку, вазон чи велосипед — і отримай назву мовою, яку вчиш: з вимовою, транскрипцією, перекладом і прикладом.

СЛОВА-НАЛІПКИ
Кожен предмет вирізається по контуру з білою облямівкою, як справжня наліпка. Словник стає колекцією речей з твого життя, а такі слова запам'ятовуються набагато легше за список.

ЩОБ НЕ ЗАБУТИ
• Флешкартки з інтервальним повторенням повертають слово саме тоді, коли воно почне забуватись
• Квіз на 10 питань; помилки повертаються в повторення
• Щодня нове слово дня з нагадуванням о зручній годині
• Серія днів, рівні й 27 досягнень

ДІЛИСЯ НАЙКРАЩИМ
Слово, досягнення чи підсумок тижня — гарна картка 9:16 для Instagram Stories або месенджера.

29 МОВ
Англійська, іспанська, німецька, французька, італійська, португальська, польська, японська, корейська, китайська та інші. Іменники — з артиклем там, де він важливий (die Tasse, la taza).

БЕЗ РЕЄСТРАЦІЇ
Відкрив і скануєш. Слова й прогрес зберігаються на телефоні. Хочеш резервну копію — увійди через Apple, і словник буде однаковий на всіх твоїх iPhone. Імені й пошти ми не просимо. Фото потрібне лише для розпізнавання і не зберігається на наших серверах.

LINGUALENS PRO
Безкоштовно: 5 сканів на день, до 100 слів, одна мова. Pro знімає обмеження: скани без ліміту, словник без ліміту, усі 29 мов. Плани на тиждень, місяць, 3 місяці й рік; річний може починатися з безкоштовного пробного періоду для нових підписників.
Оплата списується з Apple ID після підтвердження покупки. Підписка продовжується автоматично, якщо не скасувати її щонайменше за 24 години до кінця поточного періоду. Керувати підпискою й скасувати її можна в налаштуваннях Apple ID.

Умови використання: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Політика приватності: https://<сервер>/privacy
```

### Решта полів

| Поле | Значення |
|---|---|
| Privacy Policy URL | `https://<сервер>/privacy` |
| Support URL | обов'язкове: `https://<сервер>/support` — часті питання (відновлення, скасування, повернення коштів, видалення даних) і пошта підтримки |
| Категорія | Education, додаткова — Reference |
| Вікова категорія | анкету проходь чесно: насильства, контенту для дорослих, чатів і реклами немає, тож очікувано 4+ |
| Ціна застосунку | Free (заробляємо на підписці) |
| Шифрування | не питатиме: `ITSAppUsesNonExemptEncryption: false` уже в `app.json` |
| Підписки | на сторінці версії → **In-App Purchases and Subscriptions** → обери всі 4. Перші підписки Apple перевіряє **тільки разом із версією застосунку** |

---

## Скріншоти

Потрібен один набір **6.9"** (1320×2868), 3–10 штук. iPad не потрібен:
`supportsTablet: false`. Знімай у симуляторі **iPhone 17 Pro Max** (`⌘S`
кладе PNG на робочий стіл). Кадр із камерою знімається лише на телефоні, тож
його вставляй у рамку 1320×2868 у Фігмі. Скріншоти мають показувати
застосунок таким, який він є, без функцій, яких немає.

| # | Екран | Підпис (en / uk) |
|---|---|---|
| 1 | Результат скану: наліпка, слово, транскрипція | Point. Snap. Learn. / Наведи. Зніми. Вивчи. |
| 2 | Словник → Колекція, повна сітка наліпок | Your world as stickers / Твій світ у наліпках |
| 3 | Аркуш «Поділитися» з карткою слова | Share your best finds / Ділися знахідками |
| 4 | Флешкартка, перевернута | Remember with spaced repetition / Повторюй вчасно |
| 5 | Квіз посеред сесії | Quick 10-question quiz / Квіз на 2 хвилини |
| 6 | Слово дня (картка + пуш) | A new word every day / Нове слово щодня |
| 7 | Профіль: серія, тиждень, досягнення | Streaks and achievements / Серії й досягнення |

Перед зйомкою набери 15–20 гарних слів (різні предмети, світле тло) і
вибери світлу тему.

---

## App Privacy — що відповідати

Apple вважає дані **«зібраними» (collected)**, якщо вони залишають телефон і
ми чи наші партнери можемо мати до них доступ **довше, ніж потрібно, щоб
відповісти на запит у реальному часі**. Від цього визначення й відштовхуємось.

**Does your app collect data?** → **Yes**, такі типи:

| Тип даних | Мета | Пов'язані з тобою? | Трекінг |
|---|---|---|---|
| **Identifiers → User ID** | App Functionality | **Yes** | No |
| **Purchases → Purchase History** | App Functionality | **Yes** | No |
| **User Content → Photos or Videos** | App Functionality | **No** | No |
| **User Content → Other User Content** | App Functionality | **Yes** | No |
| **Usage Data → Product Interaction** | App Functionality | **Yes** | No |
| **Other Data → Other Data Types** | Analytics | **Yes** | No |

**Чому так:**

- **User ID.** При першому запуску сервер видає випадковий id. Він живе в
  Keychain, на сервері до нього прив'язані лічильник сканів і статус Pro, а в
  RevenueCat — покупки. Хто входить через Apple, отримує id акаунта, а сервер
  зберігає ще й знеособлений хеш (HMAC) ідентифікатора Apple — щоб упізнати
  той самий акаунт на іншому iPhone. Імені й пошти ми не просимо й не знаємо,
  але за визначенням Apple дані вважаються пов'язаними, якщо перед збором з
  них не прибрали ідентифікатор. Тут сам id і є ідентифікатором, тому чесна
  відповідь — **Linked**. «Device ID» не підходить: у Apple це ідентифікатори
  рівня пристрою на кшталт рекламного, а наш id видає сервер, як номер
  користувача.
- **Other User Content.** Лише після входу через Apple: словник (слова,
  транскрипції, переклади, приклади, мови, розклад повторень) лежить на
  сервері під id акаунта, щоб синхронізуватися між iPhone людини. Тому
  **Linked**. Без входу словник не залишає телефон, але анкета App Privacy
  питає про застосунок загалом, а не про найскромніший сценарій.
- **Product Interaction.** Разом зі словником синхронізуються кількість дій
  за днями (для серії й графіка), лічильники досягнень (скільки квізів тощо)
  і список уже показаних досягнень. Це не аналітика, а частина прогресу
  людини, але за формою — дані про взаємодію з застосунком, пов'язані з id.
- **Other Data.** Відповіді онбордингу: цілі, сфера, рівень 1–10 і звідки
  людина про нас дізналась — лише варіанти з готових списків, без вільного
  тексту. Сервер зберігає їх біля id (`users/<id>.profile`), щоб ми бачили
  загальні числа («скільки прийшло з TikTok», «скільки фінансистів»), тому
  мета — **Analytics** і **Linked**. Слова дня сервер підбирає з профілю,
  який застосунок шле в самому запиті, і цю копію не зберігає — це відповідь
  у реальному часі, не збір. Якщо колись сервер почне брати слова зі
  збереженого профілю, додай мету **Product Personalization**.
- **Purchase History.** Статус підписки (дата закінчення) зберігається на
  сервері біля id пристрою, а RevenueCat тримає історію покупок під тим самим
  id. Тому теж **Linked**.
- **Photos.** Наш сервер кадр не зберігає й не логує. Але далі він іде до
  провайдера AI (Gemini або Anthropic), а ті за своїми умовами можуть
  тимчасово тримати запити, щоб виявляти зловживання. Це довше за «відповісти
  в реальному часі», тому позначаємо як зібране. **Not linked:** провайдер
  отримує лише зображення й текст підказки, без нашого id, а ми фото не
  зберігаємо зовсім. Якщо колись буде договір із провайдером про нульове
  зберігання (zero data retention), цей пункт можна буде прибрати.

**Не відзначаємо:**

- **Contact Info** (пошта, ім'я, телефон) — застосунок їх не питає, і вхід
  через Apple теж: ми не запитуємо в Apple ні ім'я, ні пошту (scope порожній),
  тож навіть «приховану» адресу @privaterelay ми не отримуємо. Лист у
  підтримку людина пише зі своєї пошти, поза застосунком.
- **Аналітики поведінки** (SDK, події, сесії) немає. Єдине, що ми рахуємо, —
  відповіді онбордингу (рядок Other Data вище). Сервер ще тримає число сканів
  за сьогодні (одне число, яке перезаписується щодня) як технічну квоту — воно
  вже покрите рядком Product Interaction вище.
- **Diagnostics** — звітів про падіння поки немає. Додамо Sentry — з'явиться
  **Crash Data**.
- **Location, Contacts, Financial Info** тощо — нічого з цього. Оплату проводить
  Apple, картки ми не бачимо.
- Фото наліпок, ім'я й аватар у профілі **не залишають телефон** навіть в
  акаунті, тож це не «збір».

**Does your app use data for tracking?** → **No**. Рекламного ідентифікатора
(IDFA) і запиту App Tracking Transparency немає.

Відповіді мають збігатися з політикою приватності (`server/public/privacy.html`,
сторінка `/privacy`). Якщо щось у застосунку зміниться, онови обидва.

---

## Нотатки для рецензента (App Review Information → Notes)

Sign-in required: **No** (поля логіна залиш порожніми): вхід через Apple
необов'язковий, рецензент може пройти все без нього. Текст англійською:

```
Signing in is optional. On first launch the app silently registers a random anonymous ID with our server; no personal data is requested, and every feature works without an account.

How to test:
1. Allow camera access, point the camera at any everyday object (a cup, a keyboard, a plant) and tap the shutter. Before the first scan the app explains that the photo is sent to our server and to a third-party AI service (Google Gemini or Anthropic) only to recognise the object, and asks for permission (Allow / Not now); nothing is uploaded before Allow. The object's name appears in the language being learned (Spanish by default on an English-language device, English otherwise; change it in Settings → I'm learning). Recognition needs an internet connection.
2. Tap Save. The word appears in the Words tab (List / Collection) and in Learn (flashcards and quiz).
3. Tap Share on a scan result or a word card: the app renders an image and opens the standard iOS share sheet.

Subscriptions (auto-renewable, via StoreKit / RevenueCat):
- The free tier allows 5 scans per day, 100 saved words and one learning language. The 6th scan attempt of the day opens the paywall; it can also be opened from Settings → Get Pro.
- Purchases work with a Sandbox Apple Account. Restore Purchases is available on the paywall and in Settings.
- The paywall shows prices from the App Store, the Terms of Use (Apple standard EULA) and the Privacy Policy.

Optional account (Sign in with Apple):
- Sign in with Apple is the only sign-in method in the app; there is no third-party or email login (Guideline 4.8). We request no name and no email (empty scope).
- Settings → Account → Sign in with Apple backs up the word list and syncs it between the person's iPhones. To test sync: sign in on two devices with the same Apple Account, save a word on one, then open the app (or tap Sync now) on the other.
- Sign out (Settings → Account) clears the device; the words stay in the account and come back after signing in again.

Data and account deletion (Guideline 5.1.1(v)): Settings → Data → Erase all my data removes the server record and all data on the device. For a signed-in user it also deletes the account and the synced word list from our server and revokes the Sign in with Apple token.

Offline: scanning shows an explanatory message; the dictionary, flashcards and quiz keep working.

Contact: <your email>
```

---

## Перевірка перед «Submit for Review»

**Акаунти й налаштування**
- [ ] App Store Connect → Business: **Paid Apps Agreement** активна, банк і податки заповнені
- [ ] 4 підписки в групі «LinguaLens Pro» мають статус **Ready to Submit**: назва, опис en/uk, скріншот пейволу для рецензента
- [ ] Річна має пробний тиждень (Introductory Offer → Free trial, 1 week)
- [ ] RevenueCat: entitlement `pro` з усіма 4 продуктами, offering `default` позначений **Current**, 4 пакети (Weekly, Monthly, 3 Month, Annual)
- [ ] RevenueCat → вебхук на `/webhooks/revenuecat`, тестова подія дає `200`

**Сервер**
- [ ] `/health` → `"store":"firestore"` (не `file`!) і потрібний провайдер
- [ ] `/privacy` відкривається, у «Контактах» твоя пошта, а не плейсхолдер
- [ ] Платний тариф Gemini або ключ Anthropic
- [ ] Бюджетний алерт у Google Cloud

**Збірка**
- [ ] `eas env:list production`: `EXPO_PUBLIC_SERVER_URL`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (`appl_…`), `EXPO_PUBLIC_SUPPORT_EMAIL`, а також `EXPO_PUBLIC_APP_TOKEN`, якщо на сервері задано `APP_TOKEN`
- [ ] `eas.json` → `submit.production.ios`: справжні `ascAppId` і `appleTeamId`
- [ ] Перевір пошту після завантаження білда: якщо Apple пише про Privacy Manifest (`ITMS-91053`), напиши мені — додамо декларацію

**TestFlight (на справжньому iPhone)**
- [ ] Увесь чеклист із `TESTING.md`
- [ ] Sandbox-покупка: Pro вмикається, **6-й скан за день проходить** (отже сервер теж бачить Pro)
- [ ] Видали застосунок і постав знову → «Відновити покупки» повертає Pro
- [ ] Пейвол показує ціни з App Store у місцевій валюті; посилання Terms і Privacy відкриваються
- [ ] «Стерти всі мої дані» працює
- [ ] Авіарежим: кожен екран пояснює, що сталося, нічого не зависає
- [ ] Текст дозволу камери англійською й українською (залежить від мови телефону)
- [ ] Сплеш, іконка, назва під іконкою — правильні

**Сторінка**
- [ ] Скріншоти відповідають реальному застосунку
- [ ] App Privacy заповнено за таблицею вище
- [ ] Privacy Policy URL і Support URL відкриваються
- [ ] Підписки прикріплені до версії
- [ ] Нотатки для рецензента вставлено, пошта вказана

**Вхід через Apple**
- [ ] App ID має capability **Sign in with Apple** (EAS вмикає її сам за
  `ios.usesAppleSignIn` в `app.json`; перевір у developer.apple.com → Identifiers)
- [ ] На сервері задано `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
  (ключ Sign in with Apple) — без них «Стерти всі мої дані» не зможе
  відкликати вхід, а Apple цього вимагає при видаленні акаунта
- [ ] TestFlight: вхід на двох iPhone з одним Apple ID, слова з'являються на
  обох (див. `TESTING.md`)

Вхід необов'язковий, і єдиний спосіб входу — Sign in with Apple, тож вимога
Guideline 4.8 виконана без інших кнопок. Видалення акаунта (Guideline
5.1.1(v)) — у застосунку: «Стерти всі мої дані» стирає й акаунт, і словник
на сервері та відкликає вхід через Apple.

---

## Скільки чекати

| Етап | Час |
|---|---|
| Перевірка Apple Developer Program | від кількох годин до 2 діб |
| Збірка EAS | 15–40 хв |
| Обробка в App Store Connect | 10–15 хв |
| **Рецензія Apple** | зазвичай 24–48 годин |

Перша подача часто повертається з зауваженням, це нормально. Для такого
застосунку найчастіше чіпляються до: підписок, не відправлених разом із
версією; Terms/Privacy, яких не видно в пейволі чи описі; скріншотів, що не
відповідають застосунку; «незрозуміло, як тестувати» (тому нотатки вище
важливі).

---

## Шпаргалка

```bash
npm run doctor          # перевірка залежностей
npm run build:preview   # збірка для своїх пристроїв (eas device:create)
npm run build:ios       # продакшн-збірка
npm run submit:ios      # відправити в App Store Connect
eas env:list production # які змінні піде в збірку
```
