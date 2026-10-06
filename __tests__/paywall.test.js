// Пейвол каже правду: період у юридичному рядку — той, що в обраного тарифу;
// без магазину немає вигаданих цін; безкоштовна стеля — та, що на сервері.
import { act, create } from 'react-test-renderer';
import PaywallScreen from '../src/PaywallScreen';
import { PLANS } from '../src/subscription';
import { makeT, STRINGS } from '../src/i18n';

const t = makeT('en');
const texts = (tree) =>
  tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
// Мʼякий пейвол тримає обидві шапки (з пробним і без) в одній клітинці, щоб
// тарифи не стрибали; невидима схована й від VoiceOver — її людина не бачить
// і не чує, тож і перевірки її не бачать.
function shown(n) {
  for (let p = n; p; p = p.parent) if (p.props?.accessibilityElementsHidden) return false;
  return true;
}

async function render(props) {
  let tree;
  await act(async () => {
    tree = create(
      <PaywallScreen
        reason="info"
        plans={[]}
        onClose={() => {}}
        onPurchase={async () => ({ ok: true })}
        onRestore={async () => ({})}
        lang="en"
        t={t}
        {...props}
      />
    );
  });
  return tree;
}

test('a trial on a monthly plan renews monthly, not yearly', async () => {
  const month = { ...PLANS.find((p) => p.id === 'month'), price: '€9,99', trialDays: 3 };
  const tree = await render({ plans: [month] });
  const legal = texts(tree).find((s) => s.startsWith('Free until'));
  expect(legal).toMatch(/then €9,99 a month unless/);
  await act(async () => tree.unmount());
});

test('without a store: no prices, the reason up front, buying disabled', async () => {
  const tree = await render({ plans: [], unavailable: true });
  const all = texts(tree);
  expect(all).toContain(t('purchasesUnavailable'));
  expect(all).toContain(t('restore'));
  expect(all).not.toContain(t('startTrial'));
  const buy = tree.root.findAll((n) => n.props.title === t('subscribe'))[0];
  expect(buy.props.disabled).toBe(true);
  await act(async () => tree.unmount());
});

test('the scans paywall states the server’s free limit', async () => {
  const tree = await render({ reason: 'scans', freeScans: 3, plans: PLANS });
  const all = texts(tree);
  expect(all).toContain(t('pwScansTitle', { n: 3 }));
  expect(all).toContain(t('pwScansText', { n: 3 }));
  expect(all).toContain('3'); // клітинка «зараз» у таблиці
  await act(async () => tree.unmount());
});

