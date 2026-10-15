import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, enroll, type Frame } from '../shared/vision';
const box = { x: .44, y: .62, w: .16, h: .18 };
function frame(x = .44, y = .62, visible = true, brightness = 0): Frame {
  const width = 240, height = 135, data = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    let v = 65;
    if (visible && px >= x * width && px < (x + box.w) * width && py >= y * height && py < (y + box.h) * height) {
      const dx = (px - x * width) / (box.w * width), dy = (py - y * height) / (box.h * height);
      v = dx < .3 ? 220 : dy < .35 ? 160 : dx > .6 && dx < .75 ? 200 : 100;
    }
    const i = (py * width + px) * 4; data[i] = data[i + 1] = data[i + 2] = v + brightness; data[i + 3] = 255;
  }
  return { width, height, data };
}
test('reference remains present when unchanged or mildly brighter', () => {
  const r = enroll(frame(), box); assert.equal(analyze(frame(), r).kind, 'present'); assert.equal(analyze(frame(.44, .62, true, 10), r).kind, 'present');
});
test('positive template match elsewhere is movement', () => { const r = enroll(frame(), box); assert.equal(analyze(frame(.64, .50), r).kind, 'moved'); });
test('absent or obscured parcel is uncertain, not confirmed movement', () => { const r = enroll(frame(), box); assert.equal(analyze(frame(.44, .62, false), r).kind, 'uncertain'); });
test('featureless enrollment is rejected', () => { assert.throws(() => enroll(frame(.44, .62, false), box), /little visual detail/); });
