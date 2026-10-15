import { useEffect, useRef, useState } from 'react';
import type { Box, Snapshot } from '../shared/types';

export interface RecordingView {
  media: HTMLCanvasElement | HTMLVideoElement | null;
  source: string;
  status: string;
  reason: string;
  box: Box;
  snapshot: Snapshot | null;
}

/** A local, silent export of the displayed source and the live application state. */
export function ReviewRecorder({ read }: { read: () => RecordingView }) {
  const readRef = useRef(read); readRef.current = read;
  const stopRef = useRef<(() => void) | null>(null);
  const urlRef = useRef('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  useEffect(() => () => { stopRef.current?.(); URL.revokeObjectURL(urlRef.current); }, []);

  function begin() {
    setError('');
    if (typeof MediaRecorder === 'undefined') { setError('Recording is unavailable in this browser. Try desktop Chrome.'); return; }
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext('2d')!;
      const started = Date.now();
      const text = (value: string, x: number, y: number, size = 18, color = '#183b31', width = 310) => {
        ctx.font = `${size >= 24 ? '600' : '400'} ${size}px sans-serif`; ctx.fillStyle = color;
        const words = value.split(' '); let line = ''; let row = y;
        for (const word of words) {
          if (ctx.measureText(line + word).width > width && line) { ctx.fillText(line, x, row); row += size * 1.35; line = ''; }
          line += word + ' ';
        }
        ctx.fillText(line, x, row);
      };
      const draw = () => {
        const view = readRef.current(); const s = view.snapshot;
        const elapsed = Math.floor((Date.now() - started) / 1000); setSeconds(elapsed);
        ctx.fillStyle = '#f4f6ef'; ctx.fillRect(0, 0, 1280, 720);
        text('DoorRelay Guard', 30, 43, 28, '#183b31', 600);
        text('LOCAL REVIEW RECORDING · SILENT', 850, 40, 16, '#627469', 410);
        text(view.source, 30, 78, 17, '#627469', 900);
        ctx.fillStyle = '#152c25'; ctx.fillRect(30, 100, 900, 506);
        const media = view.media;
        const valid = media && (!(media instanceof HTMLVideoElement) || (media.readyState >= 2 && media.videoWidth > 32 && !media.ended));
        if (valid) {
          ctx.drawImage(media, 30, 100, 900, 506);
          if (s?.parcel.session) {
            ctx.strokeStyle = s.parcel.status === 'review' ? '#e89a51' : '#d6e7a8'; ctx.lineWidth = 3;
            ctx.strokeRect(30 + view.box.x * 900, 100 + view.box.y * 506, view.box.w * 900, view.box.h * 506);
          }
        } else text('Video unavailable / session ended', 70, 330, 26, '#ffffff', 800);
        text(view.status, 960, 132, 27);
        text(view.reason, 960, 225, 17);
        text(`Speaker: ${s?.speaker.ready ? 'ready' : 'off'}`, 960, 340, 18);
        const command = s?.commands.find(c => c.createdAt >= started);
        text(`This recording's warning: ${command?.status || 'none'}`, 960, 382, 18);
        text(`Pickup: ${s?.parcel.status === 'pickup' ? 'authorized' : s?.parcel.status === 'collected' ? 'confirmed collected' : 'not authorized'}`, 960, 460, 18);
        const entry = s?.timeline.find(e => e.at >= started);
        if (entry) text(entry.title, 960, 535, 20);
        text(`Elapsed ${elapsed}s · ${new Date().toLocaleTimeString()}`, 30, 645, 18, '#627469', 900);
        const credit = view.source.startsWith('Ring') ? 'Ring Playground clip: frollard · CC BY 4.0 · youtube.com/watch?v=TfTFu8lGrwk · resized' : 'Local source export. Generated scenes are labeled above. No microphone or speaker audio is recorded.';
        text(credit, 30, 684, 15, '#627469', 1210);
      };
      draw(); stream = canvas.captureStream(12);
      const mimeType = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
      if (!mimeType) throw new Error('No supported recording format. Try desktop Chrome.');
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); stopRef.current = null; setRecording(false);
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(new Blob(chunks, { type: mimeType })); setUrl(urlRef.current);
        setName(`doorrelay-review-${new Date(started).toISOString().replace(/[:.]/g, '-')}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`);
      };
      recorder.onerror = () => { setError('The browser could not finish this recording.'); stopRef.current?.(); };
      stopRef.current = () => { if (recorder.state !== 'inactive') recorder.stop(); };
      recorder.start(1000); setRecording(true); setSeconds(0);
      timer = setInterval(() => { draw(); if (Date.now() - started >= 60000 || document.hidden) stopRef.current?.(); }, 1000 / 12);
    } catch (e) { clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); setRecording(false); setError((e as Error).message); }
  }
  return <section className="review-recorder"><div><strong>Save a review clip</strong><p className="microcopy">Up to 60 seconds of this view and live status. Silent, saved locally; keep this page visible.</p></div><div className="button-row"><button className="secondary small" onClick={() => recording ? stopRef.current?.() : begin()}>{recording ? `Stop recording · ${seconds}s` : 'Record review clip'}</button>{url && <a className="text-button" href={url} download={name}>Download review clip</a>}</div>{error && <p role="alert">{error}</p>}</section>;
}
