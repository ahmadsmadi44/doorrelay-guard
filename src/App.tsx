import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowSquareOut, Bell, Camera, Check, CheckCircle, Clock, GearSix, House, Info, Link, Package, Play, Plus, ShieldCheck, SpeakerHigh, SquaresFour, VideoCamera, Warning, X } from '@phosphor-icons/react';
import QRCode from 'qrcode';
import { api } from './api';
import { ReviewRecorder } from './ReviewRecorder';
import { analyze, enroll, type Reference } from '../shared/vision';
import type { Box, Snapshot, SourceKind } from '../shared/types';
import { drawScene, HOME_BOX, type SceneMode } from './scene';

type Device = { id: string; attributes?: { name?: string; [key: string]: unknown } };
const sourceNames: Record<SourceKind, string> = { synthetic: 'Synthetic test scene', upload: 'Local video', ring: 'Ring Playground' };
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<'overview' | 'activity'>('overview');
  const [modal, setModal] = useState<'connections' | 'speaker' | null>(null);
  const [source, setSource] = useState<SourceKind>('synthetic'); const [mode, setMode] = useState<SceneMode>('rest');
  const [box, setBox] = useState<Box>(HOME_BOX); const [selecting, setSelecting] = useState(false);
  const [vision, setVision] = useState({ kind: 'uncertain', score: 0, reason: 'Enroll a parcel to start observing.' });
  const [filename, setFilename] = useState(''); const [videoReady, setVideoReady] = useState(false);
  const [token, setToken] = useState(''); const [devices, setDevices] = useState<Device[]>([]); const [device, setDevice] = useState('');
  const [streamStatus, setStreamStatus] = useState('Not connected');
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number; urls: string[]; localUrl: string } | null>(null);
  const [qr, setQr] = useState('');
  const scene = useRef<HTMLCanvasElement>(null), video = useRef<HTMLVideoElement>(null), surface = useRef<HTMLDivElement>(null);
  const frame = useRef(document.createElement('canvas')), reference = useRef<Reference | null>(null);
  const stateRef = useRef(snapshot), sourceRef = useRef(source), start = useRef<{ x: number; y: number } | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null), ringSession = useRef(''), fileUrl = useRef('');
  const inFlight = useRef(false);
  const lastVideoTime = useRef(-1);
  const dialog = useRef<HTMLElement>(null);
  stateRef.current = snapshot; sourceRef.current = source;
  async function refresh() { const s = await api<Snapshot>('/state'); setSnapshot(s); return s; }
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  useEffect(() => {
    let live = true;
    void api('/bootstrap', {}).then(async () => { if (live) await refresh(); }).catch(e => setError(e.message));
    const timer = setInterval(() => { if (live) void refresh().catch(e => setError(e.message)); }, 1000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  useEffect(() => { if (scene.current) drawScene(scene.current.getContext('2d')!, mode); }, [mode, source]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, a[href]') || []);
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null);
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [modal]);
  useEffect(() => {
    const url = pairing?.urls[0] || pairing?.localUrl;
    if (url) void QRCode.toDataURL(url, { width: 180, margin: 1, color: { dark: '#182d28', light: '#ffffff' } }).then(setQr);
  }, [pairing]);
  function capture(): ImageData | null {
    const canvas = frame.current; canvas.width = 240; canvas.height = 135;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    if (sourceRef.current === 'synthetic' && scene.current) ctx.drawImage(scene.current, 0, 0, 240, 135);
    else if (video.current && video.current.readyState >= 2 && video.current.videoWidth > 32 && video.current.videoHeight > 32 && !video.current.paused && !video.current.ended) ctx.drawImage(video.current, 0, 0, 240, 135);
    else return null;
    return ctx.getImageData(0, 0, 240, 135);
  }
  useEffect(() => {
    const timer = setInterval(async () => {
      const s = stateRef.current;
      if (!reference.current || !s?.parcel.session || ['unarmed', 'collected'].includes(s.parcel.status) || inFlight.current || document.hidden) return;
      if (sourceRef.current !== 'synthetic') {
        const currentTime = video.current?.currentTime;
        if (currentTime === undefined || currentTime === lastVideoTime.current) return;
        lastVideoTime.current = currentTime;
      }
      const captured = capture(); if (!captured) return;
      inFlight.current = true;
      try {
        const result = analyze(captured, reference.current); setVision(result);
        await api('/observe', { kind: result.kind, score: result.score, source: sourceRef.current, session: s.parcel.session, image: result.kind === 'moved' ? frame.current.toDataURL('image/jpeg', .75) : undefined });
      } catch (e) { setError((e as Error).message); } finally { inFlight.current = false; }
    }, 400);
    return () => clearInterval(timer);
  }, []);
  async function arm() {
    const captured = capture(); if (!captured) throw new Error('Start a video or test scene before enrolling.');
    const nextReference = enroll(captured, box);
    await api('/arm', { source, image: frame.current.toDataURL('image/jpeg', .85) }); reference.current = nextReference;
    setSelecting(false); setNotice('Parcel enrolled. Keep this dashboard open for observation.');
  }
  async function disconnectStream() {
    const old = peer.current; peer.current = null; old?.close();
    if (old && video.current) { video.current.pause(); video.current.srcObject = null; }
    if (old) setVideoReady(false);
    if (ringSession.current) { const id = ringSession.current; ringSession.current = ''; await api(`/ring/stream/${id}`, undefined, 'DELETE').catch(() => {}); }
  }
  async function changeSource(next: SourceKind) {
    await api('/disarm', {}); reference.current = null; setVision({ kind: 'uncertain', score: 0, reason: 'Enroll a parcel to start observing.' });
    await disconnectStream(); if (video.current) { video.current.pause(); video.current.srcObject = null; video.current.removeAttribute('src'); }
    if (fileUrl.current) { URL.revokeObjectURL(fileUrl.current); fileUrl.current = ''; }
    setVideoReady(false); lastVideoTime.current = -1; setSource(next); sourceRef.current = next; setMode('rest'); setBox(HOME_BOX);
  }
  async function connectRing() {
    if (!device) throw new Error('Discover and choose a Ring device first.');
    const previousBox = box; await changeSource('ring'); setBox(previousBox); setStreamStatus('Opening Ring session…');
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }); peer.current = pc;
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.ontrack = event => { if (video.current) { video.current.srcObject = event.streams[0] || new MediaStream([event.track]); void video.current.play().catch(e => setError(e.message)); setStreamStatus('Track negotiated · waiting for video frames'); } };
    pc.onconnectionstatechange = () => {
      if (peer.current !== pc) return;
      setStreamStatus(`Ring connection: ${pc.connectionState}`);
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) { setStreamStatus('Session ended · reconnect to continue'); setVideoReady(false); reference.current = null; void api('/stop-observing', {}).catch(() => {}); void disconnectStream(); }
    };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>((resolve, reject) => {
        if (pc.iceGatheringState === 'complete') return resolve();
        const timer = setTimeout(() => reject(new Error('ICE gathering timed out.')), 12000);
        pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(timer); resolve(); } });
      });
      const res = await fetch(`/api/ring/stream/${encodeURIComponent(device)}`, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: pc.localDescription!.sdp });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      ringSession.current = data.session; await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }); setModal(null);
      await new Promise<void>((resolve, reject) => {
        const started = Date.now();
        const timer = setInterval(() => {
          if (peer.current === pc && video.current && video.current.readyState >= 2 && video.current.videoWidth > 32 && video.current.videoHeight > 32) { clearInterval(timer); resolve(); }
          else if (peer.current !== pc || Date.now() - started > 15000) { clearInterval(timer); reject(new Error('Ring accepted the session, but no video frames arrived. Reconnect the Playground scenario and try again; this network or browser may block WebRTC.')); }
        }, 200);
      });
      setVideoReady(true); setStreamStatus('Receiving Ring video');
    } catch (e) { await disconnectStream(); setStreamStatus('No video received · reconnect to try again'); throw e; }
  }
  async function upload(file?: File) {
    if (!file) return; if (!file.type.startsWith('video/')) throw new Error('Choose a video file.');
    await changeSource('upload'); fileUrl.current = URL.createObjectURL(file); setFilename(file.name);
    // The element always exists, even while the synthetic scene is displayed.
    video.current!.src = fileUrl.current; video.current!.loop = false;
    await video.current!.play(); setVideoReady(true);
  }
  function point(e: React.PointerEvent) { const r = surface.current!.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; }
  function selectMove(e: React.PointerEvent) { if (!start.current) return; const p = point(e); setBox({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(start.current.x - p.x), h: Math.abs(start.current.y - p.y) }); }
  const active = snapshot && !['unarmed', 'collected'].includes(snapshot.parcel.status);
  const observing = active && snapshot.observationOnline;
  const incident = snapshot?.incidents.find(i => i.status === 'open');
  const statusText = snapshot?.parcel.status === 'review' ? 'Movement needs review' : snapshot?.parcel.status === 'pickup' ? 'Pickup window open' : snapshot?.parcel.status === 'collected' ? 'Safely collected' : observing && snapshot?.observation?.kind === 'uncertain' ? 'Parcel view is unclear' : observing ? 'Watching your parcel' : active ? 'Waiting for video' : 'Ready when you are';
  const statusTone = snapshot?.parcel.status === 'review' ? 'alert' : observing || snapshot?.parcel.status === 'collected' ? 'good' : '';
  const pickupSeconds = Math.max(0, Math.ceil(((snapshot?.pickupUntil || 0) - (snapshot?.now || Date.now())) / 1000));
  const latest = snapshot?.commands[0];
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="/"><span className="brand-mark"><ShieldCheck size={25} weight="fill"/></span><span>DoorRelay<small>GUARD</small></span></a><div className="home-switch"><House size={19}/><div>My household<small>Local prototype</small></div><span className="home-initial">A</span></div><p className="nav-label">WORKSPACE</p><nav><button className={page === 'overview' ? 'nav-active' : ''} onClick={() => setPage('overview')}><SquaresFour size={20}/> Overview</button><button className={page === 'activity' ? 'nav-active' : ''} onClick={() => setPage('activity')}><Clock size={20}/> Activity <span className="nav-count">{snapshot?.incidents.length || 0}</span></button><button onClick={() => setModal('connections')}><Link size={20}/> Connections</button><button onClick={() => setModal('speaker')}><SpeakerHigh size={20}/> Speaker</button></nav><div className="sidebar-bottom"><span className="dot"/> Runs on your laptop<p>Video stays local unless you connect a Ring source.</p><div className="sidebar-version">LOCAL MVP <span>0.2</span></div></div></aside>
    <div className="workspace"><header className="topbar"><span>My household <span className="slash">/</span> {page === 'overview' ? 'Overview' : 'Activity'}</span><div className="top-actions"><span className="prototype-label">Prototype</span><button className="icon-button" aria-label="Open connections" onClick={() => setModal('connections')}><GearSix size={20}/></button><span className="avatar">A</span></div></header>
    <main className="main-content"><div className="page-heading"><div><p className="eyebrow">A LITTLE PEACE OF MIND</p><h1>{page === 'overview' ? 'Your doorstep, looked after.' : 'Every handoff has a story.'}</h1><p className="subtitle">From delivery to collection. Know what happened in between.</p></div><button className="secondary" onClick={() => setModal('speaker')}><SpeakerHigh size={17}/> {snapshot?.speaker.ready ? 'Speaker ready' : 'Pair a speaker'}<ArrowRight size={16}/></button></div>
    {error && <div className="banner error-banner" role="alert"><Warning size={20}/><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={17}/></button></div>}
    {notice && <div className="banner notice-banner" role="status"><CheckCircle size={19}/><span>{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={17}/></button></div>}
    <div hidden={page !== 'overview'}>
    <section className="status-strip"><div><span className={'status-orb ' + statusTone}><ShieldCheck size={24}/></span><div><strong>{statusText}</strong><small>{snapshot?.parcel.status === 'collected' ? 'Collection confirmed. Enroll another parcel when it arrives.' : observing ? 'This page is observing the selected parcel.' : 'Enroll a parcel in the camera view to begin.'}</small></div></div><div className="status-details"><span><i className={'dot ' + (observing ? 'green' : '')}/>{observing ? 'Observing' : 'Not observing'}</span><span><i className={'dot ' + (snapshot?.speaker.ready ? 'green' : '')}/>{snapshot?.speaker.ready ? 'Speaker ready' : 'Speaker off'}</span></div></section>
    <div className="monitor-grid"><section className="camera-card"><div className="card-heading"><div><Camera size={19}/><h2>Front door</h2></div><span className="source-badge">{sourceNames[source]}</span></div>
    <div className={'camera-surface ' + (selecting ? 'selecting' : '')} ref={surface} onPointerDown={e => { if (!selecting) return; start.current = point(e); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerCancel={() => { start.current = null; }} onPointerMove={selectMove} onPointerUp={e => { selectMove(e); start.current = null; }}>
      <canvas ref={scene} width={960} height={540} style={{ display: source === 'synthetic' ? 'block' : 'none' }}/>
      <video ref={video} muted playsInline onResize={() => { if (sourceRef.current === 'ring' && video.current && video.current.videoWidth <= 32) { setVideoReady(false); reference.current = null; setStreamStatus('Session ended · reconnect to continue'); void api('/stop-observing', {}).catch(() => {}); } }} onLoadedData={() => { if (video.current && video.current.videoWidth > 32 && video.current.videoHeight > 32 && (sourceRef.current !== 'ring' || peer.current)) setVideoReady(true); }} onEnded={() => { setVideoReady(false); reference.current = null; void api('/stop-observing', {}).catch(() => {}); }} style={{ display: source !== 'synthetic' ? 'block' : 'none' }}/>
      {source !== 'synthetic' && !videoReady && <div className="video-empty"><VideoCamera size={40}/><strong>{source === 'ring' ? streamStatus : 'Choose a local video'}</strong><span>Your video appears here once connected.</span></div>}
      <div className="camera-top"><span><i className="dot green"/>{source === 'synthetic' ? 'TEST SCENE' : source === 'ring' ? 'RING SOURCE' : 'LOCAL FOOTAGE'}</span><span>FRONT DOOR / 01</span></div>
      {(source === 'synthetic' || videoReady) && <div className={'parcel-box ' + (snapshot?.parcel.status === 'review' ? 'parcel-alert' : '')} style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}><span>{selecting ? 'Draw around parcel' : active ? 'Enrolled parcel' : 'Select your parcel'}</span><i/><i/><i/><i/></div>}
      <div className="camera-caption">{source === 'synthetic' ? 'Synthetic pixels for testing · not a Ring camera feed' : source === 'upload' ? filename : 'Ring Playground video · limited session'}</div>
    </div>{selecting && <fieldset className="box-fields"><legend>Parcel area · percent of frame</legend>{(['x', 'y', 'w', 'h'] as const).map(key => <label key={key}>{({x:'Left', y:'Top', w:'Width', h:'Height'})[key]}<input aria-label={`Parcel ${key}`} type="number" min="0" max="100" step="1" value={Math.round(box[key] * 100)} onChange={e => setBox(old => ({...old, [key]: Math.min(1, Math.max(0, Number(e.target.value) / 100))}))}/></label>)}</fieldset>}{source === 'upload' && <div className="local-playback"><button className="secondary small" onClick={() => void run(async () => { reference.current = null; await api('/disarm', {}); video.current!.currentTime = 0; await video.current!.play(); setVideoReady(true); })}>Replay video</button><span>Replay, select the parcel, then enroll while it is visible.</span></div>}{source === 'ring' && <div className="local-playback"><button className="secondary small" disabled={busy || !device} onClick={() => void run(connectRing)}>Reconnect Ring video</button><span>{streamStatus}</span></div>}{source === 'ring' && <p className="media-credit">Playground package clip: <a href="https://www.youtube.com/watch?v=TfTFu8lGrwk" target="_blank" rel="noreferrer">frollard</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Previews resized.</p>}<div className="camera-toolbar"><button className="secondary small" disabled={busy} onClick={() => { reference.current = null; void run(async () => { await api('/disarm', {}); if (source === 'upload' && video.current) { if (!selecting) video.current.pause(); else await video.current.play(); } setSelecting(!selecting); }); }}>{selecting ? 'Finish selection' : 'Select parcel'}</button><button className="primary small" disabled={busy || selecting || (source !== 'synthetic' && !videoReady)} onClick={() => void run(arm)}><ShieldCheck size={16}/>{active ? 'Re-enroll parcel' : 'Enroll & observe'}</button><button className="text-button toolbar-source" onClick={() => setModal('connections')}>Change source <ArrowRight size={15}/></button></div>
    </section><section className="parcel-card"><div className="card-heading"><div><Package size={19}/><h2>Your parcel</h2></div><span className="mini-label">01</span></div><div className="parcel-body"><div className="package-symbol"><Package size={51} weight="duotone"/></div><h3>Front door parcel</h3><p className="muted">{snapshot?.parcel.status === 'collected' ? 'Collection confirmed by a resident.' : 'Waiting for someone to bring it inside.'}</p><div className={'parcel-state ' + statusTone}><span className="dot"/>{snapshot?.parcel.status === 'pickup' ? `Pickup authorized · ${pickupSeconds}s` : snapshot?.parcel.status === 'review' ? 'Unverified movement' : snapshot?.parcel.status === 'collected' ? 'Collected' : active ? 'Enrolled' : 'Not enrolled'}</div><dl><div><dt>Location</dt><dd>Front door</dd></div><div><dt>Collection</dt><dd>{snapshot?.parcel.claimedBy || 'Unclaimed'}</dd></div><div><dt>Warnings</dt><dd>{snapshot?.autoWarn ? 'Automatic' : 'Review first'}</dd></div></dl><button className="secondary full" disabled={!active || busy} onClick={() => void run(() => api('/claim', { name: 'You' }))}>I’ll bring it inside</button>{snapshot?.parcel.status === 'pickup' ? <button className="primary full" disabled={busy} onClick={() => void run(() => api('/collect', {}))}><Check size={17}/> Confirm collection</button> : <button className="primary full" disabled={!active || busy} onClick={() => void run(() => api('/pickup', {}))}>Start pickup <ArrowRight size={17}/></button>}<p className="microcopy">Start a two-minute window before you collect it.</p></div></section></div>
    <ReviewRecorder read={() => ({media: source === 'synthetic' ? scene.current : video.current, source: source === 'upload' ? filename : sourceNames[source], status: statusText, reason: vision.reason, box, snapshot})}/>
    {incident && <section className="incident-panel"><div className="incident-title"><Warning size={23}/><div><h2>A parcel moved. Take a look.</h2><p>{incident.reason}</p></div><span className="source-badge">{sourceNames[incident.source]}</span></div><div className="incident-content"><div className="evidence"><figure>{incident.before && <img src={incident.before} alt="Parcel at enrollment"/>}<figcaption>Before</figcaption></figure><figure>{incident.after && <img src={incident.after} alt="Parcel when movement was detected"/>}<figcaption>After</figcaption></figure></div><div className="incident-actions"><button className="primary" disabled={!snapshot?.speaker.ready || busy} onClick={() => void run(() => api('/warn', {}))}><SpeakerHigh size={18}/> Send a warning</button><button className="secondary" onClick={() => void run(() => api('/resolve', { status: 'authorized' }))}>That was an authorized pickup</button><button className="text-button" onClick={() => void run(() => api('/resolve', { status: 'dismissed' }))}>Mark as false alarm</button><p className="microcopy">{latest ? `Latest warning: ${latest.status}` : 'No warning sent.'}</p></div></div></section>}
    <div className="below-grid"><section className="activity-card"><div className="card-heading"><div><Clock size={19}/><h2>Recent activity</h2></div><button className="text-button" onClick={() => setPage('activity')}>View all <ArrowRight size={14}/></button></div><Timeline entries={snapshot?.timeline.slice(0, 4) || []}/></section><section className="policy-card"><div className="card-heading"><div><ShieldCheck size={19}/><h2>How Guard responds</h2></div></div><div className="policy-body"><div className="policy-toggle"><div><strong>Automatic warning</strong><p>One short message after sustained, unverified movement.</p></div><button role="switch" aria-checked={snapshot?.autoWarn || false} aria-label="Automatic warning" className={'switch ' + (snapshot?.autoWarn ? 'on' : '')} onClick={() => void run(() => api('/settings', { autoWarn: !snapshot?.autoWarn }))}><span/></button></div><div className="observation-note"><Info size={17}/><p>{active ? vision.reason : 'Select a parcel once. Guard compares its appearance across frames. Unclear views stay uncertain.'}</p></div><div className="policy-footer"><span>Speaker playback</span><strong>{latest?.status || 'No commands yet'}</strong></div></div></section></div>
    {source === 'synthetic' && <section className="test-controls"><div><span className="eyebrow">TEST THE FLOW</span><p>Move the drawn parcel. The detector reads the resulting pixels.</p></div><div>{([['rest', 'Parcel in place'], ['moved', 'Move parcel'], ['occluded', 'Block the view'], ['absent', 'Remove from view']] as [SceneMode, string][]).map(([value, label]) => <button key={value} className={'secondary small ' + (mode === value ? 'selected' : '')} onClick={() => setMode(value)}>{label}</button>)}</div></section>}
    </div>
    {page === 'activity' && <section className="activity-card full-activity"><div className="card-heading"><h2>Household timeline</h2><a className="text-button" href="/api/export" download>Export report</a><button className="text-button" onClick={() => void run(() => api('/clear-evidence', {}))}>Clear evidence images</button></div><Timeline entries={snapshot?.timeline || []}/></section>}
    <footer className="footer"><ShieldCheck size={15}/><span>A local prototype. Keep the dashboard open for observation.</span><span>DoorRelay Guard · 2026</span></footer>
    </main></div>
    {modal && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}><section ref={dialog} className="modal" role="dialog" aria-modal="true" aria-label={modal === 'speaker' ? 'Pair a speaker' : 'Connections'}><div className="modal-heading"><div><p className="eyebrow">{modal === 'speaker' ? 'GIVE GUARD A VOICE' : 'CHOOSE YOUR VIDEO'}</p><h2>{modal === 'speaker' ? 'Pair a speaker' : 'Connections'}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={() => setModal(null)}><X size={22}/></button></div>{modal === 'speaker' ? <><p className="muted">Open the companion page on your phone, enter the code, then enable audio. Keep both devices on the same trusted Wi-Fi.</p><div className="connection-status"><span className={'dot ' + (snapshot?.speaker.ready ? 'green' : '')}/>{snapshot?.speaker.ready ? 'Speaker connected and audio enabled' : snapshot?.speaker.connected ? 'Speaker connected · enable audio on the device' : 'No speaker connected'}</div><button className="primary full" onClick={() => void run(async () => setPairing(await api('/pairing', {})))}>Generate pairing code</button>{pairing && <div className="pairing-details">{qr && <img src={qr} alt="QR code for speaker page"/>}<div><span className="eyebrow">{pairing.expiresAt > (snapshot?.now || Date.now()) ? `EXPIRES IN ${Math.ceil((pairing.expiresAt - (snapshot?.now || Date.now())) / 1000)} SECONDS` : 'EXPIRED · GENERATE A NEW CODE'}</span><strong className="pairing-code">{pairing.code}</strong><a href={pairing.urls[0] || pairing.localUrl} target="_blank" rel="noreferrer">{pairing.urls[0] || pairing.localUrl} <ArrowSquareOut size={14}/></a>{!pairing.urls.length && <p className="microcopy">Laptop-only mode. Set HOST=0.0.0.0 when starting the server for phone access.</p>}</div></div>}<div className="button-row"><button className="secondary" disabled={!snapshot?.speaker.ready} onClick={() => void run(() => api('/warn', {}))}><SpeakerHigh size={18}/> Test warning</button><button className="text-button" onClick={() => void run(() => api('/speaker/revoke', {}))}>Disconnect speaker</button></div><p className="microcopy">Speech plays through the paired browser, not through Ring.</p></> : <><div className="connection-option"><div><SquaresFour size={23}/><div><strong>Synthetic test scene</strong><p>Exercise the policy using generated pixels.</p></div></div><button className="secondary small" onClick={() => void run(async () => { await changeSource('synthetic'); setModal(null); })}>Use scene</button></div><div className="connection-option"><div><VideoCamera size={23}/><div><strong>Your footage</strong><p>A staged video stays on this laptop.</p></div></div><label className="secondary small file-button">Choose video<input type="file" accept="video/*" aria-label="Choose local video" onChange={e => { const f = e.target.files?.[0]; void run(async () => { await upload(f); setModal(null); }); }}/></label></div><div className="connection-option"><div><VideoCamera size={23}/><div><strong>Generated test video</strong><p>A 35-second regression clip. Not camera footage.</p></div></div><button className="secondary small" disabled={busy} onClick={() => void run(async () => { const response = await fetch('/samples/generated-parcel-test.mp4'); if (!response.ok) throw new Error('Sample video is unavailable.'); const file = new File([await response.blob()], 'GENERATED TEST VIDEO · not camera footage.mp4', {type:'video/mp4'}); await upload(file); setBox({ x:.3, y:.52, w:.2, h:.24 }); setModal(null); })}>Play test video</button></div><div className="ring-connect"><div className="ring-label"><Camera size={24}/><div><strong>Ring Playground</strong><p>Connect a real sandbox API session.</p></div><span className={'source-badge ' + (snapshot?.ring.configured ? 'good' : '')}>{snapshot?.ring.configured ? 'Token loaded' : 'Setup needed'}</span></div><label htmlFor="ring-token">Temporary Playground token</label><input type="password" id="ring-token" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your sandbox access token"/><div className="button-row"><button className="secondary small" disabled={!token || busy} onClick={() => void run(async () => { await api('/ring/token', { token }); setToken(''); setNotice('Ring token loaded into server memory.'); })}>Save token</button><button className="secondary small" disabled={!snapshot?.ring.configured || busy} onClick={() => void run(async () => { const result = await api<{ data: Device[] }>('/ring/devices'); setDevices(result.data); setDevice(result.data[0]?.id || ''); })}>Discover devices</button></div>{devices.length > 0 && <><label htmlFor="ring-device">Device</label><select id="ring-device" value={device} onChange={e => setDevice(e.target.value)}>{devices.map(d => <option key={d.id} value={d.id}>{d.attributes?.name || d.id}</option>)}</select><button className="primary full" disabled={busy} onClick={() => void run(connectRing)}><Play size={17}/> Connect Ring video</button></>}<a className="external-link" href="https://developer.amazon.com/ring/console/playground" target="_blank" rel="noreferrer">Open Ring Playground <ArrowSquareOut size={14}/></a><p className="microcopy">Token stays in server memory. Start a Package scenario in Playground if the sandbox video needs activating.</p></div></>}{error && <p className="error" role="alert">{error}</p>}</section></div>}
  </div>;
}

function Timeline({ entries }: { entries: Snapshot['timeline'] }) {
  if (!entries.length) return <div className="empty-activity"><Clock size={27}/><strong>A fresh start.</strong><p>Enroll your first parcel to begin its story.</p></div>;
  return <ol className="timeline">{entries.map(entry => <li key={entry.id}><span className={'timeline-icon ' + entry.tone}>{entry.tone === 'alert' ? <Warning size={17}/> : entry.tone === 'good' ? <CheckCircle size={17}/> : <Clock size={17}/>}</span><div><strong>{entry.title}</strong><p>{entry.detail}</p></div><time>{time(entry.at)}</time></li>)}</ol>;
}
