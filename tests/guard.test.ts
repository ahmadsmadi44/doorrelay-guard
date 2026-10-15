import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Guard } from '../server/guard';
function setup() {
  let now = 10_000;
  const guard = new Guard(undefined, () => now); guard.arm('synthetic');
  return { guard, advance: (ms: number) => { now += ms; guard.tick(); }, observe: (kind: 'present' | 'moved' | 'uncertain', ready = false) => { now += 400; guard.observe({ kind, source: 'synthetic', session: guard.state.parcel.session, score: .9 }, ready); } };
}
test('sustained movement creates one review incident; repeated observations do not duplicate it', () => {
  const { guard, observe } = setup(); for (let i = 0; i < 3; i++) observe('moved'); assert.equal(guard.state.incidents.length, 0);
  observe('moved'); assert.equal(guard.state.incidents.length, 1); for (let i = 0; i < 8; i++) observe('moved'); assert.equal(guard.state.incidents.length, 1);
});
test('occlusion clears movement streak and never queues sound', () => {
  const { guard, observe } = setup(); guard.state.autoWarn = true;
  observe('moved'); observe('moved'); observe('uncertain'); observe('moved'); observe('moved');
  assert.equal(guard.state.incidents.length, 0); assert.equal(guard.state.commands.length, 0);
});
test('authorized pickup suppresses warnings, then explicit confirmation transfers custody', () => {
  const { guard, observe } = setup(); guard.state.autoWarn = true; guard.pickup();
  for (let i = 0; i < 8; i++) observe('moved', true);
  assert.equal(guard.state.incidents.length, 0); guard.collect(); assert.equal(guard.state.parcel.status, 'collected');
});
test('expired pickup does not authorize later movement', () => {
  const { guard, observe, advance } = setup(); guard.pickup(); advance(120001);
  assert.throws(() => guard.collect()); for (let i = 0; i < 4; i++) observe('moved'); assert.equal(guard.state.incidents.length, 1);
});
test('stream gap resets the streak; old-source observations cannot change state', () => {
  const { guard, observe, advance } = setup(); observe('moved'); observe('moved'); advance(3000); observe('moved'); observe('moved');
  assert.equal(guard.state.incidents.length, 0);
  guard.observe({ kind: 'moved', source: 'ring', session: guard.state.parcel.session, score: 1 }, true); assert.equal(guard.state.incidents.length, 0);
});
test('no ready speaker means no automatic warning, even with auto policy', () => {
  const { guard, observe } = setup(); guard.state.autoWarn = true; for (let i = 0; i < 4; i++) observe('moved');
  assert.equal(guard.state.commands.length, 0);
});
test('warning needs started then completed acknowledgement; expiration cannot be resurrected', () => {
  const { guard, observe, advance } = setup(); guard.state.autoWarn = true; for (let i = 0; i < 4; i++) observe('moved', true);
  const c = guard.state.commands[0]; assert.equal(c.status, 'pending'); assert.throws(() => guard.acknowledge(c.id, 'completed'));
  guard.acknowledge(c.id, 'started'); assert.equal(c.status, 'started'); advance(16_000); guard.acknowledge(c.id, 'completed'); assert.equal(c.status, 'expired');
});
test('return requires stable observations and cancels pending audio', () => {
  const { guard, observe } = setup(); guard.state.autoWarn = true; for (let i = 0; i < 4; i++) observe('moved', true);
  for (let i = 0; i < 3; i++) observe('present'); assert.equal(guard.state.parcel.status, 'review'); observe('present');
  assert.equal(guard.state.parcel.status, 'returned'); assert.equal(guard.state.incidents[0].status, 'returned'); assert.equal(guard.state.commands[0].status, 'expired');
});
test('rapid duplicate frames cannot manufacture a movement event', () => {
  const { guard } = setup(); for (let i = 0; i < 10; i++) guard.observe({ kind: 'moved', source: 'synthetic', session: guard.state.parcel.session, score: .9 }, false);
  assert.equal(guard.state.incidents.length, 0);
});
test('false alarm resolution stops tracking until re-enrollment', () => {
  const { guard, observe } = setup(); for (let i = 0; i < 4; i++) observe('moved'); guard.resolve('dismissed');
  for (let i = 0; i < 8; i++) observe('moved'); assert.equal(guard.state.incidents.length, 1); assert.equal(guard.state.parcel.status, 'unarmed');
});

test('starting a pickup cancels a warning that has not played', () => {
  const { guard, observe } = setup(); guard.state.autoWarn = true;
  for (let i = 0; i < 4; i++) observe('moved', true);
  guard.pickup(); assert.equal(guard.state.commands[0].status, 'expired');
});

test('re-enrollment supersedes old reviews and rejects old session frames', () => {
  const { guard, observe } = setup(); const oldSession = guard.state.parcel.session;
  for (let i = 0; i < 4; i++) observe('moved'); guard.arm('synthetic');
  assert.equal(guard.state.incidents[0].status, 'superseded');
  guard.observe({ kind: 'moved', source: 'synthetic', session: oldSession, score: 1 }, true);
  assert.equal(guard.state.observation, null);
});

test('a second incident during warning cooldown still enters review without throwing', () => {
  const { guard, observe } = setup(); guard.state.autoWarn = true;
  for (let i = 0; i < 4; i++) observe('moved', true);
  for (let i = 0; i < 4; i++) observe('present', true);
  for (let i = 0; i < 4; i++) observe('moved', true);
  assert.equal(guard.state.incidents.length, 2); assert.equal(guard.state.commands.length, 1);
  assert.equal(guard.state.parcel.status, 'review');
});
test('video ending preserves an active pickup so the resident can confirm collection', () => {
  const { guard } = setup(); guard.pickup(); guard.stopObserving();
  assert.equal(guard.state.parcel.status, 'pickup'); assert.equal(guard.state.parcel.session, '');
  guard.collect(); assert.equal(guard.state.parcel.status, 'collected');
});
test('video ending preserves a review and cancels pending sound', () => {
  const { guard, observe } = setup(); guard.state.autoWarn = true;
  for (let i = 0; i < 4; i++) observe('moved', true);
  guard.stopObserving(); assert.equal(guard.state.parcel.status, 'review'); assert.equal(guard.state.commands[0].status, 'expired');
});
