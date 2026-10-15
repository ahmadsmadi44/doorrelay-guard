import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('real HTTP lifecycle, access boundaries, speaker protocol, and restart recovery', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'doorrelay-test-'));
  let child: ChildProcess, base = '', cookie = '', speakerToken = '';
  async function start() {
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--production'], {
      env: { ...env, PORT: '0', HOST: '127.0.0.1', DOORRELAY_DATA_DIR: directory, RING_ACCESS_TOKEN: '', RING_WEBHOOK_SECRET: '' },
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 45000);
      child.once('error', reject);
      child.stdout!.on('data', bytes => { const match = String(bytes).match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); } });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited with ${code}`)); });
    });
  }
  async function stop() { if (!child || child.exitCode !== null) return; await new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill(); }); }
  t.after(async () => { await stop(); assert.ok(directory.startsWith(join(tmpdir(), 'doorrelay-test-'))); await rm(directory, { recursive: true, force: true }); });
  async function request(path: string, body?: unknown, role: 'admin' | 'speaker' | 'anonymous' = 'admin', extra: Record<string, string> = {}) {
    return fetch(base + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(role === 'admin' ? { Cookie: cookie } : role === 'speaker' ? { Authorization: `Bearer ${speakerToken}` } : {}), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function ok(path: string, body?: unknown, role: 'admin' | 'speaker' = 'admin') {
    const res = await request(path, body, role); const data = await res.json(); assert.equal(res.status, 200, JSON.stringify(data)); return data;
  }
  async function login() { const r = await request('/bootstrap', {}, 'anonymous'); assert.equal(r.status, 200); cookie = r.headers.get('set-cookie')!.split(';')[0]; }
  await start();
  await t.test('compiled dashboard, companion, and bundled video are served', async () => {
    const dashboard = await fetch(base + '/'); assert.equal(dashboard.status, 200); assert.match(await dashboard.text(), /DoorRelay Guard/);
    assert.equal((await fetch(base + '/speaker')).status, 200);
    const sample = await fetch(base + '/samples/generated-parcel-test.mp4', { headers: { Range: 'bytes=0-100' } });
    assert.equal(sample.status, 206); assert.match(sample.headers.get('content-type') || '', /video\/mp4/);
  });
  await t.test('dashboard access and CSRF are enforced', async () => {
    assert.equal((await request('/state', undefined, 'anonymous')).status, 401);
    assert.equal((await request('/bootstrap', {}, 'anonymous', { Origin: 'https://attacker.invalid' })).status, 403);
    await login(); assert.equal((await ok('/state')).parcel.status, 'unarmed');
    assert.equal((await request('/arm', { source: 'unknown' })).status, 400);
    assert.equal((await request('/speaker/heartbeat', { ready: true }, 'anonymous')).status, 401);
    assert.equal((await fetch(base + '/.doorrelay/state.json')).status, 404);
    assert.equal((await fetch(base + '/artifacts/end-to-end-report.json')).status, 404);
  });
  await t.test('pairing is single use and audio starts disabled', async () => {
    const pair = await ok('/pairing', {});
    const r = await request('/speaker/pair', { code: pair.code }, 'anonymous'); assert.equal(r.status, 200); speakerToken = (await r.json()).token;
    assert.equal((await request('/speaker/pair', { code: pair.code }, 'anonymous')).status, 403);
    assert.equal((await ok('/state')).speaker.ready, false);
    assert.equal((await request('/warn', {})).status, 400);
    await ok('/speaker/heartbeat', { ready: true }, 'speaker'); assert.equal((await ok('/state')).speaker.ready, true);
  });
  await t.test('pixels-to-policy observation protocol creates one incident and one warning', async () => {
    await ok('/arm', { source: 'synthetic' }); await ok('/settings', { autoWarn: true });
    const session = (await ok('/state')).parcel.session;
    for (let n = 0; n < 6; n++) { await ok('/observe', { session, source: 'synthetic', kind: 'moved', score: .95 }); await new Promise(r => setTimeout(r, 200)); }
    const state = await ok('/state'); assert.equal(state.incidents.length, 1); assert.equal(state.commands.length, 1); assert.equal(state.parcel.status, 'review');
    const beat = await ok('/speaker/heartbeat', { ready: true }, 'speaker'); assert.equal(beat.commands.length, 1);
    const id = beat.commands[0].id;
    assert.equal((await request('/speaker/ack', { id, status: 'completed' }, 'speaker')).status, 400);
    assert.equal((await ok('/speaker/ack', { id, status: 'started' }, 'speaker')).status, 'started');
    assert.equal((await ok('/speaker/ack', { id, status: 'completed' }, 'speaker')).status, 'completed');
    await ok('/speaker/ack', { id, status: 'completed' }, 'speaker');
    assert.equal((await ok('/state')).timeline.filter((e: { title: string }) => e.title === 'Speaker confirmed playback').length, 1);
    assert.equal((await ok('/speaker/heartbeat', { ready: true }, 'speaker')).commands.length, 0);
  });
  await t.test('pickup suppression and collection confirmation', async () => {
    await ok('/arm', { source: 'synthetic' }); await ok('/pickup', {});
    const session = (await ok('/state')).parcel.session;
    for (let n = 0; n < 5; n++) { await ok('/observe', { session, source: 'synthetic', kind: 'moved', score: 1 }); await new Promise(r => setTimeout(r, 200)); }
    assert.equal((await ok('/state')).incidents.length, 1);
    await ok('/collect', {}); assert.equal((await ok('/state')).parcel.status, 'collected');
  });
  await t.test('muted and revoked speakers cannot receive or acknowledge warnings', async () => {
    const state = await ok('/state');
    await new Promise(r => setTimeout(r, Math.max(0, state.commands[0].createdAt + 20050 - Date.now())));
    await ok('/speaker/heartbeat', { ready: true }, 'speaker'); await ok('/warn', {});
    const id = (await ok('/state')).commands[0].id;
    await ok('/speaker/heartbeat', { ready: false }, 'speaker'); assert.equal((await request('/warn', {})).status, 400);
    assert.equal((await ok('/speaker/ack', { id, status: 'started' }, 'speaker')).status, 'expired');
    assert.equal((await ok('/speaker/ack', { id, status: 'completed' }, 'speaker')).status, 'expired');
    const states = (await ok('/speaker/heartbeat', { ready: true }, 'speaker')).commandStates;
    assert.equal(states.find((c: {id:string}) => c.id === id).status, 'expired');
    await ok('/speaker/unpair', {}, 'speaker');
    assert.equal((await request('/speaker/heartbeat', { ready: true }, 'speaker')).status, 401);
    assert.equal((await ok('/state')).speaker.connected, false);
  });
  await t.test('report excludes credentials and evidence can be cleared', async () => {
    const report = await ok('/export'); assert.equal(report.application, 'DoorRelay Guard');
    assert.equal(JSON.stringify(report).includes(speakerToken), false); assert.equal('ringToken' in report, false);
    await ok('/clear-evidence', {}); assert.equal((await ok('/state')).parcel.reference, undefined);
  });
  await t.test('restart retains audit history but never resumes observation', async () => {
    await ok('/arm', { source: 'synthetic' }); await stop(); await start();
    assert.equal((await request('/state')).status, 401); await login();
    const state = await ok('/state'); assert.equal(state.parcel.status, 'unarmed'); assert.equal(state.parcel.session, ''); assert.ok(state.timeline.length > 0);
    assert.equal(state.speaker.ready, false); assert.equal(state.ring.configured, false);
  });
});
