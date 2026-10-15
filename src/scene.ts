export const HOME_BOX = { x: .44, y: .62, w: .16, h: .18 };
export type SceneMode = 'rest' | 'moved' | 'occluded' | 'absent';
export function drawScene(ctx: CanvasRenderingContext2D, mode: SceneMode) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.save(); ctx.scale(w / 960, h / 540);
  ctx.fillStyle = '#c4c9bd'; ctx.fillRect(0, 0, 960, 540);
  ctx.fillStyle = '#b4baae'; for (let y = 0; y < 330; y += 42) { ctx.fillRect(0, y, 960, 2); }
  ctx.fillStyle = '#303f37'; ctx.fillRect(362, 0, 234, 330);
  ctx.fillStyle = '#49594d'; ctx.fillRect(377, 16, 204, 286);
  ctx.strokeStyle = '#697566'; ctx.lineWidth = 2; ctx.strokeRect(395, 34, 168, 120); ctx.strokeRect(395, 174, 168, 111);
  ctx.fillStyle = '#c5b890'; ctx.fillRect(550, 183, 7, 27);
  ctx.fillStyle = '#d4d7cc'; ctx.beginPath(); ctx.moveTo(0, 315); ctx.lineTo(960, 315); ctx.lineTo(960, 540); ctx.lineTo(0, 540); ctx.fill();
  ctx.strokeStyle = '#b6bcae'; ctx.lineWidth = 2; for (let x = -500; x < 1600; x += 180) { ctx.beginPath(); ctx.moveTo(480 + (x - 480) * .6, 315); ctx.lineTo(x, 540); ctx.stroke(); }
  for (const y of [355, 411, 487]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(960, y); ctx.stroke(); }
  ctx.fillStyle = '#788372'; ctx.beginPath(); ctx.ellipse(480, 345, 190, 38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#67725f'; ctx.font = '11px monospace'; ctx.fillText('DELIVERY AREA', 420, 327);
  ctx.fillStyle = '#7a806b'; ctx.fillRect(125, 243, 78, 107); ctx.fillRect(752, 243, 78, 107);
  ctx.fillStyle = '#354d36'; for (const cx of [164, 791]) for (let j = 0; j < 7; j++) { ctx.beginPath(); ctx.ellipse(cx + Math.sin(j * 3) * 36, 212 + Math.cos(j * 2) * 43, 27, 50, j, 0, Math.PI * 2); ctx.fill(); }
  if (mode !== 'absent') {
    const x = (HOME_BOX.x + (mode === 'moved' ? .20 : 0)) * 960;
    const y = (HOME_BOX.y + (mode === 'moved' ? -.12 : 0)) * 540;
    const bw = HOME_BOX.w * 960, bh = HOME_BOX.h * 540;
    ctx.fillStyle = '#8b7c60'; ctx.fillRect(x + 7, y + 8, bw, bh);
    ctx.fillStyle = '#aa7648'; ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#cf9c64'; ctx.fillRect(x, y, bw, bh * .32);
    ctx.fillStyle = '#765236'; ctx.fillRect(x, y + bh * .32, bw, 3);
    ctx.fillStyle = '#e2c195'; ctx.fillRect(x + bw * .45, y, bw * .1, bh);
    ctx.fillStyle = '#f5f1dc'; ctx.fillRect(x + 12, y + bh * .45, 43, 34);
    ctx.fillStyle = '#2e352e'; for (let k = 0; k < 8; k++) ctx.fillRect(x + 17 + k * 4, y + bh * .5, k % 3 + 1, 14);
    ctx.font = '9px monospace'; ctx.fillText('DR-001', x + 15, y + bh * .76);
  }
  if (mode === 'occluded') { ctx.fillStyle = '#435361'; ctx.fillRect(387, 281, 250, 191); ctx.fillStyle = '#647381'; ctx.fillRect(402, 293, 220, 167); }
  ctx.fillStyle = '#20392b12'; ctx.fillRect(0, 0, 960, 540);
  ctx.restore();
}
