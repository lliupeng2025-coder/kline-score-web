import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const match = html.match(/const markerSeriesHandler = \{[\s\S]*?\n\};\n\nfunction initChart/);
const offsetMatch = html.match(/const reversalLabelOffset = index => \[[^;]+;/);
if (!match) throw new Error('index.html 中未找到 markerSeriesHandler');
if (!offsetMatch) throw new Error('index.html 中未找到 reversalLabelOffset');
const handlerSource = match[0].replace(/\n\nfunction initChart$/, '');

test('dense reversal labels form a low-middle-high-middle-low mountain without badges', () => {
  const dates = ['2026-07-17', '2026-07-24', '2026-07-31', '2026-08-07', '2026-08-14'];
  const captured = [];
  let badgeCalls = 0;
  const context = {
    chart: { timeScale: () => ({ timeToCoordinate: key => 80 + dates.indexOf(key) * 10 }) },
    markerState: {
      bars: dates.map(markerKey => ({
        originalData: { markerKey, ref: 10, high: 12, low: 8, up: 0, down: 0, reversal: true, trend: null, badge: false },
      })),
      barSpacing: 10,
    },
    drawArrow: () => {},
    drawReversalBadge: () => { badgeCalls += 1; },
    trendLabel: () => '趋势1',
    layoutMarkerLabels: items => {
      captured.push(...items.filter(item => item.key.endsWith(':reversal')));
      return items.map(item => ({ key: item.key, showLabel: true, labelX: item.x, labelY: item.baseY }));
    },
  };
  vm.runInNewContext(`${offsetMatch[0]}\n${handlerSource}\nglobalThis.markerSeriesHandler = markerSeriesHandler;`, context);
  const canvas = {
    textAlign: 'center', textBaseline: 'middle',
    measureText: () => ({ width: 20 }), fillText: () => {},
    beginPath: () => {}, arc: () => {}, fill: () => {},
  };
  const target = {
    useMediaCoordinateSpace: callback => callback({ context: canvas, mediaSize: { width: 300, height: 300 } }),
  };
  context.markerSeriesHandler.renderer().draw(target, () => 220);

  assert.equal(badgeCalls, 0);
  assert.equal(captured.length, 5);
  const first = captured[0].baseY;
  assert.deepEqual(captured.map(item => item.baseY - first), [0, -16, -32, -16, 0]);
  assert.ok(!html.includes('function drawReversalBadge'));
});
