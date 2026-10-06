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
- Продакшн-збірка **сама зупиниться**, якщо в оточенні `production` немає
  ключа RevenueCat або там тестовий ключ `test_…`. RevenueCat прямо пише:
  застосунок із ключем Test Store в App Store подавати не можна. Як розкласти
  ключі по оточеннях — `USER_TODO.md`, крок 7.
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
- Ліміти: назва 2–30 символів, підзаголовок 30, ключові слова 100, промо-текст
  170, опис 4000.
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
en-US, es-MX і fr. Результат:

| Локаль | Назва | Підзаголовок | Ключові (символи, байти UTF-8) | Короткий варіант | Промо | Підписів |
|---|---|---|---|---|---|---|
| en-US | 28/30 | 25/30 | 96/100 (96 B) | — | 163/170 | 8 |
| uk | 28/30 | 28/30 | 94/100 (176 B) | 51 симв. / 95 B | 146/170 | 8 |
| en-GB | 30/30 | 23/30 | 95/100 (95 B) | — | 163/170 | 8 |
| es-MX | 30/30 | 26/30 | 93/100 (96 B) | — | 157/170 | 8 |
| fr-FR (банк) | 30/30 | 29/30 | 94/100 (94 B) | — | — | 0 |
| ko (банк) | 25/30 | 30/30 | 95/100 (95 B) | — | — | 0 |

**Українські ключові — символи чи байти?** Довідка Apple досі пише «100
bytes». Агенція локалізації ще у 2013 писала, що Apple перейшла на 100
символів для всіх мов, але це не підтверджено. Кирилиця в UTF-8 займає 2
байти на літеру: наш список — 94 символи, але 176 байт. **Встав основний
варіант у App Store Connect і подивись на лічильник.** Якщо він не пускає —
бери короткий варіант (95 байт).

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
• Streaks, levels and 27 achievements

SHARE THE BEST FINDS
Every word you scan becomes a sticker with no background: put it on your own photo in Instagram Stories, paste it into a chat or save it to Photos. A word, a whole scene or an achievement, or a clean 9:16 card if you prefer.

29 LANGUAGES
English, Spanish, German, French, Italian, Portuguese, Polish, Ukrainian, Japanese, Korean, Chinese and more. Nouns come with their article where it matters (die Tasse, la taza).

NO ACCOUNT NEEDED
Open the app and start scanning. Your words and progress stay on your phone. Want a backup? Sign in with Apple to keep your words in sync on all your iPhones. We never ask for your name or email. Photos are used only to recognise the object and are not stored on our servers. Anonymous usage statistics can be turned off in Settings.

