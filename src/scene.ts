// The built-in test scene is a set of pre-rendered stills of one front porch (see scripts/render-scene).
// Every still shares identical lighting and background pixels; only the parcel (or an obstruction) changes,
// so the detector sees genuine pixel differences rather than an overlay.
export const HOME_BOX = { x: .405, y: .612, w: .143, h: .22 };
export type SceneMode = 'rest' | 'moved' | 'occluded' | 'absent';
const sources: Record<SceneMode, string> = { rest: '/scene/rest.jpg', moved: '/scene/moved.jpg', occluded: '/scene/occluded.jpg', absent: '/scene/absent.jpg' };
const images = new Map<SceneMode, HTMLImageElement>();
const wanted = new WeakMap<CanvasRenderingContext2D, SceneMode>();
function image(mode: SceneMode) {
  let img = images.get(mode);
  if (!img) { img = new Image(); img.decoding = 'async'; img.src = sources[mode]; images.set(mode, img); }
  return img;
}
export function preloadScenes() { (Object.keys(sources) as SceneMode[]).forEach(image); }
export function drawScene(ctx: CanvasRenderingContext2D, mode: SceneMode) {
  wanted.set(ctx, mode);
  const img = image(mode), { width, height } = ctx.canvas;
  if (img.complete && img.naturalWidth) { ctx.drawImage(img, 0, 0, width, height); return; }
  ctx.fillStyle = '#07090a'; ctx.fillRect(0, 0, width, height);
  img.addEventListener('load', () => { if (wanted.get(ctx) === mode) drawScene(ctx, mode); }, { once: true });
}
