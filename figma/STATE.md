# Figma: work status

**File:** https://www.figma.com/design/c5DX8UXHJUdO58fwjIRTFq
**fileKey:** `c5DX8UXHJUdO58fwjIRTFq`
**Plan:** Starter (`team::1408921808135707787`)

## Starter limits that shaped the structure

| Limit | Consequence |
|---|---|
| 1 mode per variable collection | Light and Dark are **two separate collections** with identical token names, not two modes of one. The theme is switched manually in the mockup. |
| 3 pages | `Foundations` (tokens + components), `Screens · Light`, `Screens · Dark`. There is no separate Components page. |
| MCP call limit | Build screens with large scripts, not one element at a time. |

---

## Design direction

**Warm chalk + one accent.** The accent was picked with an eyedropper from Lingo's skin
(`#6C6CCC` / `#8484E4`, periwinkle) and deepened to `#5B4FD6` for a contrast of
5.6:1 on the chalk background. The turquoise from the mascot's belly (`#0E8C82`) is **only** for
success states, not a second accent.

The background is never pure white: `#FAF8F4`. Shadows are warm (`rgba(92,79,61,·)`), not gray:
a gray shadow on a warm background looks dirty.

---

## Tokens (Foundations)

Collections `Color · Light` / `Color · Dark`, identical names:

| Token | Light | Dark |
|---|---|---|
| `bg` | `#FAF8F4` | `#151412` |
| `surface` | `#FFFFFF` | `#201F1C` |
| `surface-sunken` | `#F1EEE8` | `#2A2825` |
| `surface-raised` | `#E9E5DC` | `#35322E` |
| `text` | `#1C1B19` | `#F5F2EC` |
| `text-dim` | `#6E6A62` | `#A9A49B` |
| `text-faint` | `#A6A199` | `#757069` |
| `border` | `#E8E4DC` | `#302D29` |
| `accent` | `#5B4FD6` | `#9B8FFF` |
| `accent-soft` | `#E4E1FB` | `#221E45` |
| `on-accent` | `#FFFFFF` | `#100C2E` |
| `teal` / `teal-soft` | `#0E8C82` / `#E0F5F2` | `#3ED8CB` / `#123330` |
| `danger` / `danger-soft` | `#D2483F` / `#FBEAE8` | `#FF7A6E` / `#3A211E` |
| `warm` / `warm-soft` | `#E0A02E` / `#FBF1DF` | `#F0B84A` / `#372C15` |

`Spacing`: 2xs 4 · xs 8 · sm 12 · md 16 · lg 20 · xl 24 · 2xl 32 · 3xl 40
`Radius`: sm 10 · md 14 · lg 20 · xl 28 · pill 999

### Text styles (Nunito)

Tracking depends on the font size: a single value for all sizes is always wrong somewhere.

| Style | Size | Weight | Tracking | Leading |
|---|---|---|---|---|
| Display | 34 | ExtraBold | −0.75 | 38 |
| Title | 26 | ExtraBold | −0.36 | 31 |
| Headline | 19 | Bold | −0.11 | 25 |
| Body Strong | 16 | SemiBold | −0.10 | 22 |
| Body | 16 | Medium | −0.10 | 22 |
| Callout | 15 | Medium | 0 | 21 |
| Footnote | 13 | Medium | 0 | 18 |
| Caps | 11 | ExtraBold | +1.1 | 14 (UPPER) |
| Word | 40 | ExtraBold | −0.95 | 44 |
| IPA | 15 | Medium | +0.2 | 20 |
| Number | 28 | ExtraBold | −0.42 | 32 |

Shadows: `Shadow/sm` (10/4, 5%) · `Shadow/md` (24/10, 7%) · `Shadow/lg` (40/20, 10%).

---

## Component IDs (needed for `createInstance`)

| Component | Set | Variants |
|---|---|---|
| Mascot | `2:76` | wave `2:68` · celebrate `2:70` · think `2:72` · encourage `2:74` |
| Button | `4:12` | Primary `4:6` · Secondary `4:8` · Ghost `4:10` |
| Pill | `5:12` | Accent `5:2` (then in order: Teal, Warm, Danger, Neutral) |
| Input | `5:13` | - |
| TabBar | `5:15` | - |
| Icon | `6:46` | scan `6:5` · book `6:10` · cards `6:14` · user `6:18` · sliders `6:22` · speaker `6:26` · check `6:29` · chevron `6:32` · flame `6:35` · search `6:39` · plus `6:42` · close `6:45` |