FREE AND PRO
Free forever: your dictionary with no word limit, flashcards, quiz, one word of the day and all three widgets. Plus one free AI scan to try (one in total, not per day): an object or a whole room.
LinguaLens Pro: unlimited AI scans and room scans, all 29 languages, up to 5 words of the day at times you choose, and four color themes for the app and widgets (Ocean, Berry, Graphite, Cocoa). Choose monthly or yearly (the yearly plan may start with a free trial for eligible new subscribers), or Lifetime: a one-time purchase, not a subscription.
Payment is charged to your Apple ID at confirmation of purchase. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your Apple ID settings.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://<server>/privacy
```

**Підписи скріншотів** (8 кадрів: заголовок угорі кадру, під ним підрядок;
наліпки зі словами іспанською Іспанії, як голос es-ES застосунку: *la taza*).
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

**Ключові слова** (94 символи):
```
вчити,вивчення,лексика,словниковий,запас,дня,віджет,камера,наліпка,тренажер,мова,німецька,квіз
```
**Короткий варіант**, якщо лічильник рахує байти (95 байт):
```
вчити,вивчення,лексика,запас,дня,віджет,камера,мова
```

Що це складає: англійські слова, вчити англійські слова, вивчення
англійської, словник, фотословник, картки, лексика, словниковий запас,
слова дня, віджет, тренажер слів, німецька мова, вимова.
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
• Серія днів, рівні й 27 досягнень

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

**Підписи скріншотів** (8 кадрів, наліпки з англійськими словами й
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

**Description:** текст en-US, з британським написанням (recognise уже
так; «favourite», «colour», якщо додаси). З v1.3 у ньому є «color themes» —
тут пиши **«colour themes»**.

**Підписи скріншотів** (кадри ті самі, що в en-US, але на наліпках англійські
слова з перекладом українською, як бачить українець з англійським
телефоном, що вчить англійську; слова й вимова ті самі, що в uk: сервер
просить у моделі просто English, а голос застосунку en-US, лише в сітці
словника на місці американського «sneaker» окуляри; дати на кадрах 6 і 8
у британському порядку: «Tuesday 6 October», «6 Oct 2026»):

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
• Tres widgets gratis: la palabra del día con una frase de ejemplo (toca para ver la traducción en el propio widget), tus palabras con tus fotos y tu racha, en la pantalla de inicio y la de bloqueo
• Rachas, niveles y 27 logros

COMPARTE TUS HALLAZGOS
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

**Підписи скріншотів** (наліпки з англійськими словами й американською
вимовою, переклади мексиканською іспанською, інтерфейс іспанською; тиждень
на кадрі 7 з неділі, як на iPhone у Мексиці й США):

| # | Заголовок | Підрядок |
|---|---|---|
| 1 | Tómale foto y aprende inglés | Con pronunciación y un ejemplo de uso |
| 2 | Tu diccionario de fotos | Palabras de tu vida, en 29 idiomas |
| 3 | Tarjetas para no olvidar | Repasa cada palabra justo antes de olvidarla |
| 4 | Nombra todo en una sola foto · **PRO** | Cada objeto, con su nombre en inglés |
| 5 | Inglés para tu nivel | De A1 a C2, sin lo básico si ya avanzaste |
| 6 | Widget de la palabra del día | En tu pantalla de inicio y pantalla bloqueada |
| 7 | No rompas tu racha | Niveles y 29 logros por tu constancia |
| 8 | Comparte tus hallazgos | Stickers y tarjetas para Stories y chats |

«Nombra todo» замість «Tu cuarto entero»: у Мексиці «cuarto» означає
спальню, а на кадрі кухня. «Pantalla bloqueada» так зве цей екран iOS
іспанською; «pantalla de bloqueo» каже Android.

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

Для першої версії App Store Connect цього поля зазвичай не показує. Текст
знадобиться для першого оновлення. Правило 2.3.12: значні зміни треба
описати конкретно, загальне «виправлення помилок» — лише для дрібниць.

**v1.3** (рядки потоків W1, W2, W4, W5 — розділи нижче; онбординг бачать
лише нові люди, тож його тут немає):

en:
```
New in LinguaLens:
• Share as a sticker: no background, straight onto your photo in Instagram Stories. Or copy it into any chat and save it to Photos.
• Three widgets: Word of the Day (now in a large size, with an example sentence and the translation one tap away), My Words and Streak.
• A new scanner with a flashlight, the word language right on the camera and your latest sticker at hand.
• Your streak comes alive: the flame grows every day and catches fire on day seven, and the first thing you learn each day gets a small celebration.
• Flashcards and the quiz are visible from the start, with a clear way to unlock them.
• LinguaLens Pro adds four color themes and up to 5 words of the day at times you choose.
Something not working? Settings → Contact support. We answer every message.
```
uk:
```
Нове в LinguaLens:
• Ділися наліпкою: без тла, просто на твоє фото в Instagram Stories. Або скопіюй у будь-який чат і збережи у «Фото».
• Три віджети: «Слово дня» (тепер і великий, з реченням і перекладом за один дотик), «Мої слова» і «Серія».
• Новий сканер: ліхтарик, вибір мови просто на камері, наліпка останнього слова.
• Серія тепер живе: вогник росте щодня й розгоряється на сьомий, а перша дія дня стає маленьким святом.
• Картки й квіз видно з першого запуску, і ясно, як їх відкрити.
• LinguaLens Pro тепер має чотири кольорові теми й до 5 слів дня о годинах, які обереш.
Щось не так? Параметри → «Написати в підтримку». Відповідаємо на кожен лист.
```

### Покупки на сторінці (Promoted In-App Purchases)

Покупки можуть з'являтися в пошуку й на сторінці застосунку (до 20 одночасно).
Apple радить писати тривалість у назві підписки. Ліміти: назва 30, опис 45.

| Продукт | Назва en | Опис en | Назва uk | Опис uk |
|---|---|---|---|---|
| Місяць | LinguaLens Pro (1 Month) (24) | Unlimited scans, 29 languages, color themes (43) | LinguaLens Pro (1 місяць) (25) | Безлімітні скани, 29 мов, кольорові теми (40) |
| Рік | LinguaLens Pro (1 Year) (23) | Unlimited scans, 5 words a day, color themes (44) | LinguaLens Pro (1 рік) (22) | Скани без ліміту, 5 слів на день, теми (38) |
| Назавжди | LinguaLens Pro (Lifetime) (25) | Pay once: unlimited scans and color themes (42) | LinguaLens Pro назавжди (23) | Один платіж: скани без ліміту й теми (36) |

v1.3: описи з кольоровими темами й словами дня (розділ W5 нижче); назви без змін.

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
| Вікова категорія | анкету проходь чесно: насильства, контенту для дорослих, чатів і реклами немає, тож очікувано 4+ |
| Ціна застосунку | Free (заробляємо на Pro) |
| Ціни покупок | місяць $9.99, рік $59.99 (7 днів безкоштовно), «Назавжди» $129.99; Україна — ті самі долари, вручну (рішення 5 жовтня 2026; `USER_TODO.md`, крок 3; країни — `MONETIZATION.md`, розділ 7). У текстах сторінки сум немає — App Store показує їх сам у місцевій валюті |
| Шифрування | не питатиме: `ITSAppUsesNonExemptEncryption: false` уже в `app.json` |
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
  id чи Apple ID. IDFA й IDFV PostHog не читає.
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
  Location → Analytics → Not linked.**
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

> **Відкрите питання — атрибуція Apple Ads.** Застосунок вмикає в RevenueCat
> збір токена атрибуції Apple Ads (AdServices): так RevenueCat бачить, з якої
> кампанії Apple Ads прийшла установка. Для цього не потрібна згода ATT, але
> наше дослідження не перевіряло, чи це вимагає окремого рядка в анкеті
> (наприклад, Usage Data → Advertising Data). Перед подачею перевір документацію
> RevenueCat про App Privacy або скажи мені — подивлюся.

Відповіді мають збігатися з політикою приватності (`server/public/privacy.html`,
сторінка `/privacy`). Якщо щось у застосунку зміниться, онови обидва.

---

## Нотатки для рецензента (App Review Information → Notes)

Sign-in required: **No** (поля логіна залиш порожніми): вхід через Apple
необов'язковий, рецензент може пройти все без нього. Правило 2.3.1(a) вимагає
конкретно описати всі функції й зміни; віддалені перемикачі пейволу ми теж
описуємо (наше рішення — так безпечніше, ніж пояснюватись після відмови).
Перед вставкою звір назви кнопок із релізною збіркою англійською. Текст
англійською:

```
Signing in is optional. On first launch the app silently registers a random anonymous ID with our server; no personal data is requested, and every feature works without an account.

