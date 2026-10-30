const assetRoot = new URL('./assets/cat/', import.meta.url);
// shortcut: rest repeats source frames 0–17; load the remaining atlases for native-length playback.

/** Existing calico sprites. Position the canvas's parent to move through the room. */
export function createCat(canvas) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The cat preview needs a 2D canvas.');
  const images = new Map();
  let manifest, active, requested = 'rest', reduced = false, destroyed = false;
  let raf = 0, started = 0, previousFrame = -1, previousSize = '';

  function draw(time = performance.now()) {
    if (destroyed || !active) return;
    const clip = manifest.clips[active];
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    const units = clip.frames.reduce((sum, frame) => sum + frame.duration, 0);
    let phase = reduced ? 0 : ((time - started) / 1000 * clip.fps) % units;
    let index = 0;
    while (index < clip.frames.length - 1 && phase >= clip.frames[index].duration) {
      phase -= clip.frames[index++].duration;
    }
    const size = `${width}:${height}`;
    if (index !== previousFrame || size !== previousSize) {
      if (size !== previousSize) { canvas.width = width; canvas.height = height; }
      context.clearRect(0, 0, width, height);
      const frame = clip.frames[index];
      const [x, y, w, h] = frame.rect;
      const [ax, ay] = frame.anchor;
      const extents = clip.extents;
      const originX = width * .5, originY = height * .9;
      const scale = Math.min(width * .48 / extents.left, width * .48 / extents.right,
        height * .88 / extents.top, height * .08 / extents.bottom);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(images.get(active).image, x, y, w, h,
        originX - ax * scale, originY - ay * scale, w * scale, h * scale);
      previousFrame = index;
      previousSize = size;
      canvas.dataset.catFrame = String(frame.sourceFrame);
    }
    raf = !reduced && !document.hidden ? requestAnimationFrame(draw) : 0;
  }

  function refresh() {
    cancelAnimationFrame(raf);
    previousFrame = -1;
    draw();
  }

  async function activate(motion) {
    if (destroyed) return;
    const clip = manifest.clips[motion];
    if (!images.has(motion)) {
      const image = new Image();
      const loaded = new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error(`Cannot load the original ${motion} cat atlas.`));
      });
      image.src = new URL(clip.file, assetRoot).href;
      images.set(motion, { image, loaded });
    }
    await images.get(motion).loaded;
    if (destroyed || requested !== motion) return;
    active = motion;
    started = performance.now();
    canvas.dataset.catMotion = motion;
    canvas.dataset.catState = 'ready';
    refresh();
  }

  canvas.dataset.catState = 'loading';
  const ready = fetch(new URL('manifest.json', assetRoot))
    .then(response => {
      if (!response.ok) throw new Error(`Cannot load cat manifest (${response.status}).`);
      return response.json();
    })
    .then(data => {
      manifest = data;
      for (const clip of Object.values(manifest.clips)) {
        clip.extents = {
          left: Math.max(...clip.frames.map(f => f.anchor[0])),
          right: Math.max(...clip.frames.map(f => f.rect[2] - f.anchor[0])),
          top: Math.max(...clip.frames.map(f => f.anchor[1])),
          bottom: Math.max(1, ...clip.frames.map(f => f.rect[3] - f.anchor[1])),
        };
      }
      return activate(requested);
    });
  function report(error) {
    if (!destroyed) {
      canvas.dataset.catState = 'error';
      canvas.dispatchEvent(new CustomEvent('caterror', { detail: error, bubbles: true }));
    }
  }
  ready.catch(report);
  const observer = new ResizeObserver(refresh);
  observer.observe(canvas);
  const visibility = () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else { started = performance.now(); refresh(); }
  };
  document.addEventListener('visibilitychange', visibility);

  return {
    ready,
    setMotion(motion) {
      if (!['rest', 'left', 'right'].includes(motion)) throw new Error(`Unknown cat motion: ${motion}`);
      if (destroyed || requested === motion) return;
      requested = motion;
      if (manifest) activate(motion).catch(report);
    },
    setReduced(value) {
      reduced = Boolean(value);
      started = performance.now();
      refresh();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      images.clear();
      context.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