---

## Screens

Frame size: **402 × 874** (iPhone 16 Pro). Status bar 54px, tab bar 84px.

| No. | Screen | Node ID | Status |
|---|---|---|---|
| 01 | Onboarding | `9:6` | ✅ |
| 02 | Learning (hub) | `8:18` | ✅ |
| 03 | Scanner | `10:32` | ✅ |
| 04 | Scan result | `10:70` | ✅ |
| 05 | Dictionary | `12:55` | ✅ |
| 06 | Dictionary · empty | `12:174` | ✅ |
| 07 | Flashcard | `12:228` | ✅ |
| 08 | Quiz | `14:115` | ✅ |
| 09 | Profile | `14:149` | ✅ |
| 10 | Settings | `14:253` | ✅ |
| 11 | Sign in | `14:355` | ✅ |

**Screens · Dark** has three key screens: Learning `15:165`, Dictionary `15:248`,
Profile `15:367`. They were made by cloning from the light page and re-binding
every variable to the same-named one from `Color · Dark`.

### What is on each screen

**03 Scanner.** A dark camera viewport across the full frame. Viewfinder corner brackets
(4 corners, stroke 2.5, accent). At the top, an `EN → UK` chip on frosted glass. At the bottom, above the
tab bar, a big shutter button (76px, white ring). A small Lingo `think` in the
corner as a hint.

**04 Scan result.** The same frame + a sheet from the bottom (radius 28 at the top,
`Shadow/lg`): the `Word` at 40px, IPA, the translation in `Headline`, the example in
`surface-sunken`, two actions: «Прослухати» (Listen; Secondary + speaker icon) and
«Зберегти» (Save; Primary). Lingo `celebrate` 80px at the top right of the sheet.

**05 Dictionary.** The title `Словник` (Dictionary) in Display, a search field (Input + search icon),
a list of rows: the word in `Body Strong` + the translation in `Footnote text-dim` + a Pill with the level
on the right, a `border` divider. Tab bar, active tab 1.

**06 Dictionary · empty.** Lingo `think` 200px in the center, `Ще нічого немає` (Nothing here yet)
in Title, a Callout caption, Primary «Сканувати перше слово» (Scan the first word).

**07 Flashcard.** A progress strip at the top (`surface-sunken` + `accent`), `3 / 12`
in Footnote in the center. A large card across the whole space: the `Word`, IPA, a round
speaker button. At the bottom two buttons: «Ще вчу» (Still learning; `danger-soft`/`danger`) and «Знаю»
(I know it; `teal-soft`/`teal`).

**08 Quiz.** A timer strip. `Питання 3 з 10` (Question 3 of 10) + a Pill «СЕРІЯ 4» (STREAK 4; warm + flame
icon). A card with the word. Four options as `surface` rows, radius 20; the correct one
is shown in `teal-soft`, the wrong one in `danger-soft`.

**09 Profile.** A hero card: Lingo `celebrate` 92px, the name in Title, the email in Footnote,
a level strip + `Рівень 4` (Level 4) / `12/18`. A segment «Статистика | Досягнення» (Statistics | Achievements).
A streak card (flame icon in `warm-soft`). Three mini cards: total words / this
week / reviews, with `Number` + `Caps`. A 7-day chart: `accent` bars,
labels `НПВСЧПС` (the Ukrainian weekday initials, Monday to Sunday).

**10 Settings.** The account row (Lingo 44px + name + email). Two languages:
rows with a flag and a chevron. «Слово дня» (Word of the Day): a toggle + hour chips 8/10/12/18/20.
Theme: two swatches, light and dark, the active one with a 2.5px `accent` border.
The «Вийти» (Sign out) button in `danger`, text only.

**11 Sign in.** Lingo `wave` 150px, the logo, a segment «Вхід | Реєстрація» (Sign in | Sign up),
two Inputs, Primary «Увійти» (Sign in), Ghost «Продовжити без акаунта» (Continue without an account).

---

## Next step

When the MCP limit resets, run one big script per pair of screens.
The shared "preamble" of each script (fetching tokens and styles, the helpers `T`, `C`,
`R`, `screen`, `tabBar`, `lingo`) is in `figma/preamble.js`.