ONBOARDING (first launch, about 2 minutes; every optional question has Skip, and Back works on the question and explanation steps):
1. "Which language are you learning?": the card on top is the person's native language (translations and examples are in it), preselected from the device language and changeable; below it the learning language is picked from 29 languages (search included).
2. Optional questions, in this order: what to call you (the name stays on the device and is never sent anywhere), where you heard about us, goals, field (only for work or study), level on a 1–10 slider, and what gets in the way. A shorter variant of onboarding (an A/B test) asks only where you heard about us, goals, field and level.
3. "How it works": one screen explains the word of the day; then a notification pre-permission screen where the person picks when the word of the day arrives (morning, afternoon or evening) with a single "Next" button that opens the iOS prompt (shown only if iOS has not asked yet; if declined, one screen explains how to turn notifications on later); then a personal plan with today's word of the day, an interactive streak preview (no data is created) and, on devices that support widgets, a preview of the Home Screen widgets with how to add them.
4. "Try it": a short animated demo of a scan, first one object, then a whole scene (no camera, drawn in the app; Reduce Motion shows two still frames). "Try it" opens the real camera; iOS asks for camera access first. The photo is sent to our server and to a third-party AI service (Google Gemini or Anthropic) only to recognise the object and is not stored, as the Privacy Policy describes (linked in Settings and on the subscription screen). "Later" skips the scan. If the camera is not allowed, onboarding simply continues.
5. After a scan: a short celebration with the person's own sticker, then a commitment screen: press and hold the ring for 1.5 s (with VoiceOver or Reduce Motion, a single tap works).
6. Subscription offer (only for people without Pro): three short screens: the free trial (with the sticker the person just made), a timeline with a reminder 2 days before the trial ends, then the plan picker with prices from the App Store, the billed amount, trial terms, Terms of Use, Privacy Policy and Restore Purchases. Every screen has a close (X) button, and "Continue for free" goes to the app without purchase.
Settings → "Go through the intro again" replays onboarding without the subscription offer.

FREE VS PRO:
• Free forever: the dictionary with no word limit, flashcards with spaced repetition, quiz, a personalised word of the day with notification, all three widgets, sharing as stickers or cards, optional Sign in with Apple sync, one learning language, and exactly 1 free AI scan in total (not per day). That one free scan can be a single object or one room ("Scene") scan. The scan during onboarding uses it. A failed scan (no object recognised, network error) does not use it.
• LinguaLens Pro: unlimited AI scans, unlimited room scans, all 29 learning languages, up to 5 words of the day at hours the user picks, and four color themes (Ocean, Berry, Graphite, Cocoa) for the app and its widgets. Plans: monthly or yearly auto-renewable subscriptions (the yearly plan may start with a 7-day free trial for eligible users) and Lifetime, a one-time non-consumable purchase.

NEW IN THIS VERSION (Pro additions; nothing that was free became paid):
• Color themes are cosmetic and sold as part of LinguaLens Pro. The default look "Chalk" (light, dark or automatic) stays free. Settings → Theme → Palette: without Pro, tapping a palette with a crown opens the paywall with a live preview of that palette; nothing changes until a purchase. After a Sandbox purchase the app switches to the previewed palette at once. Widgets use the same palette and stay free for everyone.
• Words of the day: one word a day stays free. Pro can choose 3 or 5 words a day, each at an hour the user picks (Settings → Word of the day → Words a day; 3 and 5 open the paywall without Pro). What we sell is extra learning content (more words), not the ability to send notifications.
• The paywall comparison table lists exactly these terms. There is no word limit, no quiz limit and no streak feature for sale.

HOW TO TEST:
1. Complete or skip onboarding; close the subscription offer with X or "Continue for free".
2. Point the camera at any everyday object (a cup, a keyboard, a plant) and tap the shutter. The object's name appears in the language being learned (Spanish by default on an English-language device, English otherwise; change it in Settings → I'm learning). Recognition needs an internet connection. Tap Save: the word appears in the Words tab and in Learn (flashcards and quiz). If you already scanned an object during onboarding, that was your 1 free scan, and this step opens the paywall instead (see steps 3–4).
3. Every scan after the free one (the same day, the next day or later) opens the paywall before anything is uploaded. The paywall also opens from the "Scene" mode in the scanner once the free scan is used, when adding a second learning language, and from Settings → Get Pro.
4. To keep testing scanning, buy any plan with a Sandbox Apple Account: after the purchase, object and room scans are unlimited. Restore Purchases is on the paywall and in Settings. With Pro, Settings → Manage subscription opens the subscription management screen.
5. Tap Share on a scan result or a word card: the sheet opens with the word as a transparent sticker; Copy, Save and More (the standard iOS share sheet) are below it, and the Card tab makes a 9:16 image.
6. Settings → Theme → Palette → tap "Berry" → the paywall shows a preview in Berry; tap the color dots to preview other palettes; close with X, and the app stays in Chalk.
7. Buy any plan with a Sandbox Apple Account from that paywall: the app switches to the palette you previewed. Settings → Theme then changes palettes instantly, in light and dark.
8. Settings → Word of the day → Words a day → 5: without Pro this opens the paywall; with Pro, pick an hour for each word.

