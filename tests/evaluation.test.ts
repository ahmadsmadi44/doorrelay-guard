import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, enroll } from '../shared/vision';
import { fixture, referenceBox as box } from './fixtures';

// Generated regression cases, not a claim of accuracy on physical-camera footage.
for (const seed of [1, 17, 41, 97]) for (const brightness of [-12, 0, 12]) {
  test(`generated stable parcel: seed ${seed}, brightness ${brightness}`, () => {
    assert.equal(analyze(fixture([{ box }], brightness, seed), enroll(fixture([{ box }], 0, seed), box)).kind, 'present');
  });
}
for (const [x, y] of [[.61, .21], [.61, .41], [.11, .11], [.11, .61]]) for (const scale of [.85, 1, 1.15]) {
  test(`generated moved parcel: position ${x},${y}, scale ${scale}`, () => {
    const moved = { x, y, w: box.w * scale, h: box.h * scale };
    assert.equal(analyze(fixture([{ box: moved }]), enroll(fixture(), box)).kind, 'moved');
  });
}
test('two similar displaced parcels require review instead of a unique match', () => {
  const result = analyze(fixture([{ box: { ...box, x: .11, y: .11 } }, { box: { ...box, x: .61, y: .41 } }]), enroll(fixture(), box));
  assert.equal(result.kind, 'uncertain');
});
test('large global lighting change cannot produce movement', () => { assert.equal(analyze(fixture([], 90), enroll(fixture(), box)).kind, 'uncertain'); });
for (const angle of [-Math.PI / 12, Math.PI / 12]) test(`modest rotation ${angle} remains trackable after displacement`, () => {
  assert.equal(analyze(fixture([{ box: { ...box, x: .61, y: .21 }, angle }]), enroll(fixture(), box)).kind, 'moved');
});
test('out-of-frame and non-finite enrollment are rejected', () => {
  assert.throws(() => enroll(fixture(), { ...box, x: .99 }));
  assert.throws(() => enroll(fixture(), { ...box, w: NaN }));
});
