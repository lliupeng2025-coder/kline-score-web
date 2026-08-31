import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const match = html.match(/const markerSeriesHandler = \{[\s\S]*?\n\};\n\nfunction initChart/);

if (!match) throw new Error('index.html 中未找到 markerSeriesHandler');
const handlerSource = match[0].replace(/\n\nfunction initChart$/, '');

function renderOneBar(reversal) {
  const badgeCalls = [];
  const key = '2026-08-07';
  const context = {
    chart: { timeScale: () => ({ timeToCoordinate: () => 120 }) },
    markerState: {
      bars: [{ originalData: { markerKey: key, ref: 10, high: 12, low: 8, up: 0, down: 0, reversal, trend: null, badge: false } }],
      barSpacing: 10,
    },
    drawArrow: () => {},
    drawReversalBadge: (...args) => badgeCalls.push(args),
    trendLabel: () => '趋势1',
    layoutMarkerLabels: () => [{ key: `${key}:reversal`, showLabel: false }],
  };
  vm.runInNewContext(`${handlerSource}\nglobalThis.markerSeriesHandler = markerSeriesHandler;`, context);
  const canvas = {
    textAlign: 'center', textBaseline: 'middle',
    measureText: () => ({ width: 20 }),
    fillText: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
  };
  const target = {
    useMediaCoordinateSpace: callback => callback({ context: canvas, mediaSize: { width: 300, height: 200 } }),
  };
  context.markerSeriesHandler.renderer().draw(target, value => 160 - value * 8);
  return badgeCalls;
}

test('renderer draws a reversal badge even when its text placement is hidden', () => {
  const calls = renderOneBar(true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 120);
});

test('renderer does not draw a reversal badge for a non-reversal week', () => {
  assert.equal(renderOneBar(false).length, 0);
});
