import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const match = html.match(/function drawReversalBadge\(ctx, x, y\)\{[\s\S]*?\n\}/);

if (!match) throw new Error('index.html 中未找到 drawReversalBadge');
const context = {};
vm.runInNewContext(`${match[0]}\nglobalThis.drawReversalBadge = drawReversalBadge;`, context);

test('drawReversalBadge always paints a visible reversal badge at the K-line coordinate', () => {
  const calls = [];
  const ctx = {
    beginPath: () => calls.push('beginPath'),
    arc: (...args) => calls.push(['arc', ...args]),
    fill: () => calls.push('fill'),
    fillText: (...args) => calls.push(['fillText', ...args]),
  };

  context.drawReversalBadge(ctx, 120, 88);

  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'arc' && call[1] === 120 && call[2] === 88));
  assert.ok(calls.includes('fill'));
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'fillText' && call[1] === '反'));
});