REMOTE CONFIGURATION (no code is downloaded): through RevenueCat offering metadata we can switch (a) whether the subscription offer is shown at the end of onboarding and (b) whether paywalls use our in-app screen or a RevenueCat paywall designed in our RevenueCat dashboard. Both paywalls show the billed amount as the main price, trial length and what happens after it, Terms of Use, Privacy Policy, Restore Purchases and a close button. For this review both switches are set to the defaults described above (offer shown, in-app screen).

Sharing as a sticker (v1.3): the Share sheet now makes a transparent PNG sticker of a word, a scene or an achievement. "Copy" puts the PNG on the pasteboard; "Save" adds it to Photos and asks only for add-only Photos access (NSPhotoLibraryAddUsageDescription). "Or pick a photo from your library" opens the system photo picker (PHPicker), which needs no Photos permission: the app receives only the one photo the person picks, uses it as the Instagram Stories background and deletes its temporary copy right after. LinguaLens never asks for read access to the photo library; NSPhotoLibraryUsageDescription is present only because the photo picker and Photos frameworks reference it. Instagram buttons appear only when Instagram is installed; without it the sheet offers Copy, Save and the system share sheet.

Widgets (v1.3): LinguaLens has three Home Screen and Lock Screen widgets: Word of the Day, My Words and Streak. All of them are free and contain no ads or purchase prompts. Open the app once, then long-press the Home Screen → Edit → Add Widget → LinguaLens. On iOS 17+ the "Translation" button inside the Word of the Day and My Words widgets reveals the translation without opening the app (an App Intent that only updates the widget); this can be turned off in Settings → Widgets. On the Lock Screen the translation is always shown.
Pro "words of the day": with LinguaLens Pro a person can get 3 or 5 words of the day at hours they pick (Settings → Word of the day → Words a day). Without Pro, choosing 3 or 5 opens the paywall; the first word of the day is the same for free and Pro users.

Streak reminder (v1.3): one local notification at 8 pm, only when the user's own learning streak (2+ days) would end that night and nothing was practiced today. It reminds the user of their own progress, contains no advertising, and can be turned off in Settings → Streak → Streak reminders (Guideline 4.5.4). The new flashlight button in the scanner uses the existing camera permission; no new permissions were added for it.

ANALYTICS: anonymous usage statistics (PostHog, EU servers) with a random install ID: no IDFA, no tracking, no App Tracking Transparency prompt, no screen recording. It can be turned off in Settings.

OPTIONAL ACCOUNT (Sign in with Apple):
• Sign in with Apple is the only sign-in method in the app; there is no third-party or email login (Guideline 4.8). We request no name and no email (empty scope).
• Settings → Account → Sign in with Apple backs up the word list and syncs it between the person's iPhones. To test sync: sign in on two devices with the same Apple Account, save a word on one, then open the app (or tap Sync now) on the other.
• Sign out (Settings → Account) clears the device; the words stay in the account and come back after signing in again.

Data and account deletion (Guideline 5.1.1(v)): Settings → Data → Erase all my data removes the server record and all data on the device. For a signed-in user it also deletes the account and the synced word list from our server and revokes the Sign in with Apple token.

Offline: scanning shows an explanatory message; the dictionary, flashcards and quiz keep working.

