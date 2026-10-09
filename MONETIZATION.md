# LinguaLens Monetization

Implemented in `src/subscription.js`, `src/PaywallScreen.js`, `src/ProIcons.js`.
Payment processing (StoreKit) is not connected yet. A purchase is activated locally so
that all scenarios can be walked through and the limits can be checked.

---

## Pricing

| Plan | Price | Per year | Multiple of the yearly price |
|---|---|---|---|
| Week | **$4.99** | $259 | ×7.4 |
| Month | **$6.99** | $84 | ×2.4 |
| 3 months | **$16.99** | $68 | ×1.9 |
| **Year** | **$34.99** | $35 | ×1.0 ← 7 days free |

**Why it is set up this way.** The weekly plan does not exist for people to stay on it.
It is an anchor. Next to $4.99 per week, the yearly plan at $34.99 reads as the obvious
choice, which is why it is highlighted and selected by default on the paywall.
A 7.4x difference between the week and the year is sharp enough to make the decision
clear, but not so sharp that the weekly plan looks like a trick.

The yearly plan comes with a **7-day free trial**. This is the main conversion driver:
the person has time to build up words, and the dictionary becomes something they do not want to lose.

**Market context.** CapWords (an Apple Design Award winner, 4.6★) charges
$5.99/month and $29.99/year. We are in the same field, but with a more noticeable yearly
saving in the display (−58% versus the weekly plan).

---

## Free tier limits

The logic is simple: we limit what **costs us money** (AI calls) and what
**shows the value of accumulation** (dictionary size). We do not limit what
brings the person back every day.

| | Free | Pro |
|---|---|---|
| Scans per day | **5** | unlimited |
| Words in the dictionary | **100** | unlimited |
| Languages at once | **1** | all 29 |
| Word of the Day + push | ✅ | ✅ |
| Flashcards, SRS, quiz | ✅ | ✅ |
| Pronunciation | ✅ | ✅ |
| Object stickers | ✅ | ✅ |
| Dictionary export | - | ✅ |

**What we deliberately do NOT limit.** Word of the Day, review and pronunciation stay
free forever. These are what build the habit and bring the person back to the app.
Choking retention to sell a subscription is the most expensive mistake in this category:
without a daily return you cannot sell anyone anything.

**Why 5 scans, not 3.** Three is less than it takes to understand the
value. With five, the person has time to scan something of their own, save it and
see the word in the flashcards. The wall should come when it is already a pity
to stop.

**Why 100 words.** This is roughly two weeks of active use. It is enough for
the dictionary to become the user's own, and too little to stop filling it.

---

## How the paywall works

There is not just one: the text adapts to what the person ran into.

| Reason | Title |
|---|---|
| `scans` | «На сьогодні скани закінчились» (Today's scans are used up) |
| `words` | «Словник заповнений» (The dictionary is full) |
| `langs` | «Друга мова - у Pro» (The second language is in Pro) |
| `info` | «Знімай обмеження» (Remove the limits; opened from settings) |

The principles it is built on:

- **The limit is checked BEFORE the shot.** Spending an AI call and showing a refusal
  after it looks like a trick.
- **The close button is big and in its usual place.** A paywall that is hard to leave hurts
  the App Store rating more than it brings in revenue.
- **The scan counter is shown only when 3 or fewer are left.** A constant count
  above the camera pressures the user and spoils the impression of the main screen.
- **Yearly is selected by default, not the most expensive.** A pre-selected expensive
  option comes back as cancellations and one-star reviews.

---

## What is left to do

- [ ] **StoreKit.** Create 4 subscription products in App Store Connect with
      the identifiers from `PLANS[].productId`, add `expo-in-app-purchases`
      or `react-native-iap`, and replace `activatePlan()` with a real purchase.
- [ ] **Server-side receipt validation.** Right now the state is local, so it can be
      forged. Before release: check the receipt via the App Store Server API and
      store the status in Firestore next to the user.
- [ ] **Restore purchases.** The button on the paywall already exists, the handler does not.
      Apple requires a working "Restore".
- [ ] **Terms and Privacy pages.** The links on the paywall must lead to
      real URLs, otherwise the review will be rejected.
- [ ] **Subscription management screen.** Currently the card in settings leads to the
      paywall; for an active subscription it should lead to the Apple ID settings.

---

## Ideas for future versions

Things that can be sold additionally once the user base grows:

- **Several words from one frame.** The model already returns a bounding box for a single object;
  asking for a list is a matter of the prompt. A strong feature: one scan = 3-5 words.
- **Conversation practice from saved words.** What CapWords 2.0 used to enter a
  new category. The most expensive to build and the most valuable.
- **Automatic word grouping** by topic (food, clothing, home): the model can return
  the category together with the word.
- **Shared word sets**: share a collection with a friend.
- **A lock screen widget** with the Word of the Day.
