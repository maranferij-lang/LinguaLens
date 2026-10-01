// Картки «поділитись» — те, що люди викладають у Stories.
//
// Принцип як у Strava: людина ділиться не застосунком, а СВОЇМ результатом.
// Тому картка спокійна й «дорога»: багато повітря, один фокус, великий
// впевнений Nunito, метадані дрібним розрядковим капсом. Ні градієнтів
// заради градієнтів, ні емодзі, ні тіней під текстом. Бренд — маленький і
// тихий унизу: гучніший за контент бренд перетворює пост на рекламу, а
// рекламу ніхто не репостить.
//
// Кожна картка має фіксований розмір 360×640 і верстається в абсолютних
// числах: це картинка, а не екран, тож системний розмір шрифту
// (allowFontScaling) її не чіпає — інакше Dynamic Type розсунув би верстку.
import { Text, View } from 'react-native';
import { AchIcon } from '../AchIcons';
import { LogoMark } from '../Logo';
import { Mascot } from '../Mascot';
import { photoUri } from '../photos';
import { flagFor, nameFor } from '../speech';
import { StickerLarge } from '../Sticker';
import { F, type } from '../theme';
import {
  CAPS_TRACK,
  CARD_H,
  CARD_W,
  COLLAGE_H,
  CONTENT_W,
  CUTOUT_H,
  CUTOUT_W,
  PAD_BOTTOM,
  PAD_TOP,
  PAD_X,
  barHeights,
  capsSize,
  clipLines,
  dateLabel,
  dayLetter,
  fontSizeForWord,
  formatCount,
  initialOf,
  ipaLabel,
  pickCollage,
  quote,
  textEm,
  tierColor,
  weekRangeLabel,
  SCENE_TEMPLATES,
} from './layout';
import { SceneCard } from './SceneCards';

// Фото слова може бути відносним шляхом у Documents ('stickers/x.jpg') або
// повним URI свіжого скану. data: (веб-прев'ю) віддаємо як є — photoUri
// приклеїв би до нього шлях Documents.
function resolvePhoto(photo) {
  if (!photo) return null;
  if (String(photo).startsWith('data:')) return photo;
  try {
    return photoUri(photo);
  } catch (_) {
    return null;
  }
}

function Txt(props) {
  return <Text allowFontScaling={false} {...props} />;
}

// Розрядковий капс для метаданих: «ENGLISH», «DAY STREAK».
const capsStyle = (color, size = 11) => ({
  color,
  fontFamily: F.extra,
  fontSize: size,
  lineHeight: Math.round(size * 1.35),
  letterSpacing: size * 0.14,
  textTransform: 'uppercase',
});

function Frame({ pal, cardRef, children }) {
  return (
    // collapsable={false}: на Android «порожній» з погляду лейауту View
    // інакше розчиниться в батьківському, і знімати не буде що.
    <View
      ref={cardRef}
      collapsable={false}
      style={{
        width: CARD_W,
        height: CARD_H,
        backgroundColor: pal.bg,
        paddingHorizontal: PAD_X,
        paddingTop: PAD_TOP,
        paddingBottom: PAD_BOTTOM,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

// Підпис бренду: знак + назва + крихітний слоган. Свідомо найтихіший
// елемент картки. Праворуч — необовʼязкова метадата (дата).
function Footer({ pal, t, right, center }) {
  const brand = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <LogoMark size={22} color={pal.text} fg={pal.bg} />
      <View>
        <Txt style={{ color: pal.text, ...type(13, F.extra, { noLead: true }), lineHeight: 16 }}>LinguaLens</Txt>
        <Txt style={{ color: pal.muted, fontFamily: F.reg, fontSize: 10, lineHeight: 13 }}>{t('shareTagline')}</Txt>
      </View>
    </View>
  );
  if (center) return <View style={{ alignItems: 'center' }}>{brand}</View>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {brand}
      {right ? <Txt style={capsStyle(pal.muted, 10)}>{right}</Txt> : null}
    </View>
  );
}

function LangLabel({ lang, pal, center }) {
  if (!lang) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: center ? 'center' : 'flex-start' }}>
      <Txt style={{ fontSize: 14, lineHeight: 18 }}>{flagFor(lang)}</Txt>
      <Txt style={capsStyle(pal.muted)}>{nameFor(lang)}</Txt>
    </View>
  );
}