// Мʼякий пейвол після першого скану: таймлайн пробного періоду замість
// таблиці й окрема кнопка «Продовжити безкоштовно». «Безкоштовно» —
// лише над тарифом, у якого справді є пробний період (App Review 3.1.2).
describe('intro after the first scan', () => {
  // Дерево розмонтовуємо й тоді, коли перевірка впала: інакше маскот
  // гойдався б далі, і jest не завершився б.
  let mounted = null;
  afterEach(async () => {
    if (mounted) await act(async () => mounted.unmount());
    mounted = null;
  });
  const open = async (props) => (mounted = await render(props));
  // Рядки таймлайну — «День 7» і дата в одному Text, тож беремо й рядки з масивів
  const strings = (tree) =>
    tree.root
      .findAll((n) => (typeof n.props?.children === 'string' || Array.isArray(n.props?.children)) && shown(n))
      .flatMap((n) => [n.props.children].flat())
      .filter((c) => typeof c === 'string');

  const press = (tree, text) =>
    act(async () => {
      const hit = tree.root.findAll(
        (n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.props.children === text).length
      );
      await hit.at(-1).props.onPress();
    });

  test('trial timeline with the store price, no comparison table, a real way out', async () => {
    const onClose = jest.fn();
    const tree = await open({ reason: 'intro', plans: PLANS, freeScans: 1, onClose });
    const all = strings(tree);
    expect(all).toEqual(
      expect.arrayContaining([
        t('pwIntroTitle'),
        t('tlToday'),
        t('tlTodayText'),
        t('tlDay', { n: 5 }),
        t('tlRemindText'),
        t('tlDay', { n: 7 }),
        t('tlChargeText', { p: '$59.99' }),
        'Continue for free (1 scan left)',
        t('terms'),
        t('restore'),
      ])
    );
    expect(all).not.toContain(t('colFree'));
    expect(tree.root.findAll((n) => n.props.title === t('startTrial')).length).toBeGreaterThan(0);
    await press(tree, 'Continue for free (1 scan left)');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === t('close') && n.props.onPress).length).toBeGreaterThan(0);
  });

  test('the free option counts the scans left with the right plural', async () => {
    const uk = makeT('uk');
    // коротко, щоб на SE кнопка була в один рядок
    for (const [n, text] of [
      [1, 'Продовжити безкоштовно (ще 1 скан)'],
      [3, 'Продовжити безкоштовно (ще 3 скани)'],
      [5, 'Продовжити безкоштовно (ще 5 сканів)'],
    ]) {
      const tree = await open({ reason: 'intro', plans: PLANS, freeScans: 10, scansLeft: n, t: uk });
      expect(strings(tree)).toContain(text);
      await act(async () => tree.unmount());
      mounted = null;
    }
  });

  test('no reminder is promised when notifications cannot be sent', async () => {
    const tree = await open({ reason: 'intro', plans: PLANS, canRemind: false });
    const all = strings(tree);
    expect(all).toContain(t('tlDay', { n: 7 }));
    expect(all).not.toContain(t('tlRemindText'));
  });

  // Без пробного — ні «безкоштовно», ні таймлайну, і таблиця не вискакує:
  // замість таймлайну один рядок про сьогоднішнє списання, а юридичний
  // рядок називає ціну й період.
  test('a plan without a trial: no “free” title and no timeline over a button that charges today', async () => {
    const tree = await open({ reason: 'intro', plans: PLANS, freeScans: 5 });
    await press(tree, t('planMonth'));
    const all = strings(tree);
    expect(all).not.toContain(t('pwIntroTitle'));
    expect(all).not.toContain(t('tlToday'));
    expect(all).toContain(t('pwTitle'));
    expect(all).not.toContain(t('colFree'));
    expect(all).toContain('$9.99 today, then every month');
    expect(all).toContain('$9.99 a month, renews automatically. Cancel anytime in your Apple ID settings.');
    expect(all).toContain('Continue for free (5 scans left)');
    expect(tree.root.findAll((n) => n.props.title === t('subscribe')).length).toBeGreaterThan(0);
    await press(tree, t('planLifetime'));
    expect(strings(tree)).toContain(t('pwTodayLifetime'));
    expect(strings(tree)).not.toContain(t('colFree'));
  });

  test('no trial in the offering at all: the regular paywall plus the free option', async () => {
    const tree = await open({ reason: 'intro', plans: PLANS.map(({ trialDays, ...p }) => p) });
    const all = strings(tree);
    expect(all).toContain(t('pwTitle'));
    expect(all).not.toContain(t('tlToday'));
    expect(all.some((s) => s.startsWith('Continue for free'))).toBe(true);
  });
});

