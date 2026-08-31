import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const offsetMatch = html.match(/const reversalLabelOffset = index => \[[^;]+;/);
const assignMatch = html.match(/function assignReversalOffsets\(source, limit, reversalTimes, byTime\)\{[\s\S]*?\n\}/);
const layoutMatch = html.match(/function layoutMarkerLabels\(items, options\)\{[\s\S]*?\n\}\nconst markerSeriesHandler/);
const handlerMatch = html.match(/const markerSeriesHandler = \{[\s\S]*?\n\};\n\nfunction initChart/);
if (!offsetMatch) throw new Error('index.html 中未找到 reversalLabelOffset');
if (!assignMatch) throw new Error('index.html 中未找到 assignReversalOffsets');
if (!layoutMatch) throw new Error('index.html 中未找到 layoutMarkerLabels');
if (!handlerMatch) throw new Error('index.html 中未找到 markerSeriesHandler');
const layoutSource = layoutMatch[0].replace(/\nconst markerSeriesHandler$/, '');
const handlerSource = handlerMatch[0].replace(/\n\nfunction initChart$/, '');

test('stable chronological groups assign a low-middle-high-middle-low mountain', () => {
  const context = {};
  vm.runInNewContext(
    `${offsetMatch[0]}\n${assignMatch[0]}\nglobalThis.assignReversalOffsets = assignReversalOffsets;`,
    context,
  );
  const dates = ['a', 'b', 'c', 'd', 'e', 'gap1', 'gap2', 'gap3', 'gap4', 'gap5', 'f'];
  const byTime = Object.fromEntries(dates.map(time => [time, { time }]));
  context.assignReversalOffsets(dates.map(week_date => ({ week_date })), dates.length - 1, new Set(['a', 'b', 'c', 'd', 'e', 'f']), byTime);
  assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map(time => byTime[time].reversalOffset), [0, 16, 32, 16, 0]);
  assert.equal(byTime.f.reversalOffset, 0);
});

test('real layout renders a dense low-middle-high-middle-low mountain without badges', () => {
  const dates = ['2026-07-17', '2026-07-24', '2026-07-31', '2026-08-07', '2026-08-14'];
  const drawn = [];
  const context = {
    chart: { timeScale: () => ({ timeToCoordinate: key => 80 + dates.indexOf(key) * 10 }) },
    markerState: {
      bars: dates.map((markerKey, index) => ({
        originalData: { markerKey, ref: 10, high: 12, low: 8, up: 0, down: 0, reversal: true, reversalOffset: [0, 16, 32, 16, 0][index], trend: null, badge: false },
      })),
      barSpacing: 10,
    },
    drawArrow: () => {},
    trendLabel: () => '趋势1',
  };
  vm.runInNewContext(
    `${layoutSource}\n${handlerSource}\nglobalThis.markerSeriesHandler = markerSeriesHandler;`,
    context,
  );
  const canvas = {
    textAlign: 'center', textBaseline: 'middle',
    measureText: () => ({ width: 20 }),
    fillText: (label, x, y) => { if (label === '反转') drawn.push({ x, y }); },
    beginPath: () => {}, arc: () => {}, fill: () => {},
  };
  const target = {
    useMediaCoordinateSpace: callback => callback({ context: canvas, mediaSize: { width: 300, height: 300 } }),
  };
  context.markerSeriesHandler.renderer().draw(target, () => 220);
  assert.equal(drawn.length, 5);
  const first = drawn[0].y;
  assert.deepEqual(drawn.map(item => item.y - first), [0, -16, -32, -16, 0]);
  assert.ok(!html.includes('function drawReversalBadge'));
});
