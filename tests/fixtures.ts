import type { Frame } from '../shared/vision';
import type { Box } from '../shared/types';
export const referenceBox = { x: .3, y: .52, w: .2, h: .24 };
export function fixture(objects: { box: Box; angle?: number }[] = [{ box: referenceBox }], brightness = 0, seed = 1): Frame {
  const width = 240, height = 135, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let value = 48 + ((x * 7 + y * 13 + seed) % 7);
    for (const { box, angle = 0 } of objects) {
      const dx = x - (box.x + box.w / 2) * width, dy = y - (box.y + box.h / 2) * height;
      const u = (dx * Math.cos(angle) + dy * Math.sin(angle)) / (box.w * width) + .5;
      const v = (-dx * Math.sin(angle) + dy * Math.cos(angle)) / (box.h * height) + .5;
      if (u >= 0 && u < 1 && v >= 0 && v < 1) value = u < .22 ? 200 : v < .3 ? 155 : u > .52 && u < .72 ? 220 : 95;
    }
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value + brightness; data[i + 3] = 255;
  }
  return { width, height, data };
}
