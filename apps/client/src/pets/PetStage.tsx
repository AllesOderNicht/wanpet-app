import { useEffect, useRef, useState } from 'react';
import { Application, Rectangle, Sprite, Texture } from 'pixi.js';
import { advanceMotion, clampPoint, frameAt, frameScale, petLayout, type ClipName, type Motion, type PetFrame, type Point } from './model';
import type { LoadedPet } from './load';

interface Props { pet: LoadedPet; autoWalk: boolean; reducedMotion: boolean; onMotion: (moving: boolean) => void }
interface Controller { move: (point: Point) => void; position: () => Point; height: () => number }

export function PetStage({ pet, autoWalk, reducedMotion, onMotion }: Props) {
  const host = useRef<HTMLDivElement>(null), controller = useRef<Controller | null>(null);
  const options = useRef({ autoWalk, reducedMotion, onMotion });
  options.current = { autoWalk, reducedMotion, onMotion };
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const element = host.current!;
    let cancelled = false, ready = false;
    const app = new Application();
    const bases: Texture[] = [], frames = new Map<PetFrame, Texture>();
    let observer: ResizeObserver | undefined;
    let visibility: (() => void) | undefined;
    let installedController: Controller | null = null;
    setError(false);
    const destroy = () => {
      observer?.disconnect();
      if (visibility) document.removeEventListener('visibilitychange', visibility);
      if (controller.current === installedController) controller.current = null;
      if (ready) {
        app.destroy(true, { children: true, texture: false, textureSource: false });
        frames.forEach(texture => texture.destroy(false));
        bases.forEach(texture => texture.destroy(true));
        ready = false;
      }
    };
    void (async () => {
      try {
        await app.init({ width: 390, height: 536, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl', autoStart: false });
        ready = true;
        if (cancelled) { destroy(); return; }
        const sources = new Map<string, Texture>();
        for (const [id, image] of Object.entries(pet.images)) {
          const texture = Texture.from(image, true);
          sources.set(id, texture); bases.push(texture);
        }
        for (const clip of Object.values(pet.pack.clips)) for (const f of clip.frames) {
          frames.set(f, new Texture({ source: sources.get(f.texture)!.source, frame: new Rectangle(...f.rect) }));
        }
        const sprite = new Sprite();
        app.stage.addChild(sprite);
        app.canvas.setAttribute('aria-hidden', 'true');
        element.appendChild(app.canvas);
        let height = 536, layout = petLayout(pet.pack, 390, height), bounds = layout.bounds;
        let motion: Motion = { position: { x: 195, y: 476 }, target: { x: 195, y: 476 }, facing: 'right', moving: false, distance: 0 };
        let wait = 2.5, idleTime = 0, previousMoving = false, currentFrame: PetFrame | undefined;
        const paint = () => {
          const clipName: ClipName = motion.moving ? (motion.facing === 'left' ? 'walkLeft' : 'walkRight') : 'idle';
          const clip = pet.pack.clips[clipName];
          const f = frameAt(clip, motion.moving ? motion.distance / pet.pack.speed : idleTime);
          if (f !== currentFrame) {
            sprite.texture = frames.get(f)!;
            sprite.anchor.set(...f.anchor);
            sprite.scale.set(frameScale(pet.pack, f) * layout.scale);
            currentFrame = f;
            element.dataset.action = clipName;
            element.dataset.frame = String(clip.frames.indexOf(f));
          }
          sprite.position.set(motion.position.x, motion.position.y);
          if (previousMoving !== motion.moving) {
            previousMoving = motion.moving;
            options.current.onMotion(motion.moving);
          }
        };
        const resize = () => {
          if (cancelled || !ready) return;
          const width = element.clientWidth;
          if (!width) return;
          height = element.clientHeight * 390 / width;
          app.renderer.resize(390, height);
          layout = petLayout(pet.pack, 390, height); bounds = layout.bounds;
          motion = { ...motion, position: clampPoint(motion.position, bounds), target: clampPoint(motion.target, bounds) };
          currentFrame = undefined;
          paint(); app.render();
        };
        const move = (point: Point) => {
          wait = 4;
          motion.target = clampPoint(point, bounds);
          if (options.current.reducedMotion) {
            motion.position = motion.target; motion.moving = false;
            paint(); app.render();
          }
        };
        controller.current = installedController = { move, position: () => motion.position, height: () => height };
        observer = new ResizeObserver(resize);
        observer.observe(element); resize();
        app.ticker.maxFPS = 30;
        app.ticker.add(ticker => {
          const dt = Math.min(ticker.deltaMS / 1000, 0.08);
          if (options.current.reducedMotion) {
            motion.moving = false; motion.target = motion.position; idleTime = 0;
          } else {
            const wasMoving = motion.moving;
            motion = advanceMotion(motion, dt, pet.pack.speed, bounds);
            idleTime = motion.moving ? 0 : idleTime + dt;
            if (wasMoving && !motion.moving) wait = 3 + Math.random() * 3;
            if (!motion.moving && options.current.autoWalk && (wait -= dt) <= 0) {
              const x = motion.position.x < (bounds.left + bounds.right) / 2 ? bounds.right - Math.random() * 24 : bounds.left + Math.random() * 24;
              move({ x, y: bounds.top + Math.random() * (bounds.bottom - bounds.top) });
            }
          }
          paint();
        });
        visibility = () => { if (document.hidden) app.stop(); else app.start(); };
        document.addEventListener('visibilitychange', visibility);
        visibility();
      } catch (reason) {
        destroy();
        if (!cancelled) { setError(true); options.current.onMotion(false); }
      }
    })();
    return () => { cancelled = true; destroy(); };
  }, [pet, retry]);

  return <>
    <div className="pet-stage" ref={host} role="button" tabIndex={error ? -1 : 0}
      aria-label={pet.pack.name + '的活动区，点击地毯或用方向键让它走动'} aria-describedby="walk-help"
      onClick={event => {
        if (!controller.current || event.detail === 0) return;
        const box = event.currentTarget.getBoundingClientRect();
        controller.current.move({ x: (event.clientX - box.left) * 390 / box.width, y: (event.clientY - box.top) * 390 / box.width });
      }}
      onKeyDown={event => {
        const c = controller.current;
        if (!c || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        const p = c.position();
        c.move({ x: event.key === 'ArrowLeft' ? p.x - 48 : event.key === 'ArrowRight' ? p.x + 48 : event.key === 'Enter' || event.key === ' ' ? 195 : p.x,
          y: event.key === 'ArrowUp' ? p.y - 24 : event.key === 'ArrowDown' ? p.y + 24 : p.y });
      }} />
    {error ? <div className="stage-error" role="alert"><p>小猫的活动场景未能打开</p><button className="text-button" onClick={() => setRetry(v => v + 1)}>重新打开</button></div> : null}
  </>;
}
