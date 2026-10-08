# Реліз LinguaLens в App Store

Збірка й відправка йдуть через **EAS**: він збирає на своїх Mac, сам веде
сертифікати й профілі та завантажує білд в App Store Connect. Твій Mac
потрібен для симулятора, скріншотів і локальних перевірок.

> `npx expo run:ios --configuration Release --device` збирає релізну версію
> прямо на твій iPhone. Це корисно, щоб перевірити швидкість і поведінку без
> dev-меню, але в App Store вона **не потрапляє**. Для магазину — лише EAS.

Реєстрації, ключі й підписки (Apple Developer, App Store Connect, RevenueCat,
PostHog, сервер, змінні EAS) розписані по кроках у [`USER_TODO.md`](USER_TODO.md).
Ціни й правила Free/Pro — у [`MONETIZATION.md`](MONETIZATION.md), дати й
порядок запуску — у [`LAUNCH_PLAN.md`](LAUNCH_PLAN.md). Тут — збірка, сторінка
в App Store (ASO) для кожної мови, App Privacy, нотатки для рецензента й
перевірка перед подачею.

**Як читати позначки.** Усе, що спирається на документацію Apple, позначено
як факт. Те, що відомо лише зі спостережень ASO-сервісів чи з відео
розробника, позначено **«спостереження»**. Наші власні рішення —
**«наше припущення»**. Цифр популярності ключових слів тут немає: їх треба
подивитися в Astro чи AppSprint (крок 16 у `USER_TODO.md`), а не вигадувати.

**Перед вставкою тексту в App Store Connect.** У текстах для вставки лишено
підстановки: `<server>` / `<сервер>` (адреса сервера: те саме, що
`EXPO_PUBLIC_SERVER_URL`, `https://…`), `<ПІБ…>`,
`<телефон>`, `<пошта>`. Опис і ключові слова змінюються лише з новою версією,
тож адресу вписуй остаточну (Cloud Run чи свій домен, `USER_TODO.md`, крок 5)
ще до першої подачі. Вставив: пошукай у полі символ `<`, жодного лишитись не
має. Тексти для магазину пишемо без довгих тире (правило власника).

---

## Що коштує грошей

| | Ціна | Коментар |
|---|---|---|
| **Apple Developer Program** | **$99/рік** | єдина обов'язкова витрата |
| Комісія Apple | 15% | якщо вступиш в **App Store Small Business Program** (дохід до $1 млн/рік). Без заявки — 30%. Знижена ставка діє з 15-го дня після кінця фінансового місяця, у якому заявку схвалили, тож подавай одразу (крок 1.4 у `USER_TODO.md`) |
| EAS Build | є безкоштовний тариф | на free-плані черга довша (20–40 хв) |
| RevenueCat | $0 до $2 500 доходу на місяць | далі 1% від **усього** місячного доходу (за $2 600 — $26). Experiments входять у цей тариф |
| PostHog (аналітика) | $0 | щомісяця безкоштовно 1 млн подій і 1 млн запитів флагів; на безкоштовному тарифі збір просто зупиняється на ліміті, без рахунків |
| Apple Ads | $100 кредиту від Apple | одноразово для нового акаунта, лише коли застосунок уже в продажу; далі — твій бюджет (план у `LAUNCH_PLAN.md`, розділ 6.3) |
| Google Cloud Run + Firestore | ~$0 | безкоштовних лімітів вистачить надовго |
| Gemini API (платний тариф) | центи на сотню сканів | безкоштовний тариф не годиться для релізу, див. `DEPLOY.md` |
| Astro / AppSprint (ключові слова) | платні інструменти | ціни ми не перевіряли; вистачить одного, на пробний період |

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
- Продакшн-збірка **сама зупиниться** (`scripts/check-release-env.js`), якщо в
  оточенні `production` немає `EXPO_PUBLIC_REVENUECAT_IOS_KEY` або він не
  починається з `appl_` (тестовий `test_…` і секретний `sk_…` теж не
  пройдуть), а також якщо немає `EXPO_PUBLIC_SERVER_URL` або адреса не
  `https://`. RevenueCat прямо пише: застосунок із ключем Test Store в App
  Store подавати не можна. Немає `EXPO_PUBLIC_SUPPORT_EMAIL`: лише
  попередження в лозі, збірка йде, але в Параметрах не буде пункту «Contact
  support». Як розкласти ключі по оточеннях: `USER_TODO.md`, крок 7.
- Номер збірки EAS збільшує сам (`autoIncrement`). Версію для людей
  (`1.0.0`) міняй в `app.json` → `expo.version` перед кожним новим релізом.
- Через 10–15 хв після `submit` білд з'явиться в TestFlight. Постав його на
  телефон і пройди чеклист із [`TESTING.md`](TESTING.md). Покупки там
  тестові (sandbox), гроші не списуються.
- `npm run build:preview` — збірка для своїх пристроїв без TestFlight. iPhone
  спершу треба зареєструвати: `eas device:create`.

---

## Сторінка застосунку (ASO)

### Що Apple бере в пошук

Факти з документації Apple:
- У пошуку важать **назва, підзаголовок, поле ключових слів і основна
  категорія**, а ще поведінка людей: завантаження, оцінки, відгуки. Ім'я
  розробника теж шукається. Опис у пошук не йде (це кажуть і Appfigures, і
  ConsultMyApp).
- Ліміти: назва 2–30 символів, підзаголовок 30, ключові слова **100 байтів**
  (Apple: «up to 100 bytes»), промо-текст 170, опис 4000 символів, нотатки для
  рецензента **4000 байтів** («up to 4000 bytes»; довідка App Store Connect,
  звірено 7 жовтня 2026). У UTF-8 латинська літера це 1 байт, а кирилиця й
  «á» це 2.
- Ключові слова — через кому **без пробілів**, кожне довше за 2 символи. Без
  множини слів, які вже є (climb і climbs — повтор), без «app», без чужих
  брендів, без слів із назви, підзаголовка й категорії (Education, Reference —
  вони вже враховані).
- **Назву, ключові слова й «What's New» можна змінити лише з новою версією.**
  Промо-текст міняється будь-коли без рецензії — ним і крутимо події та акції.
- Ціни, «free» й подібне в назві, підзаголовку й на скріншотах заборонені
  (правило 2.3.7), так само чужі назви застосунків.

Спостереження ASO-сервісів (Apple цього не описує):
- Слова з назви, підзаголовка й ключових **однієї локалі** складаються у
  фрази: «Vocabulary» з назви + «spanish» з ключових дає «spanish
  vocabulary». Між різними локалями слова **не** складаються, тому фраза має
  жити цілком в одній локалі, а повторювати слово в різних локалях можна.
- Кожен стор індексує кілька мов. За таблицею Apple: **США** показують
  English (U.S.) і ще арабську, китайську (спрощену й традиційну),
  французьку, корейську, португальську (Бразилія), російську, іспанську
  (Мексика) й в'єтнамську. **Україна** — English (U.K.), російську й
  українську. Польща — English (U.K.) і польську. Німеччина — німецьку й
  English (U.K.). Що всі ці мови йдуть у пошук того стору («US matrix»),
  перевірили AppTweak і Phiture на вигаданих словах; Apple цього не
  підтверджує.
- **Український стор показує English (U.K.), а не U.S.** — це видно за
  таблицею Apple і на живих сторінках: у Duolingo й Monkey Taps у США та в
  Україні різні англійські назви й підзаголовки. Без локалі en-GB у Україні,
  Польщі й Німеччині показується наша основна en-US. Щойно додамо en-GB, вона
  замінить en-US у всіх цих сторах.
- Чи читає Apple підписи на скріншотах — **суперечливо**: Appfigures після
  оновлення алгоритму в червні 2025 каже «так», ConsultMyApp перевірив 64
  фрази й не знайшов підтвердження. Тому підписи робимо з ключовими словами,
  але вважаємо їх передусім інструментом конверсії, а не полем для ключів.
- Як Apple зіставляє українські відмінки (слово / слова / слів), ніде не
  описано. Тому в полі ключових пишемо початкову форму, а одну основу двічі
  не ставимо (наше припущення, як і правило про однину).

### Яка локаль для чого

| Локаль | Де індексується | Що кладемо | Чому |
|---|---|---|---|
| **English (U.S.)** — основна | США | англійські ключі для американців, які вчать іспанську й інші мови, та для ESL | головний англомовний ринок; її читає рецензент |
| **Українська** | Україна | українські ключі | наш ринок №1, ніша тонка: лідери «англійських слів» мають 1,5–3,2 тис. оцінок проти десятків і сотень тисяч у США |
| **English (U.K.)** | Україна, Польща, Німеччина й інші стори з en-GB за замовчуванням | другий англійський набір: англійська для українців і європейців, «learn ukrainian» для тих, хто вчить українську | без неї в Україні працювала б американська сторінка; українців у Польщі й Німеччині українські ключі не знайдуть — там індексуються лише місцева мова й en-GB |
| **Español (México)** | США, Мексика, Латинська Америка | справжня іспанська: «vocabulario inglés», «aprender» | іспаномовні в США, які вчать англійську; інтерфейс іспанською в нас уже є. Іспанія (es-ES) у США не індексується |
| **French** | США (і Франція) | англійські ключі — «банк» для США | так робить розробник із відео («US matrix»); людям із французькою мовою iPhone і так показався б англійський текст |
| **Korean** | США (в Україні не індексується) | англійські ключі — другий «банк» для США: тексти колишнього варіанта А з російської локалі, див. нижче | людям із корейською мовою iPhone і так показався б англійський текст |
| Russian | США й Україна | **не використовуємо** (рішення 4 жовтня 2026) | ні російських слів, ні англійського «банку»: український стор заповнюють uk і en-GB |
| арабська, китайські, португальська (Бразилія), в'єтнамська | США | на старті не чіпаємо | розробник із відео радить почати з 2–3 локалей і додавати за даними |
| Deutsch | Німеччина | пізніше, коли буде німецький трафік | інтерфейс німецькою вже є |

Підсумок (рішення 4 жовтня 2026): **6 локалей на старті — en-US, uk, en-GB,
es-MX, fr (банк) і ko (банк)**. Український стор = українська + English
(U.K.). 4 локалі зі своїми скріншотами (en-US, uk, en-GB, es-MX); «банки»
(fr, ko) беруть скріншоти основної мови. Кожній доданій локалі потрібен опис
— для «банків» це текст en-US.

### Перевірка лімітів

Усі тексти нижче прогнані скриптом (scratchpad, 4 жовтня 2026): довжина,
кома без пробілів, слова ≥ 3 символів, жодне слово (з урахуванням множини й
українських закінчень) не повторюється в назві, підзаголовку й ключових
однієї локалі, немає «app/free/best», брендів і назв категорій, кожен підпис
скріншота містить слово з цієї локалі. Для корейського «банку» ще й строго:
жодне його ключове слово не повторює слів із назви, підзаголовка й ключових
en-US, es-MX і fr. Байти ключових і довжини описів, зокрема нового повного
опису en-GB, перераховано ще раз 7 жовтня 2026. Результат:

| Локаль | Назва | Підзаголовок | Ключові (символи / байти UTF-8; ліміт 100 B) | Розширений варіант | Промо | Підписів |
|---|---|---|---|---|---|---|
| en-US | 28/30 | 25/30 | 96 / 96 B | — | 163/170 | 8 |
| uk | 28/30 | 28/30 | 51 / 95 B | 94 симв. / 176 B, лише якщо ASC пустить | 146/170 | 8 |
| en-GB | 30/30 | 23/30 | 95 / 95 B | — | 163/170 | 8 |
| es-MX | 30/30 | 26/30 | 93 / 96 B | — | 157/170 | 8 |
| fr-FR (банк) | 30/30 | 29/30 | 94 / 94 B | — | — | 0 |
| ko (банк) | 25/30 | 30/30 | 95 / 95 B | — | — | 0 |