// ---------- v1.2: сцена — у Pro, словник без стелі, «назавжди» ----------
describe('v1.2 paywall', () => {
  let mounted = null;
  afterEach(async () => {
    if (mounted) await act(async () => mounted.unmount());
    mounted = null;
  });
  const open = async (props) => (mounted = await render(props));
  const strings = (tree) =>
    tree.root
      .findAll((n) => (typeof n.props?.children === 'string' || Array.isArray(n.props?.children)) && shown(n))
      .flatMap((n) => [n.props.children].flat())
      .filter((c) => typeof c === 'string');
  const press = (tree, text) =>
    act(async () => {
      const hit = tree.root.findAll(
        (n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.props.children === text).length
      );
      await hit.at(-1).props.onPress();
    });

  test('the scene wall has its own argument and the server’s free scene count', async () => {
    const tree = await open({ reason: 'scene', freeScenes: 1, plans: PLANS });
    const all = strings(tree);
    expect(all).toContain(t('pwSceneTitle'));
    expect(all).toContain('The free plan includes 1 scene to try. With Pro, scan whole rooms as often as you like.');
  });

  test('the comparison has scans, scenes and languages — and no word cap', async () => {
    const tree = await open({ reason: 'info', freeScans: 1, freeScenes: 1, plans: PLANS });
    const all = strings(tree);
    // v1.3: слова дня й теми — нові рядки; картки, квіз і віджети — один
    expect(all).toEqual(expect.arrayContaining([t('cmp_scans'), t('cmp_scene'), t('cmp_langs'), t('cmp_wodn'), t('cmp_themes'), t('cmp_core')]));
    expect(all).not.toContain('Saved words');
    expect(STRINGS.en.cmp_words).toBeUndefined();
    expect(STRINGS.en.pwWordsTitle).toBeUndefined();
  });

  test('lifetime: one-time payment, no renewal line, no “per month”', async () => {
    const plans = [
      { ...PLANS.find((p) => p.id === 'year'), price: '$59.99', trialDays: 0 },
      { ...PLANS.find((p) => p.id === 'lifetime'), price: '$129.99', perMonth: null, trialDays: 0 },
    ];
    const tree = await open({ reason: 'info', plans });
    await press(tree, t('planLifetime'));
    const all = strings(tree);
    expect(all).toContain(t('lifetimeOnce'));
    expect(all).toContain(t('lifetimeLegal'));
    expect(all).not.toContain(t('renewLegal'));
    expect(all).toContain('$129.99');
    expect(tree.root.findAll((n) => n.props.title === t('buyLifetime')).length).toBeGreaterThan(0);
  });

  test('yearly is preselected when the offering has it, whatever the order', async () => {
    // пробний період лише в річного — за кнопкою видно, який тариф обрано
    const plans = ['lifetime', 'month', 'year'].map((id) => ({ ...PLANS.find((p) => p.id === id), trialDays: id === 'year' ? 7 : 0 }));
    const tree = await open({ reason: 'info', plans });
    expect(tree.root.findAll((n) => n.props.title === t('startTrial')).length).toBeGreaterThan(0);
    expect(strings(tree).some((x) => x.startsWith('Free until') && x.includes('a year'))).toBe(true);
    expect(strings(tree)).not.toContain(t('lifetimeLegal'));
  });

  test('with a trial timeline the Pro benefits replace the table', async () => {
    const tree = await open({ reason: 'intro', plans: PLANS });
    const all = strings(tree);
    // v1.3: головні чотири — скани, сцени, слова дня й теми
    expect(all).toEqual(expect.arrayContaining([t('pro_scans'), t('pro_scene'), t('pro_wodn', { n: 5 }), t('pro_themes')]));
    expect(all).not.toContain(t('colFree'));
  });

  // App Review 3.1.2: у мʼякому пейволі сума списання — перша цифра під
  // заголовком, а не десь під таймлайном і переліком переваг.
  test('intro: the plans with store prices come before the timeline and the benefits', async () => {
    const tree = await open({ reason: 'intro', plans: PLANS });
    const all = strings(tree);
    const price = all.indexOf('$59.99');
    expect(price).toBeGreaterThan(-1);
    expect(price).toBeLessThan(all.indexOf(t('tlToday')));
    expect(price).toBeLessThan(all.indexOf(t('pro_scans')));
  });

  // Так само на кожній стіні: тарифи з ціною — одразу під заголовком, таблиця
  // — під ними (на SE інакше жодного тарифу не видно без прокрутки).
  test('every other wall shows the plans first, the comparison under them', async () => {
    for (const reason of ['scans', 'scene', 'langs', 'info']) {
      const tree = await open({ reason, plans: PLANS });
      const all = strings(tree);
      expect(all.indexOf('$59.99')).toBeGreaterThan(-1);
      expect(all.indexOf('$59.99')).toBeLessThan(all.indexOf(t('cmp_core')));
      await act(async () => tree.unmount());
      mounted = null;
    }
  });

  test('compact (onboarding, third screen): plans and timeline only', async () => {
    const tree = await open({ reason: 'intro', compact: true, plans: PLANS });
    const all = strings(tree);
    expect(all[0]).toBe('PRO');
    expect(all).toContain(t('pwPlansTitle'));
    expect(all).not.toContain(t('pwIntroTitle'));
    expect(all).not.toContain(t('pro_scans'));
    expect(all).toContain(t('tlToday'));
    // без пробного періоду в обраного тарифу — ні таблиці, ні таймлайну
    await press(tree, t('planMonth'));
    const after = strings(tree);
    expect(after).not.toContain(t('tlToday'));
    expect(after).not.toContain(t('colFree'));
  });

  // Безкоштовний скан один на все життя: витрачено — кнопка не обіцяє ні
  // ще одного сьогодні, ні «наступного завтра»: просто «продовжити».
  test('once the free scan is used, the free way out just continues — never a scan tomorrow', async () => {
    const TIME = /today|tomorrow|a day|per day|сьогодні|завтра|щодня|на день|heute|morgen|pro Tag|hoy|mañana|al día/i;
    for (const lang of ['en', 'uk', 'de', 'es']) {
      const tl = makeT(lang);
      const tree = await open({ reason: 'intro', plans: PLANS, freeScans: 1, scansLeft: 0, lang, t: tl });
      const all = strings(tree);
      expect(all).toContain(tl('pwContinueFreeNoScans'));
      for (const n of [0, 1]) expect(all).not.toContain(tl('pwContinueFree', { n }));
      expect(tl('pwContinueFreeNoScans')).not.toMatch(TIME);
      await act(async () => tree.unmount());
      mounted = null;
    }
    // в один рядок на SE: без переліку того, що лишається
    expect(t('pwContinueFreeNoScans')).toBe('Continue for free');
    expect(makeT('uk')('pwContinueFreeNoScans')).toBe('Продовжити безкоштовно');
  });

  // Скільки сканів ЛИШИЛОСЬ, а не скільки їх було на старті
  test('with scans left, the free way out names what is left, not the ceiling', async () => {
    const tree = await open({ reason: 'intro', plans: PLANS, freeScans: 3, scansLeft: 1 });
    const all = strings(tree);
    expect(all).toContain('Continue for free (1 scan left)');
    expect(all).not.toContain(t('pwContinueFreeNoScans'));
    expect(all.some((x) => /a day|today|tomorrow/.test(x))).toBe(false);
  });
});