Contact: <your email>
```

**Ризик 5.1.2(i): аркуша згоди на AI немає (рішення власника 5.10.2026).**
Правило 5.1.2(i) вимагає прямо сказати, що дані йдуть стороннім AI-сервісам,
і **спитати дозволу до** передачі. Аркуш «Перед першим сканом»
(`src/ConsentSheet.js`) це робив, але псував перший скан, тож його вимкнено
прапорцем `AI_CONSENT_SHEET = false` у `src/flags.js`. Куди йде фото, чесно
сказано в політиці приватності (`/privacy`, розділи «Коротко» і «Кадр із
камери») і в нотатках вище (крок 4). Ризик відмови — реальний: рецензент
може відповісти чимось на кшталт «Guideline 5.1.2 — Legal — Privacy — Data
Use and Sharing» і попросити згоду в застосунку.

Якщо так сталося — нічого переписувати не треба:
1. `src/flags.js`: `export const AI_CONSENT_SHEET = true;` — аркуш
   повертається в сканер і на демо онбордингу (до камери), як у v1.3; рядки
   `aiConsent*` уже перекладені.
2. `npx jest` (тести обох станів уже є), нова збірка `npm run build:ios`.
3. У нотатках вище, крок 4, речення про фото заміни на: `before the first
   scan the app explains that the photo is sent to our server and to a
   third-party AI service (Google Gemini or Anthropic) only to recognise the
   object, and asks for permission (Allow / Not now); nothing is uploaded
   before Allow, and only then iOS asks for camera access.`
4. У Resolution Center відповідай коротко: «The app now asks for explicit
   permission before the first photo is sent to the AI service (Allow / Not
   now), in the scanner and in onboarding. Build N.» і відправ нову збірку.

---

## Перевірка перед «Submit for Review»

**Акаунти й налаштування**
- [ ] App Store Connect → Business: **Paid Apps Agreement** активна, банк і податки заповнені
- [ ] Заявка в **Small Business Program** подана
- [ ] Група підписок «LinguaLens Pro»: місячна й річна в статусі **Ready to Submit** (назва, опис en/uk, скріншот пейволу для рецензента); на річній — Introductory Offer → Free trial, 1 week
- [ ] Разова покупка «Назавжди» (Non-Consumable) — **Ready to Submit**
- [ ] **Billing Grace Period** увімкнено (16 днів, All Renewals, Production and Sandbox)
- [ ] RevenueCat: entitlement **`lingualens_pro`** з усіма трьома продуктами; offering `default` позначений **Current**, пакети `$rc_monthly`, `$rc_annual`, `$rc_lifetime`; метадані `{"onboarding_paywall":"show","paywall_ui":"custom"}`
- [ ] RevenueCat → вебхук на `/webhooks/revenuecat`, тестова подія дає `200`
- [ ] RevenueCat → інтеграція Apple Search Ads увімкнена (атрибуція)
- [ ] PostHog (проєкт у ЄС): IP відкидається, GeoIP вимкнено, флаг/експеримент `onboarding-flow` створено (без нього застосунок просто бере `control`)
- [ ] Ключові слова перевірені в Astro/AppSprint, скрипт повторів — зелений

**Сервер**
- [ ] `/health` → `"store":"firestore"` (не `file`!) і потрібний провайдер
- [ ] `REVENUECAT_ENTITLEMENT` не задано або дорівнює `lingualens_pro`
- [ ] `/privacy` відкривається, є розділ про анонімну статистику, у «Контактах» твоя пошта, а не плейсхолдер
- [ ] Платний тариф Gemini або ключ Anthropic
- [ ] Бюджетний алерт у Google Cloud

**Збірка**
- [ ] `eas env:list production`: `EXPO_PUBLIC_SERVER_URL`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (**`appl_…`, не `test_…`** — інакше збірка зупиниться сама), `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_SUPPORT_EMAIL`, а також `EXPO_PUBLIC_APP_TOKEN`, якщо на сервері задано `APP_TOKEN`
- [ ] `eas.json` → `submit.production.ios`: справжні `ascAppId` і `appleTeamId`
- [ ] Перевір пошту після завантаження білда: якщо Apple пише про Privacy Manifest (`ITMS-91053`), напиши мені — додамо декларацію

**TestFlight (на справжньому iPhone)**
- [ ] Увесь чеклист із `TESTING.md`
- [ ] Онбординг від початку до кінця і з пропуском кожного питання; ім'я не потрапляє ні на сервер, ні в PostHog (Activity → Events)
- [ ] Перший скан — і з демо онбордингу, і у вкладці — одразу камера й результат, без аркуша «Перед першим сканом» (`AI_CONSENT_SHEET = false`, див. «Ризик 5.1.2(i)»)
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

**Сторінка**
- [ ] Локалі en-US, uk, en-GB, es-MX, fr (банк) і ko (банк) заповнені за розділом ASO; **російської локалі немає**
- [ ] Скріншоти відповідають реальному застосунку, без цін
- [ ] App Privacy заповнено за таблицею вище
- [ ] Privacy Policy URL і Support URL відкриваються
- [ ] Місячна, річна й «Назавжди» прикріплені до версії
- [ ] In-App Event прикріплений до тієї ж подачі
- [ ] Обрано **Manually release this version**
- [ ] Нотатки для рецензента вставлено (там сказано: 1 безкоштовний скан, далі пейвол, sandbox-покупка знімає ліміт), пошта вказана

**v1.3**
- [ ] Сервер розгорнуто **до** TestFlight: `POST /word-of-day` приймає `perDay` (W2), `/privacy` має речення про фото тлом для Stories (W4)
- [ ] `node scripts/check-dev-assets.js` — у релізному експорті немає тестового фото симулятора
- [ ] Meta App ID у `EXPO_PUBLIC_FACEBOOK_APP_ID` (`USER_TODO.md`, крок 10): інакше в аркуші «Поділитися» немає кнопок Instagram
- [ ] RevenueCat → offering `default` → metadata `onboarding_paywall`: `"show"` (типово, і так само без ключа) чи `"skip"` — обране на запуск
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
- [ ] Шаблон RevenueCat (`paywall_ui: "revenuecat"`), якщо ввімкнений: у
      його текстах немає ліміту слів чи захисту серії; палітри названі так
      само, як у застосунку

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

## v1.3 · Розділи потоків

Нижче — тексти й нотатки для рецензента до v1.3; кожен потік пише лише
під своїм заголовком.

**Інтеграція (C6) уже перенесла їх в основні розділи вище**: описи en-US,
en-GB (через en-US), uk, es-MX («SHARE THE BEST FINDS», віджети, «FREE AND
PRO»), «What's New», описи покупок на сторінці, нотатки для рецензента
(онбординг 3.0, «NEW IN THIS VERSION», кроки 5–8, наліпки, віджети,
нагадування про серію) і список перед подачею. Розділи нижче лишаються як
джерело й пояснення.

## v1.3 · W1 Сканер, «Навчання», серія 2.0

**Що нового (рядки для «What’s New»):**
- uk: «Новий сканер: ліхтарик, вибір мови просто на камері, наліпка
  останнього слова. Серія тепер живе: вогник росте щодня й розгоряється на
  сьомий, а перша дія дня стає маленьким святом. Картки й квіз видно з
  першого запуску, і ясно, як їх відкрити.»
- en: “A new scanner with a flashlight, the word language right on the
  camera and your latest sticker at hand. Your streak comes alive: the
  flame grows every day and catches fire on day seven, and the first
  thing you learn each day gets a small celebration. Flashcards and the
  quiz are visible from the start, with a clear way to unlock them.”

**Notes for Review (додати до наявних):**
- Streak reminder: one local notification at 8 pm, only when the user’s
  own learning streak (2+ days) would end that night and nothing was
  practiced today. It reminds the user of their own progress, contains no
  advertising, and can be turned off in Settings → Streak → Streak
  reminders (Guideline 4.5.4).
- The flashlight button uses the existing camera permission; no new
  permissions were added.

## v1.3 · W2 Віджети й Pro «кілька слів на день»

Інтеграція вставляє ці рядки в описи вище (замість нинішніх рядків про
віджет) і зводить рядок Pro з текстами W5 (теми).

**Опис — пункт про слово дня й віджети** (замість «A word of the day with a
reminder… plus a widget…»):

| Мова | Текст |
|---|---|
| en | • Three free widgets for the Home Screen and the Lock Screen: the word of the day with an example sentence (tap to reveal the translation right in the widget), your own words with the photos you took, and your streak |
| uk | • Три безкоштовні віджети для головного екрана й екрана блокування: слово дня з реченням (переклад відкривається дотиком просто у віджеті), твої слова з фото, які ти зняв сам, і серія |
| de | • Drei kostenlose Widgets für Home- und Sperrbildschirm: das Wort des Tages mit Beispielsatz (Übersetzung per Tippen direkt im Widget), deine eigenen Wörter mit deinen Fotos und deine Serie |
| es | • Tres widgets gratis: la palabra del día con una frase de ejemplo (toca para ver la traducción en el propio widget), tus palabras con tus fotos y tu racha, en la pantalla de inicio y la de bloqueo |

**Рядок «Free forever …»**: «the word of the day and the widget» →
«the word of the day and all three widgets» (uk: «слово дня й усі три
віджети»; de: «das Wort des Tages und alle drei Widgets»; es: «la palabra
del día y los tres widgets»).

**Рядок Pro** — додати до переліку переваг Pro (поруч із темами W5):
en «up to 5 words of the day, at the times you choose»; uk «до 5 слів дня
на день, о годинах, які обереш»; de «bis zu 5 Wörter des Tages, zu
Uhrzeiten deiner Wahl»; es «hasta 5 palabras del día, a las horas que
elijas».

**Що нового у v1.3 (рядок про віджети)**:
- en: Three widgets: Word of the Day (now in a large size, with an example sentence and the translation one tap away), My Words and Streak.
- uk: Три віджети: «Слово дня» (тепер і великий, з реченням і перекладом за один дотик), «Мої слова» і «Серія».

**Скриншот** (за бажанням, слот 4 «Віджет»): головний екран з великим
«Словом дня» і малими «Серія» й «Мої слова» (макет
`v13/mockups/widgets-phone-home-lock.png`).

**Нотатки для рецензента — додати абзац:**
```
Widgets (v1.3): LinguaLens has three Home Screen and Lock Screen widgets — Word of the Day, My Words and Streak. All of them are free and contain no ads or purchase prompts. Open the app once, then long-press the Home Screen → Edit → Add Widget → LinguaLens. On iOS 17+ the "Translation" button inside the Word of the Day and My Words widgets reveals the translation without opening the app (an App Intent that only updates the widget); this can be turned off in Settings → Widgets. On the Lock Screen the translation is always shown.
Pro "words of the day": with LinguaLens Pro a person can get 3 or 5 words of the day at hours they pick (Settings → Word of the day → Words a day). Without Pro, choosing 3 or 5 opens the paywall; the first word of the day is the same for free and Pro users.
```

## v1.3 · W3 Онбординг 3.0 і скидання для розробки

**Нотатки для рецензента.** На злитті (C6) блок `ONBOARDING (...)` у Review
Notes вище замінюється цим текстом; решта нотаток не змінюється.

```
ONBOARDING (first launch, about 2 minutes; every optional question has Skip, and Back works on the question and explanation steps):
1. "Which language are you learning?" — the translation language is preselected from the device language and can be changed; the learning language is picked from 29 languages (search included).
2. Optional questions: what to call you (the name stays on the device and is never sent anywhere), goals, field (only for work or study), level on a 1–10 slider, what gets in the way, and where you heard about us. The app then shows a personal plan with today's word of the day.
3. "How it works": an interactive streak preview (no data is created), a notification pre-permission screen with a single "Next" button that opens the iOS prompt (shown only if iOS has not asked yet; if declined, one screen explains how to turn notifications on later), and — on devices that support widgets — a preview of the Home Screen widgets with how to add them.
4. "Try it": a short animated demo of a scan (no camera, drawn in the app; Reduce Motion shows three still frames). "Try it" opens the real camera: before the first scan the app explains that the photo is sent to our server and to a third-party AI service (Google Gemini or Anthropic) only to recognise the object, and asks for permission (Allow / Not now); nothing is uploaded before Allow, and only then iOS asks for camera access. "Later" skips the scan. If the camera is not allowed, onboarding simply continues.
5. After a scan: a short celebration with the person's own sticker, then a commitment screen: press and hold the ring for 1.5 s (with VoiceOver or Reduce Motion, a single tap works).
6. Subscription offer (only for people without Pro): three short screens — the free trial (with the sticker the person just made), a timeline with a reminder 2 days before the trial ends, then the plan picker with prices from the App Store, the billed amount, trial terms, Terms of Use, Privacy Policy and Restore Purchases. Every screen has a close (X) button, and "Continue for free" goes to the app without purchase.
Settings → "Go through the intro again" replays onboarding without the subscription offer.
```

- Перед системним запитом сповіщень — екран із єдиною кнопкою «Далі»
  (не «Дозволити»): так вимагає 5.1.1(iv) / HIG для пре-пермішн екранів.
  Відмова нічого не ламає: є екран «Гаразд, без нагадувань».
- Згода на AI (5.1.2(i)) — до камери й до будь-якого завантаження, як і
  в v1.2; кнопка «Не зараз» лишає людину на демо. З 5.10.2026 аркуш
  вимкнено (`AI_CONSENT_SHEET`) — див. «Ризик 5.1.2(i)» після нотаток.
- Секція «Розробка» («Почати з нуля», «Онбординг як новий», «Онбординг
  на кожному старті») існує лише в `__DEV__`: у збірці для App Store її
  немає, і код стирання там нічого не робить. У нотатках її не згадуємо.
- **Скріншоти.** Демо скану (стіл, чашка, наліпка, табличка «mug —
  чашка», вогник) і свято першого слова з наліпкою — найсильніші кадри
  для 2–3 скріншота: це справжні екрани застосунку, без макетів.
  Перемикач «Онбординг на кожному старті» в dev build дає пройти кадри
  кілька разів поспіль без стирання даних.

## v1.3 · W4 Наліпки без тла: Stories, «Копіювати», «Зберегти»

Інтеграція вставляє ці рядки в описи вище замість нинішніх рядків про
картки 9:16.

**Опис — блок «SHARE THE BEST FINDS»** (замість «Turn a word, a scene, an
achievement or your week into a clean 9:16 card…»):

| Локаль | Текст |
|---|---|
| en (U.S., U.K.) | Every word you scan becomes a sticker with no background: put it on your own photo in Instagram Stories, paste it into a chat or save it to Photos. A word, a whole scene or an achievement, or a clean 9:16 card if you prefer. |
| uk | Кожне відскановане слово стає наліпкою без тла: поклади її на своє фото в Instagram Stories, встав у чат чи збережи у «Фото». Слово, ціла сцена чи досягнення або охайна картка 9:16, якщо так зручніше. |
| es (México) | Cada palabra que escaneas se convierte en una pegatina sin fondo: ponla sobre tu propia foto en Instagram Stories, pégala en un chat o guárdala en Fotos. Una palabra, una escena entera o un logro, o una tarjeta 9:16 si lo prefieres. |

**Що нового у v1.3 (рядок про наліпки):**
- en: Share as a sticker: no background, straight onto your photo in Instagram Stories. Or copy it into any chat and save it to Photos.
- uk: Ділися наліпкою: без тла, просто на твоє фото в Instagram Stories. Або скопіюй у будь-який чат і збережи у «Фото».

**Скриншот** (за бажанням, слот «Поділитися»): аркуш з наліпкою чашки на
шахівниці й кнопкою «Stories із цим фото» поруч зі Stories, де ця наліпка
лежить на фото (макети `v13/mockups/share-sheet-uk.png`,
`share-stories-uk.png`; знімки екрана — з телефона з Instagram).

**App Privacy — без змін.** Обране фото тлом і кадр скану не залишають
телефон (їх отримує лише Instagram після дотику людини), PNG наліпки
лишається на пристрої; нічого з цього ми не збираємо.

**Нотатки для рецензента — додати абзац:**
```
Sharing as a sticker (v1.3): the Share sheet now makes a transparent PNG sticker of a word, a scene or an achievement. "Copy" puts the PNG on the pasteboard; "Save" adds it to Photos and asks only for add-only Photos access (NSPhotoLibraryAddUsageDescription). "Or pick a photo from your library" opens the system photo picker (PHPicker), which needs no Photos permission: the app receives only the one photo the person picks, uses it as the Instagram Stories background and deletes its temporary copy right after. LinguaLens never asks for read access to the photo library; NSPhotoLibraryUsageDescription is present only because the photo picker and Photos frameworks reference it. Instagram buttons appear only when Instagram is installed; without it the sheet offers Copy, Save and the system share sheet.
```

## v1.3 · W5 Pro: кольорові теми, пейвол, умови тарифів

Умови після v1.3 — `MONETIZATION.md`, розділ 1: ліміти сканів без змін, ціни
нові ($9.99 / $59.99 / $129.99, рішення 5 жовтня 2026 — тексти сторінки сум
не називають, тож їх не чіпаємо), Pro **додає** 4 кольорові палітри (Океан,
Ягода, Графіт, Какао) і 3 або 5 слів дня на день о годинах людини. Нічого, що було безкоштовним, платним не
стало: словник без ліміту слів, картки, квіз, слово дня (одне на день) і всі
віджети. Ліміту колекції й захисту серії в v1.3 немає — ні в застосунку, ні в
текстах сторінки.

### Опис: абзац «FREE AND PRO» (заміни ним наявний у трьох описах)

Сума списання й умови підписки — без змін (3.1.2). Після заміни перевір, що
повний опис укладається в 4000 символів (абзац довший на ≈ 150).

en:
```
FREE AND PRO
Free forever: your dictionary with no word limit, flashcards, quiz, one word of the day and all three widgets. Plus one free AI scan to try (one in total, not per day): an object or a whole room.
LinguaLens Pro: unlimited AI scans and room scans, all 29 languages, up to 5 words of the day at times you choose, and four color themes for the app and widgets (Ocean, Berry, Graphite, Cocoa). Choose monthly or yearly (the yearly plan may start with a free trial for eligible new subscribers), or Lifetime: a one-time purchase, not a subscription.
```

uk:
```
БЕЗКОШТОВНО І PRO
Назавжди безкоштовно: словник без ліміту слів, флешкартки, квіз, слово дня й усі три віджети. А ще один безкоштовний AI-скан на пробу (один загалом, а не щодня): предмет або ціла кімната.
LinguaLens Pro: AI-скани й скани кімнат без ліміту, усі 29 мов, до 5 слів дня о годинах, які обереш, і чотири кольорові теми для застосунку й віджетів (Океан, Ягода, Графіт, Какао). Обери місяць чи рік (річний може починатися з безкоштовного пробного періоду для нових підписників) або «Назавжди»: один платіж, не підписка.
```

es (México):
```
GRATIS Y PRO
Gratis para siempre: tu diccionario sin límite de palabras, tarjetas, quiz, una palabra del día y los tres widgets. Además, 1 escaneo con IA gratis para probar (uno en total, no al día): un objeto o un cuarto entero.
LinguaLens Pro: escaneos con IA y de cuartos ilimitados, los 29 idiomas, hasta 5 palabras del día a las horas que elijas y cuatro temas de color para la app y los widgets (Océano, Baya, Grafito, Cacao). Elige plan mensual o anual (el anual puede empezar con una prueba gratuita para nuevos suscriptores elegibles) o Lifetime: un pago único, no una suscripción.
```

Назви палітр — ті самі, що в застосунку (`palette_*` у `src/strings/pro.js`).

### Покупки на сторінці (Promoted In-App Purchases): нові описи

Назви без змін; описи (≤ 45 символів, у дужках — довжина):

| Продукт | Опис en | Опис uk |
|---|---|---|
| Місяць | Unlimited scans, 29 languages, color themes (43) | Безлімітні скани, 29 мов, кольорові теми (40) |
| Рік | Unlimited scans, 5 words a day, color themes (44) | Скани без ліміту, 5 слів на день, теми (38) |
| Назавжди | Pay once: unlimited scans and color themes (42) | Один платіж: скани без ліміту й теми (36) |

Опис підписки в App Store Connect (група «LinguaLens Pro») — так само: до
сканів і мов додай «color themes» / «кольорові теми». Скріншот пейволу для
рецензента зніми наново: у таблиці тепер «Слова дня 1 / до 5» і «Кольорові
теми ✕ / 4» (хрестик, позначка «нове»), а «Картки, квіз, віджети» — один рядок.

### Скріншоти сторінки (пропозиція)

Палітри видно щодня, тож вони варті одного кадру в другій половині набору
(не першого: перші три — скан, слово, звичка). Ідея кадру: три телефони з
«Навчанням» в Океані, Ягоді й Какао, підпис en «Make it yours: 4 color
themes with Pro» / uk «Твій колір: 4 теми в Pro». Знімай у застосунку з
Pro (імітація покупок у розробці або Sandbox), не малюй окремо: правило 2.3.3
вимагає показувати застосунок як він є.

### Нотатки для рецензента: що дописати

Встав після блоку «FREE VS PRO» і заміни ним рядок «LinguaLens Pro: …» там
(англійською; назви пунктів звір із релізною збіркою):

```
- LinguaLens Pro: unlimited AI scans, unlimited room scans, all 29 learning languages, up to 5 words of the day at hours the user picks, and four color themes (Ocean, Berry, Graphite, Cocoa) for the app and its widgets. Plans: monthly or yearly auto-renewable subscriptions (the yearly plan may start with a 7-day free trial for eligible users) and Lifetime, a one-time non-consumable purchase.

