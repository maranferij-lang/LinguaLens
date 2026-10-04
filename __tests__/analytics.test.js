// Обгортка статистики (src/analytics.js) над заглушкою PostHog із jest.setup.js.
// Стережемо обіцянки з шапки файлу: без ключа — тиша; анонімно (жодного
// identify); без запису сесій і дотиків; вимкнено в налаштуваннях — ні подій,
// ні клієнта; прапорці не кидають і не чекають довше, ніж дозволено.

// Кожен тест — свіжий модуль (у ньому живе єдиний клієнт) і свіжа заглушка.
function load({ key = 'phc_test', host } = {}) {
  let mod;
  let PostHog;
  jest.isolateModules(() => {
    jest.doMock('../src/config', () => ({ POSTHOG_KEY: key, POSTHOG_HOST: host || 'https://eu.i.posthog.com' }));
    PostHog = require('posthog-react-native').default;
    mod = require('../src/analytics');
  });
  const client = () => PostHog.instances[0];
  return { ...mod, PostHog, client };
}

afterEach(() => jest.useRealTimers());

describe('without a key', () => {
  test('every call is a silent no-op and no client is created', async () => {
    const a = load({ key: '' });
    expect(a.analyticsAvailable()).toBe(false);
    a.initAnalytics();
    a.track('scan', { mode: 'object' });
    a.setProps({ ui_lang: 'uk' });
    a.setAnalyticsEnabled(true);
    a.resetAnalytics();
    expect(a.isEnabled()).toBe(false);
    expect(a.PostHog.instances).toHaveLength(0);
    expect(await a.flag('onboarding-flow', 'control', 50)).toBe('control');
  });
});

describe('with a key', () => {
  test('starts anonymous: EU host, no replay, no touch capture, lifecycle on, no GeoIP', () => {
    const a = load();
    a.initAnalytics();
    expect(a.PostHog.instances).toHaveLength(1);
    const c = a.client();
    expect(c.apiKey).toBe('phc_test');
    expect(c.options).toMatchObject({
      host: 'https://eu.i.posthog.com',
      personProfiles: 'identified_only',
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      disableGeoip: true,
      disableSurveys: true,
      errorTracking: { autocapture: false },
    });
    // дотики автоматично не збираються (за замовчуванням вимкнено — і ми не вмикаємо)
    expect(c.options.autocapture).toBeUndefined();
    // повторний запуск нічого не дублює
    a.initAnalytics();
    expect(a.PostHog.instances).toHaveLength(1);
  });

  test('events carry only codes and numbers; identify is never called', () => {
    const a = load();
    a.initAnalytics();
    a.track('word_saved', { count: 2, total: 12, source: 'scene', note: { word: 'mug' }, bad: NaN, list: ['work', 'self', { x: 1 }] });
    expect(a.client().capture).toHaveBeenCalledWith('word_saved', { count: 2, total: 12, source: 'scene', list: ['work', 'self'] });
    a.track('scan', { error: 'x'.repeat(200) });
    expect(a.client().capture.mock.calls[1][1].error).toHaveLength(64);
    a.setProps({ ui_lang: 'uk', level: 8, goals: ['work'], pro: false });
    expect(a.client().setPersonProperties).toHaveBeenCalledWith({ ui_lang: 'uk', level: 8, goals: ['work'], pro: false });
    expect(a.client().identify).not.toHaveBeenCalled();
  });

  test('a throwing SDK never reaches the UI', async () => {
    const a = load();
    a.initAnalytics();
    const c = a.client();
    c.capture.mockImplementation(() => {
      throw new Error('boom');
    });
    c.setPersonProperties.mockImplementation(() => Promise.reject(new Error('boom')));
    c.getFeatureFlag.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => a.track('scan', { ok: true })).not.toThrow();
    expect(() => a.setProps({ pro: true })).not.toThrow();
    expect(await a.flag('onboarding-flow', 'control')).toBe('control');
  });

  test('switched off in settings: no client at start', () => {
    const a = load();
    a.initAnalytics({ enabled: false });
    expect(a.PostHog.instances).toHaveLength(0);
    a.track('scan', { ok: true });
    expect(a.isEnabled()).toBe(false);
  });

  test('the settings toggle opts out and back in', () => {
    const a = load();
    a.initAnalytics();
    a.setAnalyticsEnabled(false);
    expect(a.client().optOut).toHaveBeenCalledTimes(1);
    a.track('scan', { ok: true });
    a.setProps({ pro: true });
    expect(a.client().capture).not.toHaveBeenCalled();
    expect(a.client().setPersonProperties).not.toHaveBeenCalled();
    a.setAnalyticsEnabled(true);
    expect(a.client().optIn).toHaveBeenCalled();
    a.track('scan', { ok: true });
    expect(a.client().capture).toHaveBeenCalledTimes(1);
  });

  test('turning it on later creates the client then', () => {
    const a = load();
    a.initAnalytics({ enabled: false });
    a.setAnalyticsEnabled(true);
    expect(a.PostHog.instances).toHaveLength(1);
    expect(a.isEnabled()).toBe(true);
  });

  test('erase gives a fresh anonymous id', () => {
    const a = load();
    a.initAnalytics();
    a.resetAnalytics();
    expect(a.client().reset).toHaveBeenCalledTimes(1);
  });
});

describe('feature flags', () => {
  test('cached flags answer at once', async () => {
    const a = load();
    a.initAnalytics();
    a.client().getFeatureFlag.mockImplementation((name) => (name === 'onboarding-flow' ? 'short' : false));
    expect(await a.flag('onboarding-flow', 'control')).toBe('short');
    expect(a.client().onFeatureFlags).not.toHaveBeenCalled();
  });

  test('not loaded yet: waits for them, but not longer than the timeout', async () => {
    const a = load();
    a.initAnalytics();
    const c = a.client();
    let loaded = null;
    let value;
    c.getFeatureFlag.mockImplementation(() => value);
    c.onFeatureFlags.mockImplementation((cb) => {
      loaded = cb;
      return () => (loaded = null);
    });
    const pending = a.flag('onboarding-flow', 'control', 1500);
    await Promise.resolve();
    value = 'short';
    loaded({ 'onboarding-flow': 'short' });
    expect(await pending).toBe('short');
    expect(loaded).toBeNull(); // відписались
  });

  test('flags that never arrive fall back after the timeout', async () => {
    jest.useFakeTimers();
    const a = load();
    a.initAnalytics();
    const pending = a.flag('onboarding-flow', 'control', 1500);
    jest.advanceTimersByTime(1499);
    let done = false;
    pending.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    jest.advanceTimersByTime(1);
    expect(await pending).toBe('control');
  });

  test('the value is shaped like the fallback', async () => {
    const a = load();
    a.initAnalytics();
    const c = a.client();
    // поза експериментом PostHog каже false — для рядкового прапорця це «control»
    c.getFeatureFlag.mockImplementation(() => false);
    expect(await a.flag('onboarding-flow', 'control')).toBe('control');
    expect(await a.flag('new-thing', true)).toBe(false);
    c.getFeatureFlag.mockImplementation(() => 'test');
    expect(await a.flag('new-thing', false)).toBe(true);
    c.getFeatureFlag.mockImplementation(() => null);
    expect(await a.flag('onboarding-flow', 'control')).toBe('control');
  });

  test('switched off: the fallback, without touching PostHog', async () => {
    const a = load();
    a.initAnalytics();
    a.setAnalyticsEnabled(false);
    expect(await a.flag('onboarding-flow', 'control')).toBe('control');
    expect(a.client().getFeatureFlag).not.toHaveBeenCalled();
  });
});
