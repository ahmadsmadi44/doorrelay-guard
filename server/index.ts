import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { randomBytes, randomInt, timingSafeEqual, createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { Guard, createState } from './guard';
import type { GuardState, ObservationKind, SourceKind } from '../shared/types';

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT || 4173), host = process.env.HOST || '127.0.0.1';
const folder = resolve(process.env.DOORRELAY_DATA_DIR || '.doorrelay'); mkdirSync(folder, { recursive: true });
let initial = createState();
try { initial = JSON.parse(readFileSync(resolve(folder, 'state.json'), 'utf8')); } catch { /* First run. */ }
// Never resume protection or queued sound after an unattended restart.
initial.parcel.status = 'unarmed'; initial.parcel.session = ''; initial.observation = null; initial.pickupUntil = 0;
initial.commands = initial.commands.map(c => ['pending', 'started'].includes(c.status) ? { ...c, status: 'expired' } : c);
const guard = new Guard(initial);
const persist = () => { writeFileSync(resolve(folder, 'state.tmp'), JSON.stringify(guard.state)); renameSync(resolve(folder, 'state.tmp'), resolve(folder, 'state.json')); };
const adminSession = randomBytes(32).toString('hex');
let ringToken = process.env.RING_ACCESS_TOKEN || '';
let pairing: { code: string; expiresAt: number } | null = null;
let speaker: { token: string; ready: boolean; seen: number } | null = null;
const ringSessions = new Map<string, string>();
const attempts = new Map<string, { count: number; until: number }>();
const local = (req: express.Request) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
const addresses = Object.values(networkInterfaces()).flat().filter(i => i?.family === 'IPv4' && !i.internal).map(i => i!.address);
const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...addresses]);
app.disable('x-powered-by');
app.use((req, res, next) => {
  const segments = decodeURIComponent(req.path).split(/[\\/]/);
  if (segments.some(segment => ['.doorrelay', '.git', 'artifacts', '.env'].includes(segment) || segment.startsWith('.env.'))) return res.status(404).end();
  const hostname = (req.headers.host || '').replace(/:\d+$/, '');
  if (!allowedHosts.has(hostname)) return res.status(403).json({ error: 'Unrecognized host.' });
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return res.status(403).json({ error: 'Cross-origin requests are blocked.' });
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '650kb', verify: (req, _res, bytes) => { (req as express.Request & { rawBody: Buffer }).rawBody = bytes; } }));
app.use(express.text({ type: 'application/sdp', limit: '100kb' }));
app.post('/api/bootstrap', (req, res) => {
  if (!local(req)) return res.status(403).json({ error: 'Open the dashboard on the laptop. Phones use the speaker page.' });
  res.cookie('doorrelay_admin', adminSession, { httpOnly: true, sameSite: 'strict', path: '/' }); res.json({ ok: true });
});
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const cookie = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith('doorrelay_admin='))?.slice(16) || '';
  if (!local(req) || !equal(cookie, adminSession)) return res.status(401).json({ error: 'Dashboard access is limited to this laptop.' });
  next();
}
function requireSpeaker(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!speaker || !equal(token, speaker.token)) return res.status(401).json({ error: 'Pair this speaker again.' }); next();
}
function expireQueued() { for (const command of guard.state.commands) if (command.status === 'pending') command.status = 'expired'; }
const ready = () => !!speaker && speaker.ready && Date.now() - speaker.seen < 7000;
const save = (res: express.Response) => { persist(); res.json({ ok: true }); };
function image(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length > 280_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)) throw new Error('Invalid preview image.'); return value;
}
const sources = new Set(['synthetic', 'upload', 'ring']);
app.get('/api/state', requireAdmin, (_req, res) => {
  guard.tick(); const now = Date.now();
  res.json({ ...guard.state, speaker: { connected: !!speaker && now - speaker.seen < 7000, ready: ready(), lastSeen: speaker?.seen ?? null }, ring: { configured: !!ringToken }, observationOnline: !!guard.state.observation && now - guard.state.observation.at < 2500, now });
});
app.post('/api/arm', requireAdmin, (req, res) => {
  if (!sources.has(req.body.source)) throw new Error('Choose a valid video source.');
  guard.arm(req.body.source as SourceKind, image(req.body.image), String(req.body.name || 'Front door parcel').slice(0, 80)); save(res);
});
app.post('/api/disarm', requireAdmin, (_req, res) => { guard.disarm(); save(res); });
app.post('/api/stop-observing', requireAdmin, (_req, res) => { guard.stopObserving(); save(res); });
app.post('/api/observe', requireAdmin, (req, res) => {
  if (!['present', 'moved', 'uncertain'].includes(req.body.kind) || !sources.has(req.body.source) || !Number.isFinite(req.body.score) || req.body.score < 0 || req.body.score > 1) throw new Error('Invalid observation.');
  const count = guard.state.timeline.length;
  guard.observe({ kind: req.body.kind as ObservationKind, score: req.body.score, source: req.body.source, session: String(req.body.session), image: image(req.body.image) }, ready());
  if (count !== guard.state.timeline.length) persist(); res.json({ ok: true });
});
app.post('/api/pickup', requireAdmin, (_req, res) => { guard.pickup(); save(res); });
app.post('/api/collect', requireAdmin, (_req, res) => { guard.collect(); save(res); });
app.post('/api/claim', requireAdmin, (req, res) => { guard.state.parcel.claimedBy = String(req.body.name || 'Resident').slice(0, 50); guard.log('Collection claimed', `${guard.state.parcel.claimedBy} plans to bring the parcel inside.`); save(res); });
app.post('/api/resolve', requireAdmin, (req, res) => {
  if (!['authorized', 'dismissed'].includes(req.body.status)) throw new Error('Invalid resolution.');
  guard.resolve(req.body.status); if (req.body.status === 'authorized') { guard.state.parcel.status = 'collected'; guard.state.pickupUntil = 0; }
  guard.log('Review resolved', req.body.status === 'authorized' ? 'Resident confirmed an authorized collection.' : 'Marked as a false alarm. Re-enroll the parcel to resume.', 'good'); save(res);
});
app.post('/api/settings', requireAdmin, (req, res) => {
  if (typeof req.body.autoWarn !== 'boolean') throw new Error('Invalid policy.');
  guard.state.autoWarn = req.body.autoWarn; guard.log('Warning policy updated', req.body.autoWarn ? 'One fixed warning may play after sustained unverified movement.' : 'Warnings require a resident action.'); save(res);
});
app.post('/api/warn', requireAdmin, (_req, res) => { if (!ready()) throw new Error('Pair a speaker and enable audio first.'); guard.warn(); save(res); });
app.post('/api/pairing', requireAdmin, (_req, res) => {
  pairing = { code: String(randomInt(100000, 1000000)), expiresAt: Date.now() + 300_000 };
  const origins = host === '0.0.0.0' ? addresses.map(ip => `http://${ip}:${port}`) : [];
  res.json({ ...pairing, urls: origins.map(o => `${o}/speaker`), localUrl: `http://localhost:${port}/speaker` });
});
app.post('/api/speaker/pair', (req, res) => {
  const key = req.socket.remoteAddress || '', now = Date.now(); let record = attempts.get(key);
  if (!record || record.until < now) { record = { count: 0, until: now + 60_000 }; attempts.set(key, record); }
  if (++record.count > 6) return res.status(429).json({ error: 'Too many attempts. Wait one minute.' });
  if (!pairing || pairing.expiresAt < now || !equal(String(req.body.code || ''), pairing.code)) return res.status(403).json({ error: 'This pairing code is incorrect or expired.' });
  expireQueued();
  speaker = { token: randomBytes(32).toString('hex'), ready: false, seen: now }; pairing = null;
  guard.log('Speaker paired', 'Enable audio on the paired device to make it ready.'); persist(); res.json({ token: speaker.token });
});
app.post('/api/speaker/heartbeat', requireSpeaker, (req, res) => {
  if (speaker!.ready && req.body.ready !== true) expireQueued();
  speaker!.seen = Date.now(); speaker!.ready = req.body.ready === true; guard.tick();
  const commands = ready() ? guard.state.commands.filter(c => c.status === 'pending' && c.expiresAt > Date.now()) : [];
  res.json({ commands, commandStates: guard.state.commands.map(c => ({ id: c.id, status: c.status })), now: Date.now() });
});
app.post('/api/speaker/ack', requireSpeaker, (req, res) => {
  if (!['started', 'completed', 'failed'].includes(req.body.status)) throw new Error('Invalid playback status.');
  const id = String(req.body.id);
  guard.acknowledge(id, req.body.status, String(req.body.error || '').slice(0, 160)); persist();
  res.json({ ok: true, status: guard.state.commands.find(c => c.id === id)?.status ?? 'unknown' });
});
app.post('/api/speaker/revoke', requireAdmin, (_req, res) => { speaker = null; pairing = null; expireQueued(); guard.log('Speaker disconnected', 'Pair again to enable warning playback.'); save(res); });
app.post('/api/speaker/unpair', requireSpeaker, (_req, res) => { speaker = null; expireQueued(); guard.log('Speaker unpaired', 'This browser has revoked its speaker connection.'); save(res); });
app.get('/api/export', requireAdmin, (_req, res) => {
  guard.tick();
  res.setHeader('Content-Disposition', 'attachment; filename="doorrelay-incident-report.json"');
  res.json({ application: 'DoorRelay Guard', version: '0.2.0', exportedAt: new Date().toISOString(), ...guard.state });
});
app.post('/api/clear-evidence', requireAdmin, (_req, res) => {
  for (const incident of guard.state.incidents) { delete incident.before; delete incident.after; }
  delete guard.state.parcel.reference;
  guard.log('Evidence images cleared', 'Enrollment and incident previews were removed from the local store.'); save(res);
});
// All Ring API traffic is server-to-server. Token never returns to the client.
async function ring(path: string, init: RequestInit = {}) {
  if (!ringToken) throw new Error('Add a Ring Playground token in Connections.');
  const response = await fetch(`https://api.amazonvision.com${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${ringToken}`, ...init.headers } });
  if (!response.ok) throw new Error(`Ring returned ${response.status}. Check token, device access, and Playground session.`);
  return response;
}
app.post('/api/ring/token', requireAdmin, (req, res) => { const token = String(req.body.token || '').trim(); if (token.length < 10 || token.length > 8000 || /\s/.test(token)) throw new Error('Enter a valid access token.'); ringToken = token; res.json({ ok: true }); });
app.get('/api/ring/devices', requireAdmin, async (_req, res) => { res.json(await (await ring('/v1/devices?include=status,capabilities')).json()); });
app.post('/api/ring/stream/:device', requireAdmin, async (req, res) => {
  if (typeof req.body !== 'string') throw new Error('An SDP offer is required.');
  const path = `/v1/devices/${encodeURIComponent(String(req.params.device))}/media/streaming/whep/sessions`;
  const response = await ring(path, { method: 'POST', body: req.body, headers: { 'Content-Type': 'application/sdp' } });
  const location = response.headers.get('location'); const session = randomBytes(16).toString('hex');
  if (location) { const url = new URL(location, 'https://api.amazonvision.com'); if (url.origin === 'https://api.amazonvision.com' && url.pathname.startsWith(path + '/')) ringSessions.set(session, url.pathname + url.search); }
  res.json({ sdp: await response.text(), session });
});
app.delete('/api/ring/stream/:session', requireAdmin, async (req, res) => {
  const id = String(req.params.session), path = ringSessions.get(id);
  if (path) { await ring(path, { method: 'DELETE' }); ringSessions.delete(id); } res.json({ ok: true });
});
app.post('/api/ring/webhook', (req, res) => {
  const secret = process.env.RING_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'Webhook configuration is not enabled.' });
  const signature = String(req.headers['x-signature'] || '');
  const expected = createHmac('sha256', secret).update((req as express.Request & { rawBody: Buffer }).rawBody).digest('hex');
  if (!equal(signature, expected)) return res.status(401).json({ error: 'Invalid signature.' });
  // This first slice acknowledges genuine triggers, but does not claim an unattended media worker.
  res.status(200).json({ received: true, processing: 'not-enabled-in-local-prototype' });
});
if (process.argv.includes('--production')) {
  if (!existsSync(resolve('dist/index.html'))) throw new Error('Run npm run build first.');
  const publicRoot = resolve('dist');
  app.use(express.static(publicRoot));
  app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: publicRoot }));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ server: { middlewareMode: true, ws: { server }, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.doorrelay/**', '**/artifacts/**'] }, watch: { ignored: ['**/.doorrelay/**', '**/artifacts/**'] } }, appType: 'spa' }); app.use(vite.middlewares);
}
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(400).json({ error: error.message || 'Request failed.' }); });
setInterval(() => { guard.tick(); persist(); }, 10_000).unref();
server.listen(port, host, () => console.log(`DoorRelay Guard: http://localhost:${(server.address() as { port: number }).port} (${host === '0.0.0.0' ? 'phone pairing available on local network' : 'laptop only'})`));
