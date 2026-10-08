// Профілі EAS, на які посилаються USER_TODO.md (крок 8а), README.md і TESTING.md:
// `eas build --platform ios --profile simulator` має працювати без акаунта Apple
// і не чіпати production.
import fs from 'fs';
import path from 'path';

const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eas.json'), 'utf8'));

describe('eas.json', () => {
  test('simulator profile builds for the iOS simulator in the preview environment', () => {
    const p = eas.build.simulator;
    expect(p).toBeDefined();
    expect(p.ios.simulator).toBe(true);
    // preview, не production: ключ RevenueCat test_…, запобіжник релізу не втручається
    expect(p.environment).toBe('preview');
    expect(p.autoIncrement).toBeUndefined();
  });

  test('only the simulator profile targets the simulator', () => {
    for (const [name, p] of Object.entries(eas.build)) {
      expect(Boolean(p.ios && p.ios.simulator)).toBe(name === 'simulator');
    }
  });

  test('production profile still uses the production environment', () => {
    expect(eas.build.production.environment).toBe('production');
  });
});