**Українські ключові: байти, а не символи.** Довідка Apple (звірено 7 жовтня
2026) пише «up to 100 bytes». Кирилиця в UTF-8 займає 2 байти на літеру, тож
колишній основний список (94 символи) важить **176 байтів** і за буквою
довідки не влізе. Тому основним тепер список на 95 байтів (51 символ), а
розширений лишається як спроба: агенція локалізації ще у 2013 писала, що Apple
рахує символи для всіх мов, але це не підтверджено. **Перевір зараз** (запису
застосунку в ASC досить, подавати нічого не треба): встав розширений список у
локаль uk. Якщо лічильник червоний чи ASC не зберігає, лишай короткий. Рішення
до 20 жовтня, бо ключові слова далі міняються лише з новою версією. Байти
рахує `node -e "console.log(Buffer.byteLength(process.argv[1]))" 'слова,через,коми'`.

Кожне ключове слово нижче — **«перевірити в Astro/AppSprint: складність
< 50, популярність > 20»** (поріг із відео; в одному з них — до 55). Ми не
знаємо цих чисел і не вигадуємо їх. Що робити зі словами, які не пройдуть, —
розділ «Перевірка ключових слів» нижче.

Головне ключове слово стоїть на початку назви (порада з відео: найсильніші
слова — на початку назви, далі підзаголовок, далі поле ключових). Бренд
LinguaLens лишається в кінці кожної назви: на екрані iPhone застосунок
зветься саме так, а правило 2.3.8 просить, щоб назва в сторі не плутала.

---

### English (U.S.) — основна мова

**Name** (28): `Photo Vocabulary: LinguaLens`

**Subtitle** (25): `Snap Objects, Learn Words`

**Keywords** (96):
```
picture,dictionary,flashcard,spanish,french,german,italian,english,esl,builder,camera,day,widget
```

Які фрази це складає: photo vocabulary, picture dictionary, spanish
vocabulary / words, learn spanish words, vocabulary builder, flashcard,
word of the day, word widget, esl vocabulary, camera vocabulary.
**Свідомо без translator / translate:** разом із «photo» вони дали б «photo
translator», а такі люди шукають переклад тексту з фото — ми цього не
робимо, і це дорога до одиничок (порада з відео: тільки ключі, на які
застосунок справді відповідає). Загальні «learn english», «language» і
«dictionary» сам по собі — територія Duolingo, Google Translate й Monkey
Taps; «dictionary» тут лише заради «picture dictionary».

**Promotional text** (163):
```
Point your camera at a mug, a plant or your bike and get the word in Spanish, French or 27 other languages, cut out as a sticker. Plus a daily word for your level.
```
Варіант на тиждень події (165):
```
Label Your Kitchen Challenge: scan your kitchen in one shot, get a word sticker for every object and learn them all in a week. Plus a word of the day for your level.
```

**Description:**
```
Point. Snap. Learn.

LinguaLens turns the world around you into vocabulary. Point your camera at a cup, a plant or your bike and get its name in the language you're learning, with pronunciation, IPA, translation and an example sentence that fits your level.

YOUR WORDS, AS STICKERS
Every object you scan is cut out along its outline with a white sticker border. Your dictionary becomes a collection of real things from your life, much easier to remember than a list.

A WHOLE ROOM IN ONE SHOT
Scan a room and every object gets its own label and sticker. Share the scene to Stories.

MADE FOR YOUR LEVEL AND YOUR WORK
Tell LinguaLens your goals, your field and your level, from A1 to C2. Your word of the day follows your plan: vocabulary for your field, workplace words, everyday words, and no beginner words if you're already advanced. Tap "I know it" and a new word takes its place.

REMEMBER WHAT YOU SCAN
• Flashcards with spaced repetition bring words back right before you forget them
• A quick 10-question quiz; missed words return for review
• A word of the day with a reminder at the hour you choose
• Three free widgets for the Home Screen and the Lock Screen: the word of the day with an example sentence (tap to reveal the translation right in the widget), your own words with the photos you took, and your streak
• Streaks, levels and 29 achievements

SHARE THE BEST FINDS
Every word you scan becomes a sticker with no background: put it on your own photo in Instagram Stories, paste it into a chat or save it to Photos. A word, a whole scene or an achievement, or a clean 9:16 card if you prefer.

29 LANGUAGES
English, Spanish, German, French, Italian, Portuguese, Polish, Ukrainian, Japanese, Korean, Chinese and more. Nouns come with their article where it matters (die Tasse, la taza).

NO ACCOUNT NEEDED
Open the app and start scanning. Your words and progress stay on your phone. Want a backup? Sign in with Apple to keep your words in sync on all your iPhones. We never ask for your name or email. Photos are used only to recognize the object and are not stored on our servers. Anonymous usage statistics can be turned off in Settings.

FREE AND PRO
Free forever: your dictionary with no word limit, flashcards, quiz, one word of the day and all three widgets. Plus one free AI scan to try (one in total, not per day): an object or a whole room.
LinguaLens Pro: unlimited AI scans and room scans, all 29 languages, up to 5 words of the day at times you choose, and four color themes for the app and widgets (Ocean, Berry, Graphite, Cocoa). Choose monthly or yearly (the yearly plan may start with a free trial for eligible new subscribers), or Lifetime: a one-time purchase, not a subscription.
Payment is charged to your Apple ID at confirmation of purchase. Subscriptions renew automatically unless canceled at least 24 hours before the end of the current period. Manage or cancel in your Apple ID settings.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://<server>/privacy
```

