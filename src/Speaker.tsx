import { useEffect, useRef, useState } from 'react';
import { SpeakerHigh, ShieldCheck, ArrowRight, LinkBreak } from '@phosphor-icons/react';
import type { OutputCommand } from '../shared/types';
export default function Speaker() {
  const [token, setToken] = useState(sessionStorage.getItem('doorrelay_speaker') || '');
  const [code, setCode] = useState(''); const [ready, setReady] = useState(false); const [status, setStatus] = useState('Audio is off');
  const [error, setError] = useState(''); const processed = useRef(new Set<string>());
  const readyRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeCommand = useRef('');
  const startTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function audio() { if (!audioRef.current) audioRef.current = new Audio(); return audioRef.current; }
  function stopAudio() { const a = audioRef.current; if (a) { a.pause(); a.onplaying = null; a.ontimeupdate = null; a.onended = null; a.onerror = null; } }
  async function request(path: string, body: unknown, auth = token) {
    const r = await fetch(`/api/speaker/${path}`, { method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body: JSON.stringify(body) });
    const data = await r.json(); if (!r.ok) throw new Error(data.error); return data;
  }
  async function pair(e: React.FormEvent) {
    e.preventDefault(); try { const data = await request('pair', { code }); sessionStorage.setItem('doorrelay_speaker', data.token); setToken(data.token); setError(''); } catch (e) { setError((e as Error).message); }
  }
  function enable() {
    stopAudio(); const player = audio(); player.src = '/audio/connected.mp3'; player.volume = 1;
    const failed = () => { readyRef.current = false; setReady(false); setError('Audio was blocked or could not load. Tap Enable audio again.'); };
    player.onended = () => { readyRef.current = true; setReady(true); setStatus('Ready for a warning'); setError(''); };
    player.onerror = failed;
    void player.play().catch(failed); setStatus('Testing audio…');
  }
  function mute() {
    readyRef.current = false; setReady(false); activeCommand.current = ''; clearTimeout(startTimer.current); stopAudio(); setStatus('Audio is off');
    void request('heartbeat', { ready: false }).catch(e => setError(e.message));
  }
  async function unpair() {
    readyRef.current = false; setReady(false);
    stopAudio();
    try { await request('unpair', {}); } catch { /* An expired/revoked token is already unpaired. */ }
    sessionStorage.removeItem('doorrelay_speaker'); setToken(''); setError('');
  }
  useEffect(() => {
    if (!token) return;
    let cancelled = false, busy = false;
    const beat = async () => {
      if (busy || cancelled) return; busy = true;
      try {
        const data = await request('heartbeat', { ready: readyRef.current && !document.hidden });
        if (cancelled) return;
        if (activeCommand.current && data.commandStates?.some((c: {id:string; status:string}) => c.id === activeCommand.current && ['expired', 'failed'].includes(c.status))) {
          activeCommand.current = ''; clearTimeout(startTimer.current); stopAudio(); setStatus('Warning canceled');
        }
        for (const command of data.commands as OutputCommand[]) {
          if (processed.current.has(command.id)) continue; processed.current.add(command.id);
          if (command.expiresAt <= data.now || !readyRef.current || document.hidden) continue;
          stopAudio(); const player = audio(); player.src = '/audio/warning.mp3';
          activeCommand.current = command.id;
          const deadline = Date.now() + command.expiresAt - data.now;
          const fail = (message: string) => {
            if (activeCommand.current !== command.id) return;
            activeCommand.current = ''; clearTimeout(startTimer.current); readyRef.current = false; setReady(false); setStatus('Playback failed'); setError(message);
            stopAudio(); void request('ack', { id: command.id, status: 'failed', error: message }).catch(e => setError(e.message));
          };
          let startAcknowledged: Promise<unknown> = Promise.reject(new Error('Playback did not start.'));
          let observedStart = false;
          void startAcknowledged.catch(() => {});
          const acknowledgeStart = () => {
            if (observedStart) return;
            observedStart = true;
            clearTimeout(startTimer.current);
            if (activeCommand.current !== command.id || Date.now() >= deadline) { stopAudio(); return; }
            setStatus('Playing warning');
            startAcknowledged = request('ack', { id: command.id, status: 'started' }).then(result => {
              if (result.status !== 'started') throw new Error('Warning canceled before playback was acknowledged.');
            });
            void startAcknowledged.catch(e => fail(e.message));
          };
          player.onplaying = acknowledgeStart;
          player.ontimeupdate = () => { if (player.currentTime > 0) acknowledgeStart(); };
          player.onended = () => {
            if (activeCommand.current !== command.id) return;
            if (!observedStart && player.currentTime > 0) acknowledgeStart();
            clearTimeout(startTimer.current);
            void startAcknowledged.then(() => request('ack', { id: command.id, status: 'completed' })).then(result => {
              if (result.status !== 'completed') throw new Error('Playback was not confirmed before the command expired.');
              activeCommand.current = ''; setStatus('Warning finished'); setError('');
            }).catch(e => fail(e.message));
          };
          player.onerror = () => fail('Warning audio could not load. Tap Enable audio to retry.');
          startTimer.current = setTimeout(() => fail('Audio did not start within five seconds. Tap Enable audio to retry.'), Math.min(5000, deadline - Date.now()));
          void player.play().catch(() => fail('Audio playback was blocked. Tap Enable audio to retry.'));
        }
      } catch (e) { setError((e as Error).message); } finally { busy = false; }
    };
    const visibility = () => { if (document.hidden) { activeCommand.current = ''; clearTimeout(startTimer.current); stopAudio(); setStatus('Audio paused while this page is hidden'); } void beat(); };
    document.addEventListener('visibilitychange', visibility);
    void beat(); const timer = setInterval(beat, 1000);
    return () => { cancelled = true; clearInterval(timer); clearTimeout(startTimer.current); activeCommand.current = ''; stopAudio(); document.removeEventListener('visibilitychange', visibility); };
  }, [token]);
  return <main className="speaker-page"><div className="speaker-brand"><ShieldCheck size={26} weight="fill"/> DoorRelay <span>GUARD</span></div><div className="speaker-orb"><SpeakerHigh size={54}/></div><p className="eyebrow">COMPANION SPEAKER</p><h1>A voice at<br/>the doorway.</h1><p className="muted">Pair this phone with your dashboard to play a short warning when it’s needed.</p>{!token ? <form onSubmit={pair}><label htmlFor="pair-code">Six-digit pairing code</label><input id="pair-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} placeholder="000000" required/><button className="primary" type="submit">Pair this phone <ArrowRight size={18}/></button></form> : <div className="speaker-controls"><div className={'speaker-status ' + (ready && !error ? 'good' : '')}><span className="dot"/>{error ? 'Connection needs attention' : status}</div><button className="primary" onClick={ready ? mute : enable}>{ready ? 'Mute speaker' : 'Enable audio'}</button><button className="text-button" onClick={() => void unpair()}><LinkBreak size={16}/> Unpair this browser</button></div>}{error && <p className="error" role="alert">{error}</p>}<p className="speaker-note">Keep this page open and your phone unlocked.<br/>This is the companion speaker, not the Ring doorbell.</p></main>;
}
