import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const normalizeNewlines = source => source.replace(/\r\n/g, '\n');
const dbSelectPattern =
  /async function dbSelect\(table, query\)\{[\s\S]*?\n\}\n\n\/\/ 分页拉全量/;
const html = normalizeNewlines(
  readFileSync(new URL('./index.html', import.meta.url), 'utf8'),
);
const match = html.match(dbSelectPattern);

if (!match) throw new Error('index.html 中未找到 dbSelect');
const dbSelectSource = match[0].replace(/\n\n\/\/ 分页拉全量$/, '');

test('test harness extracts dbSelect from CRLF HTML', () => {
  const crlfHtml = html.replace(/\n/g, '\r\n');
  assert.ok(normalizeNewlines(crlfHtml).match(dbSelectPattern));
});

function loadDbSelect(fetchImpl, delays = []) {
  const context = {
    fetch: fetchImpl,
    setTimeout: (callback, delay) => {
      delays.push(delay);
      callback();
    },
  };
  vm.runInNewContext(
    `const SUPABASE_URL = "https://example.supabase.co";
     const SUPABASE_KEY = "test-key";
     ${dbSelectSource}
     globalThis.dbSelect = dbSelect;`,
    context,
  );
  return context.dbSelect;
}

test('dbSelect retries each supported transient status', async t => {
  for (const status of [500, 502, 503, 504]) {
    await t.test(String(status), async () => {
      let calls = 0;
      const delays = [];
      const dbSelect = loadDbSelect(async () => {
        calls += 1;
        if (calls === 1) return { ok: false, status };
        return { ok: true, status: 200, json: async () => [{ symbol: 'sfJQ00.ZF' }] };
      }, delays);

      const result = await dbSelect('weekly_bars', 'select=symbol');

      assert.equal(calls, 2);
      assert.deepEqual(delays, [600]);
      assert.deepEqual(JSON.parse(JSON.stringify(result)), [{ symbol: 'sfJQ00.ZF' }]);
    });
  }
});

test('dbSelect does not retry non-transient 4xx responses', async t => {
  for (const status of [400, 401, 404, 429]) {
    await t.test(String(status), async () => {
      let calls = 0;
      const delays = [];
      const dbSelect = loadDbSelect(async () => {
        calls += 1;
        return { ok: false, status };
      }, delays);

      await assert.rejects(
        dbSelect('weekly_bars', 'select=missing_column'),
        new RegExp(`weekly_bars HTTP ${status}`),
      );
      assert.equal(calls, 1);
      assert.deepEqual(delays, []);
    });
  }
});

test('dbSelect can recover on the fourth and final attempt', async () => {
  let calls = 0;
  const delays = [];
  const dbSelect = loadDbSelect(async () => {
    calls += 1;
    if (calls < 4) return { ok: false, status: 503 };
    return { ok: true, status: 200, json: async () => [{ week_date: '2026-08-28' }] };
  }, delays);

  const result = await dbSelect('weekly_bars', 'select=week_date');

  assert.equal(calls, 4);
  assert.deepEqual(delays, [600, 1200, 2400]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [{ week_date: '2026-08-28' }]);
});

test('dbSelect throws the final transient error after exhausting retries', async () => {
  let calls = 0;
  const delays = [];
  const dbSelect = loadDbSelect(async () => {
    calls += 1;
    return { ok: false, status: 504 };
  }, delays);

  await assert.rejects(
    dbSelect('weekly_bars', 'select=symbol'),
    { message: 'weekly_bars HTTP 504' },
  );
  assert.equal(calls, 4);
  assert.deepEqual(delays, [600, 1200, 2400]);
});
