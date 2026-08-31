import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const match = html.match(
  /function layoutMarkerLabels\(items, options\)\{[\s\S]*?\n\}\nconst markerSeriesHandler/
);

if (!match) throw new Error('index.html 中未找到 layoutMarkerLabels');
const layoutSource = match[0].replace(/\nconst markerSeriesHandler$/, '');
const context = {};
vm.runInNewContext(`${layoutSource}\nglobalThis.layoutMarkerLabels = layoutMarkerLabels;`, context);
const { layoutMarkerLabels } = context;

test('layout keeps reversal and trend labels for the same week when their rectangles do not overlap', () => {
  const placements = layoutMarkerLabels([
    { key: 'trend', label: '趋势1', labelWidth: 30, x: 120, baseY: 120, laneDirection: -1, priority: 2 },
    { key: 'reversal', label: '反转', labelWidth: 24, x: 120, baseY: 92, laneDirection: -1, priority: 4 },
  ], { width: 300, height: 200, labelHeight: 12, laneCount: 3, laneGap: 4 });

  assert.deepEqual(
    JSON.parse(JSON.stringify(placements.map(item => [item.key, item.showLabel]))),
    [['reversal', true], ['trend', true]],
  );
});

test('layout still hides a same-week label whose rectangle overlaps an existing label', () => {
  const placements = layoutMarkerLabels([
    { key: 'trend', label: '趋势1', labelWidth: 30, x: 120, baseY: 120, laneDirection: -1, priority: 2 },
    { key: 'reversal', label: '反转', labelWidth: 24, x: 120, baseY: 120, laneDirection: -1, priority: 4 },
  ], { width: 300, height: 200, labelHeight: 12, laneCount: 1, laneGap: 4 });

  assert.deepEqual(
    JSON.parse(JSON.stringify(placements.map(item => [item.key, item.showLabel]))),
    [['reversal', true], ['trend', false]],
  );
});