// Головне слово. Кегль рахуємо наперед (fontSizeForWord), а
// adjustsFontSizeToFit — страховка на випадок, якщо оцінка схибила.
function BigWord({ word, pal, max, align = 'center', style }) {
  const size = fontSizeForWord(word, { max });
  return (
    <Txt
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      style={[
        {
          color: pal.text,
          fontFamily: F.extra,
          fontSize: size,
          // запас під діакритику над великими літерами (Ü, Ñ, Й)
          lineHeight: Math.round(size * 1.18),
          letterSpacing: -size * 0.022,
          textAlign: align,
          alignSelf: 'stretch',
        },
        style,
      ]}
    >
      {word}
    </Txt>
  );
}

// Наліпка або, якщо фото немає, плитка з першою літерою. Плитка займає
// стільки ж місця, скільки видима частина наліпки, щоб композиція не
// «стрибала» між словами з фото й без.
function Art({ word, pal, size, tilt = 0 }) {
  const uri = resolvePhoto(word.photo);
  if (uri) {
    return (
      // StickerLarge і так нахилена на −2°, tilt докручує до потрібного кута
      <StickerLarge
        uri={uri}
        shape={word.shape}
        outline={word.outline}
        box={word.box}
        size={size}
        halo={false}
        style={tilt ? { transform: [{ rotate: `${tilt}deg` }] } : null}
      />
    );
  }
  const tile = Math.round(size * 0.72);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: tile,
          height: tile,
          borderRadius: tile * 0.26,
          backgroundColor: pal.tile,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: `${tilt - 3}deg` }],
        }}
      >
        <Txt style={{ color: pal.onTile, fontFamily: F.extra, fontSize: tile * 0.56, lineHeight: tile * 0.72 }}>
          {initialOf(word.word)}
        </Txt>
      </View>
    </View>
  );
}

function IpaPill({ ipa, pal, style }) {
  const label = ipaLabel(ipa);
  if (!label) return null;
  return (
    <View
      style={[
        { backgroundColor: pal.pill, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, alignSelf: 'center' },
        style,
      ]}
    >
      <Txt numberOfLines={1} style={{ color: pal.pillText, fontFamily: F.semi, fontSize: 15, lineHeight: 20 }}>
        {label}
      </Txt>
    </View>
  );
}

