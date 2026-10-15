import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { fixture, referenceBox as box } from '../tests/fixtures';
await mkdir('public/samples', { recursive: true });
const processVideo = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', '240x135', '-framerate', '12', '-i', '-', '-vf', 'scale=960:540:flags=neighbor', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', 'public/samples/generated-parcel-test.mp4'], { windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'] });
for (let frame = 0; frame < 420; frame++) {
  const seconds = frame / 12;
  const objects = seconds >= 24 && seconds < 29 ? [] : [{ box: seconds >= 8 && seconds < 16 ? { ...box, x: .61, y: .21 } : box }];
  const pixels = fixture(objects);
  if (!processVideo.stdin.write(Buffer.from(pixels.data as Uint8ClampedArray))) await once(processVideo.stdin, 'drain');
}
processVideo.stdin.end();
const [code] = await once(processVideo, 'exit'); if (code !== 0) throw new Error(`FFmpeg failed: ${code}`);
console.log('Created original generated test video: 0–8s present, 8–16s moved, 16–24s returned, 24–29s absent, 29–35s present.');
