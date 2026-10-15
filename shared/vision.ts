import type { Box, ObservationKind } from './types';
export interface Frame { width: number; height: number; data: ArrayLike<number> }
export interface Reference { box: Box; patch: number[]; mean: number; texture: number; frame: number[] }
const N = 18;
function luminance(frame: Frame, x: number, y: number) {
  const i = (Math.min(frame.height - 1, Math.max(0, Math.floor(y))) * frame.width + Math.min(frame.width - 1, Math.max(0, Math.floor(x)))) * 4;
  return frame.data[i] * 0.299 + frame.data[i + 1] * 0.587 + frame.data[i + 2] * 0.114;
}
function patch(frame: Frame, b: Box, angle = 0) {
  const values = [];
  const cos = Math.cos(angle), sin = Math.sin(angle);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = ((x + .5) / N - .5) * b.w * frame.width, dy = ((y + .5) / N - .5) * b.h * frame.height;
    values.push(luminance(frame, (b.x + b.w / 2) * frame.width + dx * cos - dy * sin, (b.y + b.h / 2) * frame.height + dx * sin + dy * cos));
  }
  return values;
}
function mean(a: number[]) { return a.reduce((s, v) => s + v, 0) / a.length; }
function error(a: number[], b: number[], ma: number, mb: number) { return a.reduce((s, v, i) => s + Math.abs((v - ma) - (b[i] - mb)), 0) / a.length; }
export function enroll(frame: Frame, box: Box): Reference {
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.x < 0 || box.y < 0 || box.x + box.w > 1.001 || box.y + box.h > 1.001) throw new Error('Keep the parcel area inside the video frame.');
  const values = patch(frame, box), m = mean(values);
  const texture = mean(values.map(v => Math.abs(v - m)));
  if (box.w < .035 || box.h < .04) throw new Error('Select a larger parcel area, including its edges.');
  if (texture < 8) throw new Error('This area has too little visual detail. Include the parcel label and edges.');
  return { box, patch: values, mean: m, texture, frame: patch(frame, { x: 0, y: 0, w: 1, h: 1 }) };
}
export function analyze(frame: Frame, reference: Reference): { kind: ObservationKind; score: number; box: Box; reason: string } {
  const current = patch(frame, reference.box), m = mean(current);
  const originalError = error(current, reference.patch, m, reference.mean);
  const sceneMean = mean(patch(frame, { x: 0, y: 0, w: 1, h: 1 }));
  if (Math.abs(sceneMean - mean(reference.frame)) > 70) return { kind: 'uncertain', score: 0, box: reference.box, reason: 'Lighting or visibility changed substantially.' };
  if (originalError < 13) return { kind: 'present', score: Math.max(0, 1 - originalError / 40), box: reference.box, reason: 'Reference appearance remains in place.' };
  let bestError = Infinity, bestBox = reference.box, bestAngle = 0;
  const candidates: { box: Box; error: number; angle: number }[] = [];
  const step = .025;
  for (const scale of [1, .85, 1.15]) for (const angle of [0, -Math.PI / 12, Math.PI / 12]) {
  for (let y = .01; y <= 1 - reference.box.h * scale; y += step) for (let x = .01; x <= 1 - reference.box.w * scale; x += step) {
    if (Math.hypot(x - reference.box.x, y - reference.box.y) < .045) continue;
    const b = { x, y, w: reference.box.w * scale, h: reference.box.h * scale }, p = patch(frame, b, angle), pm = mean(p);
    if (Math.abs(pm - reference.mean) > 55) continue;
    const e = error(p, reference.patch, pm, reference.mean);
    if (e < 20) candidates.push({ box: b, error: e, angle });
    if (e < bestError) { bestError = e; bestBox = b; bestAngle = angle; }
  }}
  const anchors = [{ box: bestBox, error: bestError, angle: bestAngle }];
  for (const c of candidates.sort((a, b) => a.error - b.error)) {
    if (anchors.length >= 4) break;
    if (anchors.every(a => Math.hypot(c.box.x - a.box.x, c.box.y - a.box.y) > Math.max(a.box.w, a.box.h))) anchors.push(c);
  }
  const refined: typeof candidates = [];
  for (const anchor of anchors) {
  const coarse = anchor.box; let localError = anchor.error, localBox = coarse;
  for (let dy = -.015; dy <= .015; dy += .005) for (let dx = -.015; dx <= .015; dx += .005) {
    const b = { ...coarse, x: coarse.x + dx, y: coarse.y + dy };
    if (b.x < 0 || b.y < 0 || b.x + b.w > 1 || b.y + b.h > 1) continue;
    const p = patch(frame, b, anchor.angle), pm = mean(p);
    if (Math.abs(pm - reference.mean) > 55) continue;
    const e = error(p, reference.patch, pm, reference.mean);
    if (e < localError) { localError = e; localBox = b; }
  }
  refined.push({ box: localBox, error: localError, angle: anchor.angle });
  if (localError < bestError) { bestError = localError; bestBox = localBox; }
  }
  // Quantization and small alignment changes can shift an otherwise equal match by a few gray levels.
  const ambiguous = refined.some(c => c.error < bestError + 6 && Math.hypot(c.box.x + c.box.w / 2 - bestBox.x - bestBox.w / 2, c.box.y + c.box.h / 2 - bestBox.y - bestBox.h / 2) > Math.max(bestBox.w, bestBox.h));
  if (ambiguous) return { kind: 'uncertain', score: 0, box: reference.box, reason: 'Several areas look like the parcel. Review the scene.' };
  // A lost template is uncertainty, never evidence of removal. Only a positive match elsewhere is movement.
  if (bestError < 16 && bestError < originalError * .65) return { kind: 'moved', score: Math.max(0, 1 - bestError / 40), box: bestBox, reason: 'Reference appearance found outside the original position.' };
  return { kind: 'uncertain', score: 0, box: reference.box, reason: 'Parcel is occluded, missing, or no longer matches. Review needed.' };
}