// Рядок великих чисел із підписами капсом — серце «стравівського» вигляду.
function Stats({ items, pal, locale, style }) {
  const cellW = CONTENT_W / items.length;
  // один кегль на весь рядок, щоб підписи стояли рівно
  const labelSize = Math.min(...items.map((it) => capsSize(it.label, cellW - 8)));
  return (
    <View style={[{ flexDirection: 'row' }, style]}>
      {items.map((it, i) => {
        const value = formatCount(it.value, locale);
        const size = fontSizeForWord(value, { max: 40, min: 22, width: cellW - 16 });
        return (
          <View
            key={it.label}
            style={{
              width: cellW,
              alignItems: 'center',
              paddingHorizontal: 4,
              borderLeftWidth: i ? 1 : 0,
              borderLeftColor: pal.line,
            }}
          >
            <Txt
              numberOfLines={1}
              style={{ color: pal.text, fontFamily: F.extra, fontSize: size, lineHeight: Math.round(size * 1.12), letterSpacing: -size * 0.02 }}
            >
              {value}
            </Txt>
            <Txt
              numberOfLines={2}
              style={[capsStyle(pal.muted, labelSize), { letterSpacing: labelSize * CAPS_TRACK, textAlign: 'center', marginTop: 4 }]}
            >
              {it.label}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

// ─── Слово: «Наліпка» ──────────────────────────────────────────────────────
// Головний шаблон: вирізаний предмет великим планом і слово під ним.
function WordSticker({ word, pal, t, locale }) {
  return (
    <>
      <LangLabel lang={word.lang} pal={pal} center />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Art word={word} pal={pal} size={250} tilt={-2} />
      </View>
      <BigWord word={word.word} pal={pal} max={64} />
      <IpaPill ipa={word.ipa} pal={pal} style={{ marginTop: 10 }} />
      {word.translation ? (
        <Txt numberOfLines={2} style={{ color: pal.text, ...type(22, F.semi), textAlign: 'center', marginTop: 14 }}>
          {word.translation}
        </Txt>
      ) : null}
      <View style={{ marginTop: 40 }}>
        <Footer pal={pal} t={t} right={dateLabel(word.addedAt || Date.now(), locale)} />
      </View>
    </>
  );
}

// ─── Слово: «Словник» ──────────────────────────────────────────────────────
// Типографіка словникової статті: заголовок, транскрипція, тонка лінійка,
// переклад, приклад у лапках мови. Наліпка — маленька, в кутку, як марка.
function WordEntry({ word, pal, t, locale }) {
  const uri = resolvePhoto(word.photo);
  // слово дня приходить у серверному вигляді (example_translation)
  const exampleTr = word.exampleTranslation || word.example_translation;
  // Висота картки фіксована: якщо переклад займе два рядки, приклад
  // скорочуємо до двох, інакше нижній рядок із мовою й датою виїхав би за край.
  const exampleLines = textEm(word.translation, 0) * 28 > CONTENT_W ? 2 : 3;
  return (
    <>
      {uri ? (
        <View style={{ position: 'absolute', top: PAD_TOP - 22, right: PAD_X - 18 }}>
          <Art word={word} pal={pal} size={124} tilt={10} />
        </View>
      ) : null}
      <LangLabel lang={word.lang} pal={pal} />
      {/* з фото заголовок опускаємо нижче наліпки в кутку, без фото — менше
          порожнечі згори */}
      <View style={{ marginTop: uri ? 92 : 64 }}>
        <BigWord word={word.word} pal={pal} max={54} align="left" />
        {word.ipa ? (
          <Txt numberOfLines={1} style={{ color: pal.muted, fontFamily: F.reg, fontSize: 17, lineHeight: 22, marginTop: 4 }}>
            {ipaLabel(word.ipa)}
          </Txt>
        ) : null}
        <View style={{ height: 1, backgroundColor: pal.line, marginTop: 22 }} />
        {word.translation ? (
          <Txt numberOfLines={2} style={{ color: pal.text, ...type(28, F.extra), marginTop: 20 }}>
            {word.translation}
          </Txt>
        ) : null}
        {word.example ? (
          <Txt numberOfLines={exampleLines} style={{ color: pal.text, fontFamily: F.semi, fontSize: 18, lineHeight: 26, marginTop: 18 }}>
            {quote(clipLines(word.example, exampleLines, 18), word.lang)}
          </Txt>
        ) : null}
        {word.example && exampleTr ? (
          <Txt numberOfLines={2} style={{ color: pal.muted, fontFamily: F.reg, fontSize: 15, lineHeight: 21, marginTop: 8 }}>
            {clipLines(exampleTr, 2, 15)}
          </Txt>
        ) : null}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: pal.line, paddingTop: 14, gap: 32 }}>
        {word.lang ? (
          <View>
            <Txt style={capsStyle(pal.muted, 10)}>{t('shareLang')}</Txt>
            <Txt style={{ color: pal.text, fontFamily: F.extra, fontSize: 17, lineHeight: 22, marginTop: 2 }}>
              {nameFor(word.lang)}
            </Txt>
          </View>
        ) : null}
        <View>
          <Txt style={capsStyle(pal.muted, 10)}>{t('shareDate')}</Txt>
          <Txt style={{ color: pal.text, fontFamily: F.extra, fontSize: 17, lineHeight: 22, marginTop: 2 }}>
            {dateLabel(word.addedAt || Date.now(), locale)}
          </Txt>
        </View>
      </View>
      <View style={{ marginTop: 26 }}>
        <Footer pal={pal} t={t} />
      </View>
    </>
  );
}

// ─── Слово: «Мінімал» ──────────────────────────────────────────────────────
// Лише предмет і слово — найзручніше для Stories: поверх можна писати.
function WordMinimal({ word, pal, t }) {
  return (
    <>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Art word={word} pal={pal} size={292} tilt={1} />
        <BigWord word={word.word} pal={pal} max={56} style={{ marginTop: 14 }} />
      </View>
      <Footer pal={pal} t={t} center />
    </>
  );
}

// ─── Слово: «Без тла» ──────────────────────────────────────────────────────
// Вирізаний предмет і табличка «слово · переклад», наче наліпка з підписом.
// Знімається не картка, а лише цей блок (cardRef) — прозорий PNG без тла:
// у Stories його рухають пальцем, в iMessage й Telegram він лягає стікером.
// Колір палітри видно тільки в прев'ю — тим самим кольором Instagram
// заллє тло Stories. Табличка — кольори плитки: вона виділяється на тлі
// палітри (≥ 3:1), а текст на ній читається (≥ 4.5:1) — див. тест палітр.
function WordCutout({ word, pal, cardRef }) {
  const size = fontSizeForWord(word.word, { max: 28, min: 16, width: CUTOUT_W - 76 });
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View ref={cardRef} collapsable={false} style={{ width: CUTOUT_W, height: CUTOUT_H, alignItems: 'center' }}>
        <Art word={word} pal={pal} size={290} tilt={-2} />
        <View
          style={{
            marginTop: -38,
            maxWidth: CUTOUT_W - 24,
            backgroundColor: pal.tile,
            borderRadius: 18,
            paddingHorizontal: 20,
            paddingVertical: 10,
            alignItems: 'center',
            transform: [{ rotate: '2deg' }],
            shadowColor: '#3B2F22',
            shadowOpacity: 0.2,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
          }}
        >
          <Txt
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ color: pal.onTile, fontFamily: F.extra, fontSize: size, lineHeight: Math.round(size * 1.2), letterSpacing: -size * 0.015 }}
          >
            {word.word}
          </Txt>
          {word.translation ? (
            <Txt numberOfLines={1} style={{ color: pal.onTile, fontFamily: F.semi, fontSize: 16, lineHeight: 21 }}>
              {word.translation}
            </Txt>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ─── Досягнення ────────────────────────────────────────────────────────────
// Медаль: мʼякий диск з іконкою, обідок відтінком рівня (бронза, срібло,
// акцент) — ледь помітно, щоб не скотитися в «ігрові» значки.
function Medal({ id, tier, pal }) {
  return (
    <View style={{ width: 212, height: 212, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: 212, height: 212, borderRadius: 106, borderWidth: 1, borderColor: pal.line }} />
      <View
        style={{
          width: 176,
          height: 176,
          borderRadius: 88,
          borderWidth: 5,
          borderColor: tierColor(pal, tier),
          backgroundColor: pal.pill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AchIcon id={id} size={112} color={pal.accent} />
      </View>
      {/* Lingo — лише маленький акцент збоку, не герой картки */}
      <Mascot pose="celebrate" size={64} style={{ position: 'absolute', right: -10, bottom: -2 }} />
    </View>
  );
}

// fresh — щойно розблоковане (тап по тосту). Давнє, поширене з профілю,
// не вдає з себе сьогоднішнє: нейтральний заголовок і без дати.
function AchievementCard({ payload, pal, t, locale }) {
  const { achievement, stats = {}, fresh } = payload;
  // «Місяць поспіль» поруч із нинішньою серією в 2 дні суперечив би сам собі —
  // для досягнень за серію показуємо саму серію, за яку його дали.
  const streak = achievement.metric === 'streak' ? achievement.goal : stats.streak;
  return (
    <>
      <Txt style={[capsStyle(pal.muted), { textAlign: 'center' }]}>{fresh ? t('shareUnlocked') : t('shareMyAch')}</Txt>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Medal id={achievement.id} tier={achievement.tier} pal={pal} />
        <Txt
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{ color: pal.text, ...type(42, F.extra), textAlign: 'center', marginTop: 30 }}
        >
          {t('ach_' + achievement.id)}
        </Txt>
      </View>
      <Stats
        pal={pal}
        locale={locale}
        items={[
          { label: t('shareStatWords', { n: stats.words }), value: stats.words },
          { label: t('shareStatStreak', { n: streak }), value: streak },
        ]}
      />
      <View style={{ marginTop: 40 }}>
        <Footer pal={pal} t={t} right={fresh ? dateLabel(Date.now(), locale) : null} />
      </View>
    </>
  );
}

// ─── Мій тиждень ───────────────────────────────────────────────────────────
function WeekChart({ days, pal, t, height }) {
  const hs = barHeights(days, height);
  const letters = t('dowLetters');
  return (
    <View>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        {days.map((d, i) => (
          <View
            key={d.key}
            style={{
              width: 26,
              height: hs[i],
              borderRadius: Math.min(9, hs[i] / 2),
              backgroundColor: d.value ? pal.accent : pal.line,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        {days.map((d, i) => (
          <Txt
            key={d.key}
            // останній стовпчик — сьогодні, його підпис трохи помітніший
            style={[capsStyle(i === days.length - 1 ? pal.text : pal.muted, 10), { width: 26, textAlign: 'center', letterSpacing: 0 }]}
          >
            {dayLetter(d.dow, letters)}
          </Txt>
        ))}
      </View>
    </View>
  );
}

function WeekCard({ payload, pal, t, locale }) {
  const stats = payload.stats || {};
  const days = Array.isArray(stats.days) ? stats.days : [];
  const collage = pickCollage(stats.stickers, 6);
  const langs = Array.isArray(stats.langs) ? stats.langs : [];
  const range = weekRangeLabel(days, locale);
  // прапорці праворуч забирають місце в заголовка
  const rangeSize = fontSizeForWord(range, { max: 30, min: 18, width: CONTENT_W - (langs.length ? 84 : 0) });
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Txt style={capsStyle(pal.muted)}>{t('shareWeekLabel')}</Txt>
          <Txt numberOfLines={1} adjustsFontSizeToFit style={{ color: pal.text, ...type(rangeSize, F.extra), marginTop: 4 }}>
            {range}
          </Txt>
        </View>
        {langs.length ? (
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 1 }}>
            {langs.slice(0, 4).map((l) => (
              <Txt key={l} style={{ fontSize: 16, lineHeight: 20 }}>
                {flagFor(l)}
              </Txt>
            ))}
            {langs.length > 4 ? <Txt style={capsStyle(pal.muted, 10)}>+{langs.length - 4}</Txt> : null}
          </View>
        ) : null}
      </View>

      <Stats
        pal={pal}
        locale={locale}
        style={{ marginTop: 30 }}
        items={[
          { label: t('shareStatNew', { n: stats.weekWords }), value: stats.weekWords },
          { label: t('shareStatStreak', { n: stats.streak }), value: stats.streak },
          { label: t('shareStatReviews', { n: stats.reviews }), value: stats.reviews },
        ]}
      />

      {/* Без наліпок графік забирає їхнє місце, щоб низ не зяяв порожнечею */}
      <View style={[{ justifyContent: 'center', marginTop: 32 }, !collage.length && { flex: 1 }]}>
        {days.length ? <WeekChart days={days} pal={pal} t={t} height={collage.length ? 84 : 150} /> : null}
      </View>

      {collage.length ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ height: COLLAGE_H }}>
            {collage.map((c, i) => (
              <StickerLarge
                key={c.item.photo + i}
                uri={resolvePhoto(c.item.photo)}
                shape={c.item.shape}
                outline={c.item.outline}
                box={c.item.box}
                size={c.size}
                halo={false}
                style={{ position: 'absolute', left: c.left, top: c.top, transform: [{ rotate: `${c.rotate}deg` }] }}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: 20 }}>
        <Footer pal={pal} t={t} right={dateLabel(Date.now(), locale)} />
      </View>
    </>
  );
}

// Одна картка в повному розмірі 360×640. cardRef — на кореневий View (у
// «без тла» — на блок наліпки), саме його знімає capture.js.
export function ShareCard({ payload, template, pal, t, locale, cardRef }) {
  // Сцена — фото на весь кадр, без полів звичайної картки
  if (SCENE_TEMPLATES.includes(template)) {
    return <SceneCard payload={payload} template={template} pal={pal} t={t} locale={locale} cardRef={cardRef} />;
  }
  const props = { pal, t, locale };
  let body = null;
  if (template === 'sticker') body = <WordSticker word={payload.word} {...props} />;
  else if (template === 'entry') body = <WordEntry word={payload.word} {...props} />;
  else if (template === 'minimal') body = <WordMinimal word={payload.word} {...props} />;
  else if (template === 'cutout') body = <WordCutout word={payload.word} pal={pal} cardRef={cardRef} />;
  else if (template === 'achievement') body = <AchievementCard payload={payload} {...props} />;
  else if (template === 'week') body = <WeekCard payload={payload} {...props} />;
  // «Без тла» знімає лише наліпку (cardRef усередині), рамка — тільки для прев'ю
  return (
    <Frame pal={pal} cardRef={template === 'cutout' ? undefined : cardRef}>
      {body}
    </Frame>
  );
}