// v1.3: безкоштовно — один скан на все життя. Стіна сканів каже саме це:
// без «на сьогодні», «на день» чи «завтра», і що лишається безкоштовним.
describe('the scans wall for a lifetime free scan', () => {
  let mounted = null;
  afterEach(async () => {
    if (mounted) await act(async () => mounted.unmount());
    mounted = null;
  });

  test('English: used up, one scan to try, the rest stays free; the table counts scans in total', async () => {
    const tree = (mounted = await render({ reason: 'scans', freeScans: 1, plans: PLANS }));
    const all = texts(tree);
    expect(all).toContain('You’ve used your free scan');
    expect(all).toContain(
      'The free plan includes 1 scan to try. With Pro, scan as much as you like. Your word list, flashcards and word of the day stay free.'
    );
    expect(all).toContain('Scans in total');
    expect(all.some((x) => /today|tomorrow|a day|per day/i.test(x))).toBe(false);
  });

  test('Ukrainian reads naturally, with the right plural', async () => {
    const uk = makeT('uk');
    let tree = (mounted = await render({ reason: 'scans', freeScans: 1, plans: PLANS, t: uk, lang: 'uk' }));
    let all = texts(tree);
    expect(all).toContain('Безкоштовний скан використано');
    expect(all).toContain('Безкоштовно є 1 скан на пробу. З Pro скануй скільки хочеш. Словник, картки й слово дня лишаються безкоштовними.');
    expect(all).toContain('Сканів загалом');
    expect(all.some((x) => /сьогодні|завтра|на день|щодня/.test(x))).toBe(false);
    await act(async () => tree.unmount());
    tree = mounted = await render({ reason: 'scans', freeScans: 3, plans: PLANS, t: uk, lang: 'uk' });
    all = texts(tree);
    expect(all).toContain('Безкоштовні скани використано');
    expect(all).toContain('Безкоштовно є 3 скани на пробу. З Pro скануй скільки хочеш. Словник, картки й слово дня лишаються безкоштовними.');
  });
});
