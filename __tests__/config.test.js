// Expo вбудовує EXPO_PUBLIC_* у релізну збірку лише за дослівним записом
// process.env.EXPO_PUBLIC_X. Динамічний доступ працює в розробці й тихо
// ламає TestFlight (порожня адреса сервера, немає ключа RevenueCat).
import fs from 'fs';
import path from 'path';

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.jsx?$/.test(e.name) ? [p] : [];
  });
}

test('EXPO_PUBLIC_* variables are only read with static dot access', () => {
  const root = path.join(__dirname, '..');
  const files = [path.join(root, 'App.js'), ...sources(path.join(root, 'src'))];
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    expect({ file, dynamic: /process\.env\s*\[/.test(code), destructured: /\}\s*=\s*process\.env\b/.test(code) }).toEqual({
      file,
      dynamic: false,
      destructured: false,
    });
  }
});

test('config reads the server URL from EXPO_PUBLIC_SERVER_URL', () => {
  process.env.EXPO_PUBLIC_SERVER_URL = ' https://api.example.test ';
  jest.isolateModules(() => {
    const config = require('../src/config');
    expect(config.SERVER_URL).toBe('https://api.example.test');
    expect(config.SERVER_SOURCE).toBe('env');
    expect(config.PRIVACY_URL).toBe('https://api.example.test/privacy');
  });
  delete process.env.EXPO_PUBLIC_SERVER_URL;
});