**Підписи скріншотів** (8 кадрів: заголовок угорі кадру, під ним підрядок;
наліпки зі словами іспанською Латинської Америки, яку застосунок дає в США
за замовчуванням: прапорець 🇲🇽, голос es-MX, сесео й мексиканські слова:
*la taza /la ˈtasa/*, *los audífonos*, *los lentes*).
Тексти лежать у `tools/store-shots/copy.js`, кадри рендерить
`tools/store-shots` (розділ «Скріншоти» нижче):

| # | На кадрі | Заголовок | Підрядок |
|---|---|---|---|
| 1 | Сканер від прицілу до кнопки знімка: червона чашка в прицілі, з неї наліпка й табличка *la taza* з IPA, кнопкою «Слухати» й перекладом | Snap it, learn it in Spanish | With pronunciation and an example sentence |
| 2 | Словник від перемикача «List / Collection»: колекція наліпок, дві виходять із сітки | Your picture dictionary | Words from your own life, in 29 languages |
| 3 | Та сама чашка на картці: лице *la taza* з IPA великим планом, за ним зворот із наліпкою й перекладом; унизу квіз «7 / 10» із зеленою відповіддю | Flashcards that stick | Spaced repetition brings words back on time |
| 4 | Сцена кухні: кожен предмет наліпкою з підписом | Label your whole room · **PRO** | One shot, every object named in Spanish |
| 5 | Рівень 8/10 · B2+ і слово дня з теми Tech | Spanish words for your level | A1 to C2, no basics once you’re advanced |
| 6 | Віджети: Lock Screen і Home Screen (слово дня, серія, «My words») з іконкою | Word of the Day widget | On your Home Screen and Lock Screen |
| 7 | Профіль у темній темі: серія 12 днів (тиждень з неділі, як на iPhone у США) і перші досягнення | Build a daily word habit | Streaks, levels, and 29 achievements |
| 8 | Картка сцени, наліпка чашки без тла й картка тижня | Share your best finds | Stickers and cards for Stories and chats |

---

### Українська

**Назва** (28): `Англійські слова: LinguaLens`

**Підзаголовок** (28): `Фотословник, картки й вимова`

**Ключові слова** (51 символ, **95 байтів**, влазить у ліміт Apple «100 bytes»):
```
вчити,вивчення,лексика,запас,дня,віджет,камера,мова
```
**Розширений варіант** (94 символи, але **176 байтів**): став **лише якщо**
лічильник ASC у локалі uk його приймає. Додає «словниковий», «наліпка»,
«тренажер», «німецька», «квіз»:
```
вчити,вивчення,лексика,словниковий,запас,дня,віджет,камера,наліпка,тренажер,мова,німецька,квіз
```

Що це складає (короткий): англійські слова, вчити англійські слова, вивчення
англійської, словник, фотословник, картки, лексика, слова дня, віджет,
вимова. Лише розширений додає «словниковий запас», «тренажер слів», «німецька
мова». Склад короткого можна міняти після перевірки в Astro/AppSprint (розділ
«Перевірка ключових слів»), але тримай 100 байтів: літера кирилиці 2 B, кома 1 B.
**Свідомо без:** «англійська» (та сама основа, що в назві «англійські»: за
правилом Apple множина — повтор), «слово» (повтор «слова»), «словник» і
«картки» (вже в підзаголовку), «перекладач» і «переклад» (з «фото» вийде
«перекладач фото» — це про переклад тексту на фото, не про нас; до того ж
«перекладач» тримає Google). Загальні «англійська мова» й «вивчення
англійської» тримають Duolingo й Promova — туди не цілимось. Якщо Apple
зіставляє «англійські» з «англійська» (не описано), із «мова» й «вивчення»
ці фрази в нас теж складуться.

**Промо-текст** (146):
```
Наведи камеру на чашку, вазон чи велосипед і отримай англійське слово-наліпку з вимовою. А щодня нове слово під твій рівень і сферу, від A1 до C2.
```
Варіант на тиждень події (145):
```
Челендж «Підпиши кухню»: скануй кухню одним кадром. Кожен предмет стане словом-наліпкою, а за тиждень вивчиш їх усі. І слово дня під твій рівень.
```

**Опис:**
```
Наведи. Зніми. Запам'ятай.

LinguaLens перетворює світ навколо тебе на словник. Наведи камеру на чашку, вазон чи велосипед і отримай назву мовою, яку вчиш: з вимовою, транскрипцією, перекладом і прикладом під твій рівень.

СЛОВА-НАЛІПКИ
Кожен предмет вирізається по контуру з білою облямівкою, як справжня наліпка. Словник стає колекцією речей з твого життя, а такі слова запам'ятовуються набагато легше за список.

ЦІЛА КІМНАТА ОДНИМ КАДРОМ
Скануй кімнату, і кожен предмет отримає свій підпис і наліпку. Готову сцену можна поширити в Stories.

ПІД ТВІЙ РІВЕНЬ І ТВОЮ РОБОТУ
Розкажи LinguaLens про свої цілі, сферу й рівень (від A1 до C2). Слово дня йде за твоїм планом: лексика твоєї сфери, робочі слова й повсякденні, а якщо рівень уже високий, жодних базових слів. Натисни «Знаю», і з'явиться інше слово.

ЩОБ НЕ ЗАБУТИ
• Флешкартки з інтервальним повторенням повертають слово саме тоді, коли воно почне забуватись
• Квіз на 10 питань; помилки повертаються в повторення
• Слово дня з нагадуванням о зручній годині
• Три безкоштовні віджети для головного екрана й екрана блокування: слово дня з реченням (переклад відкривається дотиком просто у віджеті), твої слова з фото, які ти зняв сам, і серія
• Серія днів, рівні й 29 досягнень

ДІЛИСЯ НАЙКРАЩИМ
Кожне відскановане слово стає наліпкою без тла: поклади її на своє фото в Instagram Stories, встав у чат чи збережи у «Фото». Слово, ціла сцена чи досягнення або охайна картка 9:16, якщо так зручніше.

29 МОВ
Англійська, іспанська, німецька, французька, італійська, португальська, польська, японська, корейська, китайська та інші. Іменники мають артикль там, де він важливий (die Tasse, la taza).

БЕЗ РЕЄСТРАЦІЇ
Відкрив і скануєш. Слова й прогрес зберігаються на телефоні. Хочеш резервну копію? Увійди через Apple, і словник буде однаковий на всіх твоїх iPhone. Імені й пошти ми не просимо. Фото потрібне лише для розпізнавання і не зберігається на наших серверах. Анонімну статистику можна вимкнути в параметрах.

БЕЗКОШТОВНО І PRO
Назавжди безкоштовно: словник без ліміту слів, флешкартки, квіз, слово дня й усі три віджети. А ще один безкоштовний AI-скан на пробу (один загалом, а не щодня): предмет або ціла кімната.
LinguaLens Pro: AI-скани й скани кімнат без ліміту, усі 29 мов, до 5 слів дня о годинах, які обереш, і чотири кольорові теми для застосунку й віджетів (Океан, Ягода, Графіт, Какао). Обери місяць чи рік (річний може починатися з безкоштовного пробного періоду для нових підписників) або «Назавжди»: один платіж, не підписка.
Оплата списується з Apple ID після підтвердження покупки. Підписка продовжується автоматично, якщо не скасувати її щонайменше за 24 години до кінця поточного періоду. Керувати підпискою й скасувати її можна в налаштуваннях Apple ID.

Умови використання: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Політика приватності: https://<сервер>/privacy
```

**Підписи скріншотів** (8 кадрів, наліпки з англійськими словами США 🇺🇸 й
американською вимовою, як голос en-US застосунку: *mug /mʌɡ/*; тексти
лежать у `tools/store-shots/copy.js`):

| # | На кадрі | Заголовок | Підрядок |
|---|---|---|---|
| 1 | Сканер від прицілу до кнопки знімка: червона чашка в прицілі, з неї наліпка й табличка *mug* з IPA, кнопкою «Слухати» й перекладом | Фотографуй і вчи англійську | Річ стає наліпкою з вимовою й прикладом |
| 2 | Словник від перемикача «Список / Колекція»: колекція наліпок, дві виходять із сітки | Твій фотословник | Слова з твого життя, 29 мов на вибір |
| 3 | Та сама чашка на картці: лице *mug /mʌɡ/* великим планом, за ним зворот із наліпкою й перекладом; унизу квіз «7 / 10» із зеленою відповіддю | Картки, що не дають забути | Повторення повертає слово саме вчасно |
| 4 | Сцена кухні: кожен предмет наліпкою з підписом | Ціла кімната за один кадр · **PRO** | Кожен предмет отримає англійську назву |
| 5 | Рівень 8/10 · B2+ і слово дня з теми ІТ | Англійська під твій рівень | Від A1 до C2, без базових слів для B2+ |
| 6 | Віджети: Замкнений і Початковий екран (слово дня, серія, «Мої слова») з іконкою | Віджет «Слово дня» | На Початковому й Замкненому екрані |
| 7 | Профіль у темній темі: серія 12 днів і перші досягнення | Не переривай серію | Рівні та 29 досягнень за твої успіхи |
| 8 | Картка сцени, наліпка чашки без тла й картка тижня | Поділись знахідками | Наліпки й картки для Stories і чатів |

«Початковий екран» і «Замкнений екран»: так ці екрани зве українська iOS.

---

### English (U.K.) — для України, Польщі, Німеччини

**Name** (30): `English Vocabulary: LinguaLens`

**Subtitle** (23): `Learn Words From Photos`

**Keywords** (95):
```
picture,dictionary,flashcard,ukrainian,polish,german,spanish,camera,scan,day,widget,esl,builder
```

Фрази: english vocabulary, learn english words, english words from photos,
learn ukrainian / polish / german, picture dictionary, word of the day,
vocabulary builder. «ukrainian» тут подвійно корисний: «ukrainian english»
для наших у сторах з en-GB і «learn ukrainian» для тих, хто вчить
українську (вона є серед 29 мов).

**Promotional text** (163):
```
Point your camera at a mug, a plant or your bike and get the word in English, German or 27 other languages, cut out as a sticker. Plus a daily word for your level.
```

**Description** (3055 символів з 4000; ті самі слова, що в en-US, але з
британським написанням: recognise, colour, cancelled; вставляй без правок):
```
Point. Snap. Learn.

LinguaLens turns the world around you into vocabulary. Point your camera at a cup, a plant or your bike and get its name in the language you're learning, with pronunciation, IPA, translation and an example sentence that fits your level.

YOUR WORDS, AS STICKERS
Every object you scan is cut out along its outline with a white sticker border. Your dictionary becomes a collection of real things from your life, much easier to remember than a list.

A WHOLE ROOM IN ONE SHOT
Scan a room and every object gets its own label and sticker. Share the scene to Stories.

MADE FOR YOUR LEVEL AND YOUR WORK
Tell LinguaLens your goals, your field and your level, from A1 to C2. Your word of the day follows your plan: vocabulary for your field, workplace words, everyday words, and no beginner words if you're already advanced. Tap "I know it" and a new word takes its place.

REMEMBER WHAT YOU SCAN
• Flashcards with spaced repetition bring words back right before you forget them
• A quick 10-question quiz; missed words return for review
• A word of the day with a reminder at the hour you choose
• Three free widgets for the Home Screen and the Lock Screen: the word of the day with an example sentence (tap to reveal the translation right in the widget), your own words with the photos you took, and your streak
• Streaks, levels and 29 achievements

SHARE THE BEST FINDS
Every word you scan becomes a sticker with no background: put it on your own photo in Instagram Stories, paste it into a chat or save it to Photos. A word, a whole scene or an achievement, or a clean 9:16 card if you prefer.

29 LANGUAGES
English, Spanish, German, French, Italian, Portuguese, Polish, Ukrainian, Japanese, Korean, Chinese and more. Nouns come with their article where it matters (die Tasse, la taza).

NO ACCOUNT NEEDED
Open the app and start scanning. Your words and progress stay on your phone. Want a backup? Sign in with Apple to keep your words in sync on all your iPhones. We never ask for your name or email. Photos are used only to recognise the object and are not stored on our servers. Anonymous usage statistics can be turned off in Settings.

FREE AND PRO
Free forever: your dictionary with no word limit, flashcards, quiz, one word of the day and all three widgets. Plus one free AI scan to try (one in total, not per day): an object or a whole room.
LinguaLens Pro: unlimited AI scans and room scans, all 29 languages, up to 5 words of the day at times you choose, and four colour themes for the app and widgets (Ocean, Berry, Graphite, Cocoa). Choose monthly or yearly (the yearly plan may start with a free trial for eligible new subscribers), or Lifetime: a one-time purchase, not a subscription.
Payment is charged to your Apple ID at confirmation of purchase. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your Apple ID settings.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://<server>/privacy
```

**Підписи скріншотів** (кадри ті самі, що в en-US, але на наліпках англійські
слова з перекладом українською, як бачить українець з англійським
телефоном, що вчить англійську Британії 🇬🇧 (її обирають у списку мов, за
замовчуванням і в Британії американська): британські слова *trainer*,
*rucksack*, *chopping board*, *tea towel* і вимова RP */ˈhaʊsplɑːnt/*;
дати на кадрах 6 і 8 у британському порядку: «Tuesday 6 October», «6 Oct
2026»):

| # | Заголовок | Підрядок |
|---|---|---|
| 1 | Snap it, learn it in English | With pronunciation and an example sentence |
| 2 | Your picture dictionary | Words from your own life, in 29 languages |
| 3 | Flashcards that stick | Spaced repetition brings words back on time |
| 4 | Label your whole room · **PRO** | One shot, every object named in English |
| 5 | English words for your level | A1 to C2, no basics once you’re advanced |
| 6 | Word of the Day widget | On your Home Screen and Lock Screen |
| 7 | Build a daily word habit | Streaks, levels and 29 achievements |
| 8 | Share your best finds | Stickers and cards for Stories and chats |

---

### Español (México) — іспаномовні в США

**Nombre** (30): `Vocabulario inglés: LinguaLens`

**Subtítulo** (26): `Aprende palabras con fotos`

**Palabras clave** (93):
```
aprender,diccionario,tarjeta,flashcard,cámara,objeto,escanear,día,widget,idioma,pronunciación
```

Фрази: vocabulario inglés, aprender inglés, palabras en inglés, palabra del
día, diccionario con fotos, tarjetas. «traductor» свідомо немає — з «fotos»
вийшов би «traductor de fotos», а це переклад тексту з фото.

**Texto promocional** (157):
```
Apunta la cámara a una taza, una planta o tu bici y aprende cómo se dice en inglés, con pronunciación y ejemplo. Y cada día, una palabra nueva para tu nivel.
```

**Descripción:**
```
Apunta. Toma la foto. Aprende.

LinguaLens convierte lo que te rodea en vocabulario. Apunta la cámara a una taza, una planta o tu bici y obtén su nombre en el idioma que estudias, con pronunciación, transcripción, traducción y un ejemplo adaptado a tu nivel.

TUS PALABRAS, COMO STICKERS
Cada objeto que escaneas se recorta por su contorno con un borde blanco. Tu diccionario se convierte en una colección de cosas reales de tu vida, mucho más fácil de recordar que una lista.

UN CUARTO ENTERO EN UNA FOTO
Escanea una habitación y cada objeto recibe su etiqueta y su sticker.

A TU NIVEL
Cuéntale a LinguaLens tus metas, tu área y tu nivel, de A1 a C2. Tu palabra del día sigue tu plan, y si ya tienes un nivel alto, no verás palabras de principiante.

PARA NO OLVIDAR
• Tarjetas con repetición espaciada que vuelven justo antes de que olvides
• Un quiz rápido de 10 preguntas
• La palabra del día con recordatorio
• Tres widgets gratis: la palabra del día con una frase de ejemplo (toca para ver la traducción en el propio widget), tus palabras con tus fotos y tu racha, en la pantalla de inicio y en la bloqueada
• Rachas, niveles y 29 logros

COMPARTE LO QUE DESCUBRES
Cada palabra que escaneas se convierte en una pegatina sin fondo: ponla sobre tu propia foto en Instagram Stories, pégala en un chat o guárdala en Fotos. Una palabra, una escena entera o un logro, o una tarjeta 9:16 si lo prefieres.

29 IDIOMAS
Inglés, español, alemán, francés, italiano, portugués, polaco, ucraniano, japonés, coreano, chino y más.

SIN CUENTA
Abre la app y empieza a escanear. Tus palabras se quedan en tu teléfono. Si quieres una copia de seguridad, inicia sesión con Apple: nunca pedimos tu nombre ni tu correo. Las fotos solo se usan para reconocer el objeto y no se guardan en nuestros servidores. Las estadísticas anónimas se pueden desactivar en Ajustes.

GRATIS Y PRO
Gratis para siempre: tu diccionario sin límite de palabras, tarjetas, quiz, una palabra del día y los tres widgets. Además, 1 escaneo con IA gratis para probar (uno en total, no al día): un objeto o un cuarto entero.
LinguaLens Pro: escaneos con IA y de cuartos ilimitados, los 29 idiomas, hasta 5 palabras del día a las horas que elijas y cuatro temas de color para la app y los widgets (Océano, Baya, Grafito, Cacao). Elige plan mensual o anual (el anual puede empezar con una prueba gratuita para nuevos suscriptores elegibles) o Lifetime: un pago único, no una suscripción.
El pago se carga a tu Apple ID al confirmar la compra. La suscripción se renueva automáticamente salvo que la canceles al menos 24 horas antes del final del periodo actual. Puedes gestionarla o cancelarla en los ajustes de tu Apple ID.

Términos de uso: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Política de privacidad: https://<server>/privacy
```

**Підписи скріншотів** (наліпки з англійськими словами США 🇺🇸 й американською
вимовою, переклади мексиканською іспанською, інтерфейс іспанською; тиждень
на кадрі 7 з неділі, як на iPhone у Мексиці й США):

| # | Заголовок | Підрядок |
|---|---|---|
| 1 | Tómale foto y aprende inglés | Con pronunciación y un ejemplo de uso |
| 2 | Tu diccionario de fotos | Palabras de tu vida, en 29 idiomas |
| 3 | Tarjetas para no olvidar | Repasa cada palabra justo antes de olvidarla |
| 4 | Etiqueta todo con una foto · **PRO** | Cada objeto, con su nombre en inglés |
| 5 | Inglés para tu nivel | De A1 a C2, sin lo básico si ya avanzaste |
| 6 | Widget de la palabra del día | En la pantalla de inicio y en la bloqueada |
| 7 | No rompas tu racha | Niveles y 29 logros por tu constancia |
| 8 | Comparte lo que descubres | Stickers y tarjetas para Stories y chats |

«Etiqueta todo» замість «Tu cuarto entero»: у Мексиці «cuarto» означає
спальню, а на кадрі кухня; і підписує застосунок, а не людина («Nombra
todo» звучало як вправа на слова). «Pantalla bloqueada» так зве цей екран
iOS іспанською; «pantalla de bloqueo» каже Android, тож друге «pantalla»
просто опущене: «y en la bloqueada». «Comparte lo que descubres» замість
«hallazgos»: «hallazgo» для мексиканця газетне слово.

Якщо іспанські скріншоти зняти не встигаєш, App Store покаже англійські
(en-US). Підписи можна додати першим оновленням.

---

### Korean — «банк» для США (вирішено 4 жовтня 2026)

**Російської локалі немає взагалі** — ні з російськими словами, ні як
англійського «банку». Український стор показує English (U.K.), російську й
українську; ми заповнюємо українську й English (U.K.). Тексти, які раніше
готували для російської як «варіант А» (англійською, без жодного
російського слова), ідуть у **корейську** (Korean): за таблицею Apple вона
індексується в США, але не в Україні. Людям із корейською мовою iPhone і так
показалася б англійська сторінка. Опис — текст en-US, скріншоти — основні.

Сам застосунок російською говорить (жовтень 2026): телефон російською —
інтерфейс, запити камери й фото та назви віджетів російською. Сторінки
магазину це не стосується: її російською немає й не буде, а в рядку «Мови»
на сторінці App Store російська з'явиться сама, з локалізацій збірки.

- **Name** (25): `English Words: LinguaLens`
- **Subtitle** (30): `Visual Dictionary & Daily Quiz`
- **Keywords** (95):
  ```
  ukrainian,polish,portuguese,vocab,study,practice,lesson,sticker,scan,spaced,repetition,memorize
  ```
  Фрази: english words, ukrainian / polish / portuguese words, study
  ukrainian, english vocab, visual dictionary, daily english quiz, english
  sticker, scan words, spaced repetition, memorize english words.

Що змінилось проти варіанта А: назва й підзаголовок ті самі, а з ключових
прибрано **esl, flashcard, builder і learn**. Раніше ця локаль працювала і в
Україні, тепер — лише в США, а там ці слова вже є в en-US чи fr. На їхнє місце
— **spaced, repetition, memorize**, яких немає в жодній іншій американській
локалі. Ціна заміни: у корейській більше не складаються «learn ukrainian» і
«vocab builder» (у США лишаються «study ukrainian» тут і «vocabulary builder»
в en-US; «learn ukrainian» є в en-GB, але en-GB у США не індексується).
Повтори в назві й підзаголовку (english, words, dictionary, quiz) — свідомі:
це основа фраз саме цієї локалі.

Варіант зі справжніми російськими ключами («Б») знято разом із російською
локаллю.

### French — «банк» для США

Тексти англійською, опис — en-US, скріншоти — основні.

- **Name** (30): `Picture Dictionary: LinguaLens`
- **Subtitle** (29): `Spanish Vocabulary Flashcards`
- **Keywords** (94):
  ```
  japanese,korean,chinese,french,italian,german,english,learn,word,day,widget,quiz,object,camera
  ```
  Що додає до en-US: picture dictionary з вагою назви, spanish vocabulary
  flashcards, learn japanese / korean / chinese words, japanese / korean /
  chinese word of the day.

Повтор слів між en-US і французьким «банком» — свідомий: фраза складається
лише в межах однієї локалі, тому «picture dictionary» в назві французької
локалі — це сильніша позиція для тієї ж фрази, ніж два слова в полі ключових
en-US (спостереження розробника з відео, Apple цього не описує). У полі
ключових корейського «банку» повторів з en-US, es-MX і fr немає (див. вище).

### Перевірка ключових слів (до подачі)

1. В Astro або AppSprint ASO додай застосунок (до релізу — тимчасовий
   запис, так робить розробник з відео), обери стор **United States**, потім
   **Ukraine**.
2. Додай кожне ключове слово й кожну фразу з таблиць вище. Для кожного
   запиши популярність і складність.
3. Правило з відео: **складність < 50, популярність > 20.** Слово, яке не
   проходить, заміни іншим (кандидати нижче) і прожени перевірку повторів
   ще раз — попроси мене, скрипт уже є.
4. Перевір і назви. Якщо «photo vocabulary» мертва (популярність ≤ 20),
   перша кандидатура на назву en-US — `Picture Dictionary: LinguaLens`, а
   «photo» тоді йде в підзаголовок.

Кандидати на заміну (з досліджень, теж неперевірені):
- en: visual dictionary, object, scan word, word sticker, esl vocabulary,
  japanese, korean, chinese (vocab, practice, spaced, repetition уже стоять у
  корейському «банку»);
- uk: повторення, флешкартка, початківець, польська, іспанська, навчання;
- es-MX: palabras en inglés, vocabulario, practicar, tarjetas de memoria.

Після релізу ключі можна змінювати лише з новою версією, тож збирай зміни
до кожного оновлення (розділ «Щотижневий ASO-ритм» у `LAUNCH_PLAN.md`).

---

### What's New

Для першої версії (1.0.0) App Store Connect цього поля не показує, і писати
нічого не треба. Текст знадобиться для першого оновлення. Правило 2.3.12:
значні зміни треба описати конкретно, загальне «виправлення помилок» лише для
дрібниць. Чернетку «v1.3» (наліпки, віджети, сканер, серія, теми) прибрано:
усе це вже є в 1.0.0, тож у «What's New» воно не нове й вводило б в оману.
Пиши лише про те, що справді з'явилось після 1.0.0, тими самими мовами, що
сторінка (en, uk і es, якщо додаси), без довгих тире.

### Покупки на сторінці (Promoted In-App Purchases)

Покупки можуть з'являтися в пошуку й на сторінці застосунку (до 20 одночасно).
Apple радить писати тривалість у назві підписки. Ліміти: назва 30, опис 45.

| Продукт | Назва en | Опис en | Назва uk | Опис uk |
|---|---|---|---|---|
| Місяць | LinguaLens Pro (1 Month) (24) | Unlimited scans, 29 languages, color themes (43) | LinguaLens Pro (1 місяць) (25) | Безлімітні скани, 29 мов, кольорові теми (40) |
| Рік | LinguaLens Pro (1 Year) (23) | Unlimited scans, 5 words a day, color themes (44) | LinguaLens Pro (1 рік) (22) | Скани без ліміту, 5 слів на день, теми (38) |
| Назавжди | LinguaLens Pro (Lifetime) (25) | Pay once: unlimited scans and color themes (42) | LinguaLens Pro назавжди (23) | Один платіж: скани без ліміту й теми (36) |

Ті самі назви й описи вводь і як Display Name та Description покупок в ASC
(ліміти ті самі); групу підписок і локалі покупок розписано в розділі «Поля
App Store Connect». Описи згадують кольорові теми й слова дня, як у таблиці.

### In-App Event на запуск

Подія для ще не схваленого застосунку йде **в тій самій подачі, що й перша
версія** (вимога Apple). Подія триває до 31 дня, анонсувати можна до 14 днів
наперед, показується лише після схвалення. Бейдж — **Challenge**. Дати:
**27 жовтня — 2 листопада 2026** (тиждень запуску; він накриває 1 листопада,
коли, за даними нашого раннього дослідження, закінчується безкоштовний
Premium у Promova для українців).

**Челендж переписано під безкоштовний скан на все життя.** Старий формат
«по одному предмету щодня» спирався на 1 скан на день і більше не чесний.
Новий: **кухня одним кадром** (скан сцени підписує кожен предмет) **і
тиждень, щоб вивчити ці слова** картками й квізом. Картки, квіз і слово дня
безкоштовні без меж. Сам скан кухні безкоштовний лише тому, хто ще не
витратив свій єдиний скан (наприклад, пропустив скан в онбордингу); решті він
потрібен у Pro, і пробний тиждень на річному якраз накриває тиждень події.

Поле вартості події: Apple просить позначати потрібну покупку, а для
застосунків із підпискою — лише тоді, коли подія коштує **окремо** від
звичайної підписки (сторінка Apple «In-App Events»). У нас окремої ціни
немає, тож покупку не позначаємо — і в текстах події не обіцяємо, що скан
безкоштовний. Чи схвалить Apple подію, що спирається на звичайні функції
застосунку, а не на окремий контент, — наше припущення; якщо відхилять,
подаємо застосунок без події, а її — з першим оновленням.

| Поле | Ліміт | en | uk |
|---|---|---|---|
| Назва | 30 | Label Your Kitchen Challenge (28) | Челендж: підпиши кухню (22) |
| Короткий опис | 50 | Your kitchen in one shot, its words in a week (45) | Кухня одним кадром, її слова за тиждень (39) |
| Довгий опис | 120 | Scan your kitchen in one shot: every object gets a word sticker. Learn them all in a week with flashcards and a quiz. (117) | Скануй кухню одним кадром: кожен предмет отримає слово-наліпку. А за тиждень вивчи їх усі з картками й квізом. (110) |

Людям, у яких застосунку ще немає, пошук показує скріншоти, а не картку
події (факт Apple). Тож подія — передусім для тих, хто вже встановив, і для
фічерингу.

### Решта полів

| Поле | Значення |
|---|---|
| Privacy Policy URL | `https://<сервер>/privacy` |
| Support URL | обов'язкове: `https://<сервер>/support` — часті питання (відновлення, скасування, повернення коштів, видалення даних) і пошта підтримки |
| Категорія | основна **Education**, додаткова **Reference** (обидві індексуються, тому ці слова в ключових не повторюємо) |
| Вікова категорія | анкету проходь чесно, відповіді по питаннях у розділі «Поля App Store Connect»: насильства, контенту для дорослих, чатів, вільного браузера й реклами немає, тож **4+** |
| Ціна застосунку | Free (заробляємо на Pro) |
| Ціни покупок | місяць $9.99, рік $59.99 (7 днів безкоштовно), «Назавжди» $129.99; Україна — ті самі долари, вручну (рішення 5 жовтня 2026; `USER_TODO.md`, крок 3; країни — `MONETIZATION.md`, розділ 7). У текстах сторінки сум немає — App Store показує їх сам у місцевій валюті |
| Шифрування | не питатиме: `ITSAppUsesNonExemptEncryption: false` уже в `app.json` (відповіді, якщо все ж спитає: розділ «Поля App Store Connect») |
| Copyright, Content Rights, контакт рецензента, група підписок | готові відповіді в розділі «Поля App Store Connect» (без них «Add for Review» не спрацює) |
| Покупки | на сторінці версії → **In-App Purchases and Subscriptions** → обери місячну, річну й «Назавжди». **Перша підписка й перша разова покупка йдуть на перевірку тільки разом із версією застосунку**, а нова група підписок — разом хоча б з однією своєю підпискою |
| Випуск | **Manually release this version** — сам натиснеш Release у день запуску. Після натискання застосунок з'являється в сторі протягом до 24 годин |

---

## Скріншоти

Один набір **6.9"** (1320×2868), **8 кадрів на локаль**: en-US, uk, en-GB і
es-MX мають свої («банки» fr і ko беруть en-US). Apple сама зменшує їх для
інших iPhone; iPad не потрібен (`supportsTablet: false`).

**Кадри рендерить `tools/store-shots`** (як він працює, що встановити на Mac
і чекліст подачі: `tools/store-shots/README.md`). Усе, що на кадрах схоже на
застосунок, і є застосунком: екрани знято з веб-збірки тієї версії, яку
подаєш, з демо-даними. Підписи (таблиці в розділах локалей вище) лежать у
`tools/store-shots/copy.js`; тест не пускає в них тире, ціни, «free» і чужі
бренди й стереже довжину (заголовок до 28 символів, підрядок до 46).

Файли: `{locale}/{locale}_{nn}_{slug}.png`, PNG без прозорості, sRGB,
рівно 1320×2868 (рендер перевіряє сам). Завантажуй у порядку номерів:

| nn | slug | Кадр |
|---|---|---|
| 01 | scan | сканер з кнопкою знімка: чашка в прицілі стає наліпкою з табличкою слова |
| 02 | dictionary | словник, колекція наліпок |
| 03 | flashcards | та сама чашка на картці (лице й зворот) і квіз «7 / 10» |
| 04 | scene | ціла кімната одним кадром, плашка **PRO** |
| 05 | level | рівень і слово дня з теми |
| 06 | widget | віджети на Замкненому й Початковому екрані |
| 07 | streak | профіль: серія й досягнення (темна тема) |
| 08 | share | картки й наліпки «Поділитися» |

Наприклад, `uk/uk_01_scan.png` … `es-MX/es-MX_08_share.png`: 4 × 8 = 32 файли.

**Перерендер** із кореня репозиторію (кілька хвилин):

```sh
REF=<гілка, тег чи коміт збірки> node tools/store-shots/render.mjs --export
```

`REF` означає той самий коміт, що й збірка, яку подаєш: на кадрах не має
бути нічого, чого в ній немає (правило 2.3.3). Результат лягає в `store-shots-out/`
(або `OUT=…`): кадри по теках локалей, `contact-<locale>.png` (вісім кадрів
поруч) і `search-row.png` (кадри 1, 2 і 3 у розмірі пошуку, ~10%: заголовок
має читатися).

**Варіант кадру 6 для тесту іконки (PPO).** Кадр 6 показує іконку
застосунку на Початковому екрані, тож для тесту «Ока Лінго» потрібен свій
кадр 6 з `assets/icon-eye.png` для кожної локалі. Після основного рендера:

```sh
OUT=store-shots-out/ppo-icon-eye WORK=store-shots-out/.work REF=<той самий> \
  node tools/store-shots/render.mjs --frames-only --only=6 --icon=icon-eye.png
```

Файли: `ppo-icon-eye/<locale>/<locale>_06_widget.png` і `contact-icon.png`.
У варіанті тесту з іконкою «Око Лінго» заміни ними кадр 6, решта сім ті самі.
Тест, що міняє скріншоти, Apple перевіряє (див. «Іконка» нижче).

**Кадри 1, 2 і 4 поки на намальованих замінниках фото** (чашка на столі,
предмети колекції, кухня; ті самі наліпки бачать і кадри 3 та 8). Справжні
фото власника кладуться в теку й передаються через `PHOTOS=…`; контури для
наліпок дає той самий AI, що й сервер (`scan-photos.mjs`), а наліпку кадру 1
рендер ріже з самого фото по контуру, як застосунок. Перед подачею:

```sh
PHOTOS=~/Desktop/store-photos node tools/store-shots/scan-photos.mjs
PHOTOS=~/Desktop/store-photos REF=<коміт збірки> node tools/store-shots/render.mjs --export
```

і потім варіант кадру 6 для тесту іконки (команда вище). Список кадрів (що знімати, формат, де предмет у
кадрі) є в `tools/store-shots/README.md`, розділ «Справжні фото замість
намальованих». Слова на кадрах беруться з `tools/store-shots/data.mjs`: якщо твої
предмети інші, виправ слова там.

- **Підпис угорі**, великим контрастним шрифтом; заголовок має читатися при
  10% (`search-row.png`).
- **Жодних цін, «free» і «безкоштовно»** на скріншотах (правило 2.3.7).
- Перші три кадри вирішують: їх видно в пошуку без відкриття сторінки.
- Сцена (ціла кімната) — функція Pro з однією безкоштовною спробою (вона
  забирає і єдиний безкоштовний скан). Показувати її можна: вона є в
  застосунку; плашка PRO на кадрі 4 це чесно каже.
- Ідея кадру на потім (не для перших трьох місць; ASC дозволяє до 10 кадрів на
  розмір): три телефони з «Навчанням» в Океані, Ягоді й Какао, підпис en «Make
  it yours: 4 color themes with Pro», uk «Твій колір: 4 теми в Pro». Знімай у
  застосунку з Pro (Sandbox), а не малюй окремо: правило 2.3.3 вимагає показувати
  застосунок як він є.

Для A/B-тесту скріншотів (Product Page Optimization) потрібен другий набір;
план у `LAUNCH_PLAN.md`, розділ 6.4.

**Іконка.** Основна іконка — «Лінго», голова маскота на глибокому фіолетовому
(концепт B; майстер `assets/brand/icon-lingo.svg`, PNG робить
`tools/export-brand.mjs`). Окремо в App Store Connect іконку не завантажують:
сторінка бере її зі збірки. Збірка 1.0 везе ще **альтернативну іконку «Око
Лінго»** (концепт A, набір `AppIcon-Eye`; кладе її `plugins/withAlternateIcons.js`).
У самому застосунку вона не перемикається, вона потрібна лише для A/B-тесту:
Apple дає тестувати тільки іконки з бінарника опублікованої версії. Тож тест
іконки можна запустити одразу після релізу, без нової версії. Рецензію
«Око Лінго» проходить один раз, разом зі збіркою 1.0: App Review бачить увесь
бінарник, тож альтернативна іконка має відповідати правилам так само, як
основна. Окремо тест, що лише міняє іконку, на рецензію не подають: «If
you’re simply changing the order of screenshots or previews that are already
on the App Store, or only modifying the app icon, your metadata is already
approved and you don’t need to resubmit» (App Store Connect Help → Configure
test treatments). Нові скріншоти чи відео в тесті Apple перевіряє окремо,
без нової версії; якщо App Store Connect попросить **Add for Review** і для
тесту іконки, подай. Цитати й посилання: `LAUNCH_PLAN.md`, розділ 6.4. Кадр 6
для варіанта з «Оком Лінго» рендерить `tools/store-shots` (див. «Варіант
кадру 6 для тесту іконки» вище). Тест
на сторінці одночасно лише один, до 90 днів; порядок тестів і кроки в App
Store Connect: `LAUNCH_PLAN.md`, розділ 6.4, і `USER_TODO.md`, крок 17.

---

## App Privacy — що відповідати

Apple вважає дані **«зібраними» (collected)**, якщо вони залишають телефон і
ми чи наші партнери можемо мати до них доступ **довше, ніж потрібно, щоб
відповісти на запит у реальному часі**. Дані **не пов'язані** з людиною лише
тоді, коли їх знеособили ще до збору і ніколи потім не зводять з
ідентифікаторами. **Трекінг** — це поєднання з чужими даними для реклами або
передача брокерам даних; власна аналітика трекінгом не є.

**Does your app collect data?** → **Yes**, такі типи:

| Тип даних | Мета | Пов'язані з тобою? | Трекінг |
|---|---|---|---|
| **Identifiers → User ID** | App Functionality | **Yes** | No |
| **Identifiers → Device ID** | Analytics | **No** | No |
| **Purchases → Purchase History** | App Functionality, **Analytics** | **Yes** | No |
| **User Content → Photos or Videos** | App Functionality | **No** | No |
| **User Content → Other User Content** | App Functionality | **Yes** | No |
| **Usage Data → Product Interaction** | App Functionality, **Analytics** | **Yes** | No |
| **Other Data → Other Data Types** | Analytics | **Yes** | No |

Жирним — що змінилося з появою PostHog і за вимогами RevenueCat.

**Чому так:**

- **User ID.** При першому запуску сервер видає випадковий id. Він живе в
  Keychain, на сервері до нього прив'язані лічильники сканів і статус Pro, а в
  RevenueCat — покупки (id сервера і є `appUserID` у RevenueCat). Хто входить
  через Apple, отримує id акаунта, а сервер зберігає ще й знеособлений хеш
  (HMAC) ідентифікатора Apple — щоб упізнати той самий акаунт на іншому
  iPhone. Імені й пошти ми не просимо й не знаємо, але id сам є
  ідентифікатором, тому чесна відповідь — **Linked**.
- **Device ID (новий рядок).** Анонімна статистика (PostHog, сервер у ЄС —
  Франкфурт) створює на телефоні свій випадковий id установки. У Apple
  «Device ID» — це рекламний або інший ідентифікатор рівня пристрою; id
  установки під це підпадає, тож декларуємо його — це обережний вибір із
  дослідження. **Not linked:** застосунок ніколи не викликає `identify`, не
  передає цей id ні нашому серверу, ні RevenueCat, і не зводить його з нашим
  id чи Apple ID. IDFA й IDFV PostHog не читає. RevenueCat цього рядка не
  вимагає: його довідка просить «Device ID» лише для інтеграцій з рекламним
  ідентифікатором (IDFA), а IDFV він збирає тільки викликом
  `collectDeviceIdentifiers()`, якого в `src/` немає.
- **Product Interaction.** Дві частини. (1) Разом зі словником
  синхронізуються кількість дій за днями, лічильники досягнень і список уже
  показаних досягнень; сервер тримає лічильники сканів (скільки сканів і
  скільки сканів кімнати за весь час). Це пов'язано з id. (2) Анонімні події
  PostHog: кроки онбордингу, показ пейволу, почата чи завершена покупка, скан
  вдався чи ні, збережене слово, «поділитися», а також запуск і згортання
  застосунку. Вони не пов'язані з людиною, але Apple питає про тип даних
  загалом, а не окремо про кожну частину, тому для всього рядка — **Yes**
  (наше тлумачення анкети: якщо хоч частина пов'язана, відповідаємо «так»).
- **Purchase History.** Статус підписки (дата закінчення) лежить на сервері
  біля id, RevenueCat тримає історію покупок під тим самим id. RevenueCat
  вимагає позначати і **App Functionality**, і **Analytics**. **Linked**, бо id
  RevenueCat — це id нашого сервера, а він після входу через Apple
  пов'язаний з акаунтом.
- **Other User Content.** Лише після входу через Apple: словник (слова,
  транскрипції, переклади, приклади, мови, розклад повторень) лежить на
  сервері під id акаунта, щоб синхронізуватися між iPhone людини. Тому
  **Linked**. Без входу словник не залишає телефон, але анкета питає про
  застосунок загалом.
- **Other Data.** Відповіді онбордингу: цілі, сфера, рівень 1–10 і звідки
  людина про нас дізналась — лише варіанти з готових списків, без вільного
  тексту. Сервер зберігає їх біля id (`users/<id>.profile`), щоб ми бачили
  загальні числа, тому **Analytics** і **Linked**. Ті самі відповіді (плюс
  «що заважає вчитися») ідуть і в анонімну статистику. Слова дня сервер
  підбирає з профілю й списку «Знаю», які застосунок шле в самому запиті, і
  їх не зберігає — це відповідь у реальному часі, не збір.
- **Photos.** Наш сервер кадр не зберігає й не логує. Але далі він іде до
  провайдера AI (Gemini або Anthropic), а ті за своїми умовами можуть
  тимчасово тримати запити, щоб виявляти зловживання. Це довше за «відповісти
  в реальному часі», тому позначаємо як зібране. **Not linked:** провайдер
  отримує лише зображення й текст підказки, без нашого id.

**Не відзначаємо:**

- **Location (Coarse Location)** — лише поки в PostHog вимкнене визначення
  країни й міста за IP (GeoIP). Сам IP PostHog у ЄС за замовчуванням
  відкидає, але GeoIP встигає його використати до цього. Тому GeoIP вимикаємо
  в проєкті (`USER_TODO.md`, крок 12). **Залишиш GeoIP — додай Coarse
  Location → Analytics → Not linked.** RevenueCat теж локації не
  збирає: за його довідкою, лише локаль і код валюти.
- **Contact Info** (пошта, ім'я, телефон) — застосунок їх не питає, і вхід
  через Apple теж: ми не запитуємо в Apple ні ім'я, ні пошту (scope порожній).
  Ім'я з онбордингу («Як до тебе звертатися?») **лишається на телефоні**: його
  не отримують ні сервер, ні аналітика. Лист у підтримку людина пише зі своєї
  пошти, поза застосунком.
- **Diagnostics** — звітів про падіння й помилок у PostHog не вмикаємо.
  Додамо Sentry чи error tracking — з'явиться **Crash Data**.
- **Contacts, Financial Info, Health** тощо — нічого з цього. Оплату проводить
  Apple, картки ми не бачимо.
- Фото наліпок, ім'я й аватар у профілі **не залишають телефон** навіть в
  акаунті, тож це не «збір».

**Does your app use data for tracking?** → **No**. Рекламного ідентифікатора
(IDFA) і запиту App Tracking Transparency немає, записів екрана немає.

**Атрибуція Apple Ads (AdServices): відповідь є, нового рядка не треба.**
Застосунок викликає `enableAdServicesAttributionTokenCollection()`
(`src/purchases.js`). Це «стандартна» атрибуція Apple: токен видає сама Apple,
а RevenueCat обмінює його на назву кампанії, щоб показати її в своїх графіках.
Стандартна атрибуція **не потребує згоди ATT** (довідка RevenueCat: «Standard
data doesn't require App Tracking Transparency (ATT) consent»), і ми ATT не
просимо, тож **Tracking лишається No**. Що відзначати: **нічого нового**.
«З якої кампанії прийшла установка» зберігається в RevenueCat під id нашого
сервера лише для аналітики, а це вже покрито рядками **Purchase History**
(App Functionality + Analytics, Linked) і **Product Interaction** (Analytics,
Linked). Тип **Advertising Data** Apple визначає як дані про рекламу, яку
людина побачила; реклами в застосунку немає, тож його не відзначаємо. Хочеш
відзначити із запасом (шкоди не завдасть): додай рядок і в ASC, і в
`expo.ios.privacyManifests` в `app.json` (тест `widgetPrivacyManifest` вимагає,
щоб таблиця тут і маніфест збігались).

**Звірка з довідкою RevenueCat «Apple App Privacy»** (7 жовтня 2026; повторюй
при оновленні `react-native-purchases`, зараз 10.10.2):

| Тип за довідкою RevenueCat | Наша відповідь |
|---|---|
| Purchases: завжди; Purchase History для App Functionality **і** Analytics | рядок у таблиці вище |
| Identifiers: User ID, якщо є власний app user ID | рядок у таблиці: id сервера і є `appUserID` |
| Identifiers: Device ID лише для інтеграцій з рекламним ідентифікатором (IDFA) | IDFA немає; наш рядок Device ID для PostHog |
| Usage Data, якщо є аналітичний SDK (PostHog тощо) | Product Interaction у таблиці |
| Location: не збирає (лише локаль і код валюти) | не відзначаємо |
| Contact Info: лише якщо в customer attributes кладуть ім'я, пошту, телефон | не відзначаємо: атрибутів із такими даними застосунок не ставить |
| Health, Financial, Sensitive, Contacts, Browsing/Search History, Diagnostics | не відзначаємо: RevenueCat їх не збирає |

Відповіді мають збігатися з політикою приватності (`server/public/privacy.html`,
сторінка `/privacy`). Якщо щось у застосунку зміниться, онови обидва.

---

## Нотатки для рецензента (App Review Information → Notes)

Це **перша версія** (1.0.0): рецензент не бачив застосунок раніше, тож нотатки
самодостатні й нічого не кажуть про «оновлення» чи «нове в цій версії».
Порядок такий: спершу **як перевірити** (без входу, як дійти до пейволу,
sandbox-покупка, Sign in with Apple необов'язковий, стирання даних у Settings →
Data), потім коротко правила. Правило 2.3.1(a) вимагає конкретно описати всі
функції, тож віддалені перемикачі пейволу теж описано (наше рішення: так
безпечніше, ніж пояснюватись після відмови). **Sign-in required: No**, поля
логіна залиш порожніми. Перед вставкою звір назви кнопок із релізною збіркою
англійською.

**Ліміт: 4000 байтів** (Apple: «The Notes field can contain up to 4000
bytes»; звірено 7 жовтня 2026). Раніше текст був 10 118 байтів і не влазив.
Обидва варіанти нижче влазять із запасом (на 7 жовтня 2026: **A = 3604 B,
B = 3742 B**, ціль не більше 3800). Після будь-якої правки перевір: збережи
текст у файл і виконай `wc -c файл` (або `node -e "console.log(Buffer.byteLength(require('fs').readFileSync('notes.txt','utf8')))"`).
Довшу «прохідку» в Notes не клади: додай екранний запис у поле Attachment
(необов'язково). Контактів у тексті немає, вони в окремих полях ASC (розділ
«Поля App Store Connect»).

**Який варіант.** Дивись `AI_CONSENT_SHEET` у `src/flags.js` на коміті збірки,
яку подаєш. `false` (так зараз): блок A цілком. `true`: у блоці A заміни рядок,
що починається з `AI PROCESSING:`, на рядок із блока B. Більше нічого не
різниться. Рішення про прапорець за власником, тут обидва тексти готові.

**Варіант A: `AI_CONSENT_SHEET = false`** (стан коду на 7 жовтня 2026):
```
HOW TO TEST (no login needed)
1. Launch the app. No account is required and every feature works without one; on first launch it only registers a random anonymous ID with our server. Onboarding takes about 2 minutes and every optional question has Skip. At its end a subscription offer appears (close it with X or "Continue for free").
2. Scan: point the camera at any object (a cup, a plant, a keyboard), tap the shutter, then Save. The word appears in Words and in Learn (flashcards, quiz). Needs internet. The free tier has exactly 1 AI scan in total (not per day); the scan in onboarding uses it.
3. Paywall: any scan after the free one opens it before anything is uploaded. It also opens from Scene mode (a whole room), Settings > Get Pro, adding a second learning language, and Pro-only settings (color palettes, 3 or 5 words a day).
4. Sandbox purchase: buy any plan with a Sandbox Apple Account; scans become unlimited. Restore Purchases is on the paywall and in Settings; Pro users get Settings > Manage subscription.
5. Sign in with Apple (optional): Settings > Account. It backs up the word list and syncs it between the person's iPhones. It is the only sign-in method; no name or email is requested.
6. Delete data: Settings > Data > Erase all my data. It erases the device data and our server record. For a signed-in user it also deletes the account and synced words and revokes the Sign in with Apple token (5.1.1(v)).

AI PROCESSING: A scanned photo is sent to our server and to a third-party AI service (Google Gemini or Anthropic) only to recognize the object; our server does not store it. The Privacy Policy describes this (linked in Settings and on the paywall).

FREE VS PRO: Free forever: dictionary with no word limit, flashcards with spaced repetition, quiz, a personalized word of the day, three widgets, sharing. Pro: unlimited AI scans and room scans, all 29 learning languages, up to 5 words of the day, four color themes. Plans: monthly or yearly auto-renewable subscription (yearly may start with a 7-day free trial for eligible users) or Lifetime, a one-time non-consumable purchase.

PAYWALL (3.1.2): the in-app paywall shows the billed amount as the main price, the trial length and the price after it, Terms of Use, Privacy Policy, Restore Purchases and a close (X) button. "Continue for free" leaves without buying.

REMOTE CONFIGURATION (no code is downloaded): RevenueCat offering metadata switches (a) whether the subscription offer follows onboarding and (b) whether paywalls use our in-app screen or a RevenueCat paywall with the same elements. For this review: offer shown, in-app screen.

PERMISSIONS: Camera for scanning. Photos: add-only access, requested only when the user taps Save on a sticker or card; the Stories background comes from the system photo picker (no read access; NSPhotoLibraryUsageDescription exists only because the picker frameworks reference it). Notifications: the word of the day and one local streak reminder at 8 pm for the user's own streak, no advertising; both can be turned off in Settings.

SHARING: stickers and 9:16 cards (Copy, Save, system share sheet). Instagram Stories buttons appear only when Instagram is installed.

WIDGETS: three free widgets (Word of the Day, My Words, Streak). Open the app once, then Home Screen > Edit > Add Widget > LinguaLens.

ANALYTICS: anonymous usage statistics (PostHog, EU servers), random install ID, no IDFA, no tracking, no ATT prompt, no screen recording. Can be turned off in Settings.

OFFLINE: scanning shows an explanatory message; the dictionary, flashcards and quiz keep working.
```

**Варіант B: `AI_CONSENT_SHEET = true`.** Заміни в блоці A рядок
`AI PROCESSING: …` на цей:
```
AI PROCESSING: Before the first scan the app explains that the photo is sent to our server and to a third-party AI service (Google Gemini or Anthropic) only to recognize the object, and asks for permission (Allow / Not now), with a link to the Privacy Policy. Nothing is uploaded before Allow, and only then does iOS ask for camera access. The same sheet appears in the onboarding demo.
```

**Шаблон RevenueCat замість нашого пейволу** (`paywall_ui: "revenuecat"`,
експеримент E1). Для рецензії лишається наш пейвол (`custom`), і елементи з
рядка `PAYWALL (3.1.2)` перевірені в коді (`src/PaywallScreen.js`). Шаблон з
дашборду RevenueCat наш код не контролює: тексти, посилання й кнопки
задаються лише там. Тому перш ніж вмикати E1 (а тим паче на живому трафіку),
налаштуй у редакторі шаблону й **перевір на пристрої**: (1) Terms of Use:
`https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`;
(2) Privacy Policy: `https://<server>/privacy`; (3) кнопку Restore Purchases;
(4) ціну за період через змінні пакета, а не набраним текстом, найпомітнішою;
(5) тривалість пробного й ціну після нього; (6) кнопку закриття. Без цього
пейвол порушує 3.1.2, а фраза в нотатках «з тими самими елементами» стає
неправдою для рецензії наступного оновлення. Ті самі пункти мають бути в
`USER_TODO.md` (крок 4А, пункт 8, і крок 18).

**Ризик 5.1.2(i): аркуша згоди на AI немає (рішення власника 5.10.2026;
власник вирішує окремо).** Правило 5.1.2(i) вимагає прямо сказати, що дані
йдуть стороннім AI-сервісам, і **спитати дозволу до** передачі. Аркуш «Перед
першим сканом» (`src/ConsentSheet.js`) це робив, але псував перший скан, тож
його вимкнено прапорцем `AI_CONSENT_SHEET = false` у `src/flags.js`. Куди йде
фото, чесно сказано в політиці приватності (`/privacy`, розділи «Коротко» і
«Кадр із камери») і в нотатках (рядок `AI PROCESSING`, варіант A). Ризик
відмови реальний: рецензент може відповісти чимось на кшталт «Guideline 5.1.2:
Legal: Privacy: Data Use and Sharing» і попросити згоду в застосунку.

Якщо так сталося, нічого переписувати не треба:
1. `src/flags.js`: `export const AI_CONSENT_SHEET = true;` — аркуш
   повертається в сканер і на демо онбордингу (до камери); рядки
   `aiConsent*` уже перекладені.
2. `npx jest` (тести обох станів уже є), нова збірка `npm run build:ios`.
3. У нотатках заміни рядок `AI PROCESSING:` на варіант B (вище).
4. У Resolution Center відповідай коротко: «The app now asks for explicit
   permission before the first photo is sent to the AI service (Allow / Not
   now), in the scanner and in onboarding. Build N.» і відправ нову збірку.

---

## Поля App Store Connect: готові відповіді

Без цих полів ASC не дасть натиснути «Add for Review». Відповіді виведено з
коду й конфігів застосунку (перевірено 7 жовтня 2026). У `<…>` стоїть те, чого
ми знати не можемо: твоє ім'я, телефон, пошта, юридична назва.

| Поле (де в ASC) | Відповідь |
|---|---|
| **Sign-in required** (App Review Information) | **No**: поля логіна й пароля порожні, вхід через Apple необов'язковий |
| **Contact**: ім'я й прізвище | `<ім'я>` `<прізвище>`: людина, яка відповість на питання рецензента |
| **Contact**: телефон | `+<код країни><номер>`: Apple вимагає міжнародний формат із плюсом, наприклад `+380…` |
| **Contact**: пошта | `<пошта>`: краще та сама, що `SUPPORT_EMAIL` на сервері, щоб листи не губились |
| **Notes** | блок із розділу вище, **не більше 4000 байтів** (контактів у самому тексті немає, вони в полях вище) |
| **Copyright** (Version Information; Apple: «This property is required») | `2026 <ПІБ або назва ФОП, як в акаунті Apple Developer>`. Apple просить рік, коли здобуто права, і ім'я особи чи компанії; знак © ASC додає сам, не друкуй його |
| **Content Rights** (App Information) | **No**, застосунок не містить, не показує й не відкриває чужого контенту. Слова, переклади й приклади AI генерує на запит людини з її власного фото; чужих текстів, картинок, музики чи новин у застосунку немає; шрифт Nunito (SIL Open Font License) вбудований за ліцензією (наше тлумачення питання; відповідай **Yes** лише якщо додаси чужий контент) |
| **Age Rating** | усе «None / No», підсумок **4+**: таблиця нижче |
| **Export Compliance** | у збірці вже є `ITSAppUsesNonExemptEncryption: false`, ASC не питатиме; якщо спитає, відповіді нижче |
| **Privacy Policy URL**, **Support URL** | `https://<server>/privacy` і `https://<server>/support`. Support URL має вести на справжні контакти (довідка Apple), тож на `/support` має бути пошта, не плейсхолдер. Поля й опис ведуться **по локалях**: вводь ті самі адреси для en-US, uk, en-GB, es-MX, fr і ko (шість разів) |
| **Marketing URL** | порожньо (необов'язково) |
| **Tax category** | лиши типову «App Store software»: для застосунку з підписками інша не потрібна (наше припущення, Apple це не розписує) |
| **Price**, **Availability** | Free; країни й ціни покупок: `USER_TODO.md`, крок 3, і `MONETIZATION.md`, розділ 7 |
| **Статус трейдера (ЄС, DSA)** | `USER_TODO.md`, крок 1.5: без нього застосунку не буде в країнах ЄС |
| **Version Release** | Manually release this version |

### Вікова категорія (Age Rating), питання за питанням

Назви взято з довідки Apple «Age ratings values and definitions» (звірено
7 жовтня 2026); у самому ASC порядок і формулювання можуть трохи відрізнятися,
суть та сама. Окремого питання про штучний інтелект у довідці немає: якщо ASC
його покаже, відповідай за останнім рядком таблиці.

| Група питань | Відповідь | Чому |
|---|---|---|
| Parental Controls, Age Assurance | **No** | немає батьківського контролю й перевірки віку |
| Unrestricted Web Access | **No** | вбудованого браузера немає: Terms і Privacy відкриваються в Safari за посиланням |
| User-Generated Content | **No** | слова людина зберігає для себе; іншим користувачам застосунку вони не показуються. Поширення (системне «Поділитися», Instagram Stories) відбувається поза застосунком |
| Messaging and Chat | **No** | чатів немає |
| Advertising | **No** | реклами й рекламних SDK немає; пейвол це наша пропозиція Pro, не реклама. Трекінгу й ATT теж немає |
| Medical or Treatment Information, Health or Wellness Topics | **None / No** | застосунок про мови |
| Sexual Content or Nudity, Mature or Suggestive Themes | **None** | немає |
| Cartoon or Fantasy Violence, Realistic Violence, Graphic or Sadistic Violence, Guns or Other Weapons | **None** | немає |
| Profanity or Crude Humor, Horror or Fear Themes, Alcohol, Tobacco or Drug Use | **None** | немає |
| Simulated Gambling, Gambling, Loot Boxes | **None / No** | немає |
| Contests | **None** | подія «Челендж» це особисте завдання вивчити слова: без призів і змагання між людьми |
| AI-згенерований зміст (якщо ASC спитає) | описати так | застосунок розпізнає предмет на фото і сам пише коротке слово, переклад і приклад; вільного чату чи запиту від людини до AI немає, зображень AI не створює. Окремого фільтра слів на сервері немає, ми спираємось на фільтри моделі провайдера (наше тлумачення, тому відповіді «None» вище чесні) |

Очікуваний підсумок: **4+**. «Made for Kids» не вмикай (застосунок для всіх, не
спеціально для дітей), перевизначення віку не став.

### Експорт шифрування (Export Compliance)

`app.json` → `expo.ios.infoPlist.ITSAppUsesNonExemptEncryption: false`
(перевірено 7 жовтня 2026). З цим ключем ASC не питає про шифрування на кожній
збірці. Це правильно, бо застосунок користується лише стандартним шифруванням
системи: HTTPS/TLS до нашого сервера, RevenueCat і PostHog, Keychain для id.
Власних чи нестандартних алгоритмів у клієнті немає (пакета на кшталт
`expo-crypto` у `package.json` немає). Якщо ASC усе одно спитає (наприклад,
ключ прибрали): **Uses encryption: Yes** (лише стандартне, HTTPS), **qualifies
for exemption: Yes**, **proprietary or non-standard algorithms: No**; документів
додавати не треба. Не став `true`, не змінивши відповіді тут.

### Підписки: група й покупки по локалях

Покупки вводяться по локалях, і їх треба заповнити **до** подачі (разом
зі скріншотом пейволу для рецензента). Достатньо двох локалей: **en-US** і
**uk**. Для решти (en-GB, es-MX, fr, ko) окремих текстів не додавай: Apple
покаже основну локаль, а назви в нас брендові (наше припущення про запасну
локаль). Описи тих самих покупок: таблиця «Покупки на сторінці» вище (ліміти:
назва 30, опис 45).

| Локаль | Subscription Group Display Name | Місяць (Display Name) | Рік (Display Name) | «Назавжди» (Display Name) |
|---|---|---|---|---|
| en-US | `LinguaLens Pro` | `LinguaLens Pro (1 Month)` | `LinguaLens Pro (1 Year)` | `LinguaLens Pro (Lifetime)` |
| uk | `LinguaLens Pro` | `LinguaLens Pro (1 місяць)` | `LinguaLens Pro (1 рік)` | `LinguaLens Pro назавжди` |

Група називається однаково в обох локалях: це бренд. «Назавжди» це разова
покупка (Non-Consumable), у групі її немає, тому для неї потрібен лише Display
Name і опис. Опис (поле Description) кожної підписки й покупки має згадувати
кольорові теми («color themes» / «кольорові теми»), як у таблиці «Покупки на
сторінці».

---

## Перевірка перед «Submit for Review»

**Акаунти й налаштування**
- [ ] App Store Connect → Business: **Paid Apps Agreement** активна, банк і податки заповнені; статус трейдера (ЄС) вказано
- [ ] Заявка в **Small Business Program** подана
- [ ] Група підписок «LinguaLens Pro»: місячна й річна в статусі **Ready to Submit** (назва, опис en/uk, скріншот пейволу для рецензента); на річній — Introductory Offer → Free trial, 1 week
- [ ] Разова покупка «Назавжди» (Non-Consumable) — **Ready to Submit**
- [ ] Скріншот пейволу для рецензента знято на поточній збірці й нових цінах: у таблиці «Слова дня 1 / до 5» і «Кольорові теми ✕ / 4», «Картки, квіз, віджети» одним рядком
- [ ] **Billing Grace Period** увімкнено (16 днів, All Renewals, Production and Sandbox)
- [ ] RevenueCat: entitlement **`lingualens_pro`** з усіма трьома продуктами; offering `default` позначений **Current**, пакети `$rc_monthly`, `$rc_annual`, `$rc_lifetime`; метадані `{"onboarding_paywall":"show","paywall_ui":"custom"}`
- [ ] RevenueCat → вебхук на `/webhooks/revenuecat`, тестова подія дає `200`
- [ ] App Store Connect → App Information → App Store Server Notifications: адреса з RevenueCat стоїть і для Production, і для Sandbox (Version 2), а RevenueCat показує, що сповіщення приходять (`USER_TODO.md`, крок 4Б, пункт 10)
- [ ] **Family Sharing** вимкнено в місячній, річній і «Назавжди» (`USER_TODO.md`, крок 3, пункт 9): ввімкнене вимкнути назад не можна
- [ ] RevenueCat → інтеграція Apple Search Ads увімкнена (стандартна атрибуція AdServices, без ATT; відповідь для App Privacy: розділ «App Privacy»)
- [ ] PostHog (проєкт у ЄС): IP відкидається, GeoIP вимкнено, флаг/експеримент `onboarding-flow` створено (без нього застосунок просто бере `control`)
- [ ] Ключові слова перевірені в Astro/AppSprint, скрипт повторів — зелений

**Сервер**
- [ ] `/health` → `"store":"firestore"` (не `file`!), потрібний провайдер, а в `config` усі значення `true`: `ai`, `authSecret`, `firestore`, `revenuecat`, `webhookAuth`, `supportEmail`, `appleRevoke`
- [ ] `REVENUECAT_ENTITLEMENT` не задано або дорівнює `lingualens_pro`
- [ ] `/privacy` відкривається, є розділ про анонімну статистику, у «Контактах» твоя пошта, а не плейсхолдер; те саме на `/support` (Apple: Support URL має вести на справжні контакти)
- [ ] Платний тариф Gemini або ключ Anthropic
- [ ] Бюджетний алерт у Google Cloud

**Збірка**
- [ ] `eas env:list production`: `EXPO_PUBLIC_SERVER_URL` (лише `https://хост`, без шляху), `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (**`appl_…`, не `test_…`** — інакше збірка зупиниться сама), `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_SUPPORT_EMAIL` (без нього лише попередження, але в Параметрах не буде «Contact support»), а також `EXPO_PUBLIC_APP_TOKEN`, якщо на сервері задано `APP_TOKEN`
- [ ] `eas.json` → `submit.production.ios`: справжні `ascAppId` і `appleTeamId`
- [ ] Після першого завантаження білда в TestFlight перевір пошту: листа про Privacy Manifest (`ITMS-91053`) бути не має. Маніфести (застосунок і віджет) уже в збірці (`app.json` → `ios.privacyManifests`, `plugins/withWidgetPrivacyManifest.js`); якщо лист усе ж прийшов, напиши мені

**TestFlight (на справжньому iPhone)**
- [ ] Увесь чеклист із `TESTING.md`
- [ ] Онбординг від початку до кінця і з пропуском кожного питання; ім'я не потрапляє ні на сервер, ні в PostHog (Activity → Events)
- [ ] Перший скан — і з демо онбордингу, і у вкладці — одразу камера й результат, без аркуша «Перед першим сканом» (`AI_CONSENT_SHEET = false`, див. «Ризик 5.1.2(i)»); якщо власник увімкнув прапорець, навпаки: аркуш є, нічого не вантажиться до «Allow»
- [ ] Пейвол онбордингу: три кроки, хрестик на кожному, «Продовжити безкоштовно» без обіцянки щоденних сканів
- [ ] Скан після єдиного безкоштовного відкриває пейвол **до** зйомки — і того ж дня, і наступного; сцена після безкоштовного скану чи безкоштовної сцени — теж пейвол
- [ ] Sandbox-покупка: Pro вмикається, **скан після безкоштовного проходить** (отже сервер теж бачить Pro)
- [ ] Покупка «Назавжди»: у параметрах «Pro назавжди», жодних дат продовження
- [ ] Видали застосунок і постав знову → «Відновити покупки» повертає Pro
- [ ] «Керувати підпискою» в параметрах відкривається
- [ ] Пейвол показує ціни з App Store у місцевій валюті; посилання Terms і Privacy відкриваються
- [ ] Перемикач анонімної статистики вимкнено → у PostHog нових подій із цього телефона немає
- [ ] «Стерти всі мої дані» працює
- [ ] Авіарежим: кожен екран пояснює, що сталося, нічого не зависає
- [ ] Текст дозволу камери англійською й українською (залежить від мови телефону)
- [ ] Сплеш та іконка «Лінго» на головному екрані, назва під іконкою правильні
- [ ] У збірці є альтернативна іконка «Око Лінго»: на Mac розпакуй `.ipa` з EAS
      (`unzip -o LinguaLens.ipa -d /tmp/ll`) і перевір
      `plutil -p /tmp/ll/Payload/LinguaLens.app/Info.plist | grep AppIcon-Eye`: рядок є

**Сторінка й поля ASC**
- [ ] Локалі en-US, uk, en-GB, es-MX, fr (банк) і ko (банк) заповнені за розділом ASO; **російської локалі немає**; en-GB має **повний** опис із розділу, а не копію en-US
- [ ] Ключові слова uk: розширений варіант випробувано в ASC (лічильник у локалі uk), рішення прийнято; жодне поле ключових не довше за 100 **байтів**
- [ ] У жодному вставленому тексті не лишилось `<server>`, `<сервер>`, `<пошта>`, `<ПІБ…>` чи іншого `<…>`: у полі пошукай символ `<`
- [ ] Скріншоти відповідають реальному застосунку, без цін: набір v4, 8 кадрів на локаль (uk, en-US, en-GB, es-MX), 1320×2868 без альфа-каналу; кадри 1, 2 і 4 перерендерено зі справжніми фото на коміті, з якого зібрано збірку (правило 2.3.3); кадри 6 з PPO на сторінку версії не вантажити
- [ ] Pricing and Availability: доступність на Mac (Apple Silicon) і Apple Vision Pro **знята**
- [ ] App Privacy заповнено за таблицею вище; відповіді звірено з довідкою RevenueCat «Apple App Privacy» (зроблено 7 жовтня 2026, див. «App Privacy»); Tracking: **No**
- [ ] Privacy Policy URL і Support URL відкриваються й введені для всіх шести локалей
- [ ] Місячна, річна й «Назавжди» прикріплені до версії
- [ ] In-App Event прикріплений до тієї ж подачі
- [ ] Обрано **Manually release this version**
- [ ] Поля з розділу «Поля App Store Connect» заповнені: Copyright, Content Rights, Age Rating (**4+**), контакт рецензента (ім'я, телефон із `+`, пошта), група підписок en-US і uk
- [ ] Нотатки для рецензента вставлено: варіант A чи B за `AI_CONSENT_SHEET` у збірці, що подається; **не більше 4000 байтів, перевірено `wc -c`** (див. розділ «Нотатки для рецензента»)

**Pro-теми, віджети, наліпки (усе це вже входить у 1.0.0)**
- [ ] Сервер розгорнуто **до** TestFlight: `POST /word-of-day` приймає `perDay`, `/privacy` має речення про фото тлом для Stories
- [ ] `node scripts/check-dev-assets.js` — у релізному експорті немає тестового фото симулятора
- [ ] Meta App ID у `EXPO_PUBLIC_FACEBOOK_APP_ID` (`USER_TODO.md`, крок 10): інакше в аркуші «Поділитися» немає кнопок Instagram
- [ ] RevenueCat → offering `default` → metadata `onboarding_paywall`: `"show"` (рішення 6 жовтня 2026: пейвол після онбордингу і на другому скані; так само без ключа)
- [ ] Галерея віджетів на iPhone українською: «Слово дня», «Мої слова», «Серія»; на англійському — Word of the Day, My Words, Streak
- [ ] Чекліст пристрою D1–D16 з `TESTING.md` (розділ «v1.3 · Інтеграція») пройдено; знахідки — у реєстрі
- [ ] Sandbox: Параметри → «Тема» → «Ягода» → пейвол із прев'ю → кружечок
      «Какао» → покупка → застосунок і віджети в «Какао»
- [ ] Хрестик на пейволі «themes» нічого не змінює; «Відновити покупки» з
      нього на іншому iPhone з Pro теж вмикає палітру з прев'ю
- [ ] Pro скінчився (Sandbox: місячна підписка закінчується за 5 хв) →
      застосунок у «Крейді», під плитками — «Ягода повернеться разом із Pro»;
      поновлення → палітра повертається
- [ ] Пейволи `themes` і `wod_per_day` на iPhone SE: обраний тариф із сумою
      списання видно без прокрутки
- [ ] Хром камери й іконка застосунку однакові в усіх палітрах
- [ ] Шаблон RevenueCat (`paywall_ui: "revenuecat"`, експеримент E1), **лише
      якщо вмикаєш**: у редакторі задано Terms URL
      `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`,
      Privacy URL `https://<server>/privacy`, кнопку Restore Purchases, ціну за
      період змінними пакета (не набраним текстом), тривалість пробного й
      ціну після нього та кнопку закриття; усе перевірено на пристрої **до**
      старту експерименту; у текстах немає ліміту слів чи захисту серії, палітри
      названі так само, як у застосунку (3.1.2; докладно: «Нотатки для
      рецензента»)

**Вхід через Apple**
- [ ] App ID має capability **Sign in with Apple** (EAS вмикає її сам за
  `ios.usesAppleSignIn` в `app.json`; перевір у developer.apple.com → Identifiers)
- [ ] На сервері задано `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
  (ключ Sign in with Apple; `/health` → `config.appleRevoke: true`) — без них
  «Стерти всі мої дані» не зможе відкликати вхід, а Apple цього вимагає при
  видаленні акаунта
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
| Номінація на фічеринг | подавати щонайменше за 3 тижні (довідка App Store Connect; сторінка Getting Featured каже «від 2 тижнів до 3 місяців») |
| Після «Release» | до 24 годин, поки застосунок з'явиться в сторі |
| Small Business Program | 15% з 15-го дня після кінця фінансового місяця схвалення |

Перша подача часто повертається з зауваженням, це нормально. Для такого
застосунку найчастіше чіпляються до: підписок, не відправлених разом із
версією; Terms/Privacy, яких не видно в пейволі чи описі; ціни, яка на
пейволі не найпомітніша (правило 3.1.2); скріншотів, що не відповідають
застосунку; «незрозуміло, як тестувати» (тому нотатки вище важливі).

---

## Шпаргалка

```bash
npm run doctor          # перевірка залежностей
npm run build:preview   # збірка для своїх пристроїв (eas device:create)
npm run build:ios       # продакшн-збірка
npm run submit:ios      # відправити в App Store Connect
eas env:list production # які змінні піде в збірку
```

---

## Куди поділись розділи потоків v1.3 (W1 до W5)

Тут були чернетки текстів і нотаток для рецензента по потоках W1 до W5 (v1.3).
Їх прибрано 7 жовтня 2026: усе вже лежить в основних розділах, а самі блоки
суперечили їм. Вони писали про v1.3 як про оновлення («NEW IN THIS VERSION»,
«Sharing as a sticker (v1.3)»), хоча 1.0.0 це перша версія; W3 «замінював»
блок нотаток, і вставити не той блок було легко; W3 казав, що перед камерою є
аркуш згоди на AI (прапорець `AI_CONSENT_SHEET` вимкнено); W5 називав пункт
«Words per day», а в застосунку «Words a day». Де що тепер:

| Потік | Що було | Де тепер |
|---|---|---|
| W1 Сканер, «Навчання», серія 2.0 | рядки «What's New», нагадування про серію, ліхтарик | нотатки для рецензента (PERMISSIONS: нагадування про серію, правило 4.5.4; ліхтарик камери окремого дозволу не просить); «What's New» для 1.0.0 не потрібен |
| W2 Віджети й Pro «кілька слів на день» | рядки описів про віджети й слова дня | описи локалей (розділ «REMEMBER WHAT YOU SCAN» і «FREE AND PRO»); нотатки (WIDGETS, FREE VS PRO) |
| W3 Онбординг 3.0 | блок `ONBOARDING (...)` у нотатках | нотатки, HOW TO TEST, крок 1 (онбординг описано коротко, потрібно лише знати, що його можна пропустити). Секція «Розробка» в Параметрах існує лише в `__DEV__`: у збірці для App Store її немає, у нотатках її не згадуємо |
| W4 Наліпки без тла | абзац «SHARE THE BEST FINDS», нотатки про PHPicker | описи локалей; нотатки (PERMISSIONS, SHARING). App Privacy без змін: обране фото тлом і кадр скану не залишають телефон, PNG наліпки лишається на пристрої |
| W5 (v1.3 · W5) Pro: теми, пейвол, умови тарифів | абзац «FREE AND PRO», описи покупок, нотатки про теми | описи локалей («FREE AND PRO»); таблиця «Покупки на сторінці»; нотатки (FREE VS PRO, PAYWALL, у кроці 3 Pro-налаштування); чекліст «Pro-теми, віджети, наліпки»; ідея кадру з темами: розділ «Скріншоти» |
