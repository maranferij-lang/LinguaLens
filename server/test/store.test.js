// store.create — «лише якщо документа ще немає». Однаково у файловому
// режимі й на емуляторі Firestore (CI ганяє цей файл в обох).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-store-'));
process.env.DATA_FILE = path.join(dir, 'data.json');
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const store = require('../store');

test('create writes a new document and refuses to overwrite an existing one', async () => {
  const id = 'c-' + crypto.randomUUID();
  const first = await store.create('probe', id, { owner: 'a', n: 1, nested: { ok: true } });
  assert.equal(first.ok, true);
  assert.ok(first.version);
  const second = await store.create('probe', id, { owner: 'b', n: 2 });
  assert.deepEqual(second, { ok: false, reason: 'exists' });
  assert.deepEqual({ ...(await store.get('probe', id)) }, { owner: 'a', n: 1, nested: { ok: true } });

  // версія від create годиться для умовного запису
  const doc = await store.get('probe', id);
  assert.equal((await store.update('probe', id, { n: 3 }, { version: doc.__version })).ok, true);
  assert.equal((await store.update('probe', id, { n: 4 }, { version: doc.__version })).ok, false);

  // після видалення — знову можна створити
  await store.del('probe', id);
  assert.equal((await store.create('probe', id, { owner: 'c' })).ok, true);
  assert.equal((await store.get('probe', id)).owner, 'c');
});

test('of many simultaneous creates exactly one wins', async () => {
  const id = 'race-' + crypto.randomUUID();
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => store.create('probe', id, { owner: 'w' + i })));
  const winners = results.filter((r) => r.ok);
  assert.equal(winners.length, 1);
  assert.ok(results.filter((r) => !r.ok).every((r) => r.reason === 'exists'));
  const owner = (await store.get('probe', id)).owner;
  assert.equal(results.findIndex((r) => r.ok), Number(owner.slice(1)));
});