NEW IN THIS VERSION (Pro additions; nothing that was free became paid):
- Color themes are cosmetic and sold as part of LinguaLens Pro. The default look "Chalk" (light, dark or automatic) stays free. Settings → Theme → Palette: without Pro, tapping a palette with a crown opens the paywall with a live preview of that palette; nothing changes until a purchase. After a Sandbox purchase the app switches to the previewed palette at once. Widgets use the same palette and stay free for everyone.
- Words of the day: one word a day stays free. Pro can choose 3 or 5 words a day, each at an hour the user picks (Settings → Word of the day → Words per day; 3 and 5 open the paywall without Pro). What we sell is extra learning content (more words), not the ability to send notifications.
- The paywall comparison table lists exactly these terms. There is no word limit, no quiz limit and no streak feature for sale.

HOW TO TEST (Pro additions):
6. Settings → Theme → Palette → tap "Berry" → the paywall shows a preview in Berry; tap the color dots to preview other palettes; close with X — the app stays in Chalk.
7. Buy any plan with a Sandbox Apple Account from that paywall: the app switches to the palette you previewed. Settings → Theme then changes palettes instantly, in light and dark.
8. Settings → Word of the day → Words per day → 5: without Pro this opens the paywall; with Pro, pick an hour for each word.
```

Абзац «REMOTE CONFIGURATION» не змінюється: v1.3 не додає віддалених
перемикачів. Палітри й варіанти «слів на день» (3 і 5) зашиті в збірку
(`src/theme.js`, `src/flags.js`), верхню межу слів (5) тримає сервер — код не
завантажується (2.3.1(a), 2.5.2).

### Перевірка перед «Submit for Review» (додати до списку)

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
- [ ] Шаблон RevenueCat (`paywall_ui: "revenuecat"`), якщо ввімкнений: у
      його текстах немає ліміту слів чи захисту серії; палітри названі так
      само, як у застосунку
