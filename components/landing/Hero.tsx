'use client';

import { CSSProperties, MouseEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { LandingImage } from './LandingImage';
import { LANDING_IMAGES } from './images';

/** Decorative food that bobs on its own and drifts with the cursor (depth = parallax strength, px). */
const BITES: { emoji: string; depth: number; className: string; delay: number }[] = [
  { emoji: '🥦', depth: 22, className: 'left-[3%] top-[14%] text-4xl', delay: 0 },
  { emoji: '🍋', depth: 34, className: 'left-[10%] bottom-[10%] text-3xl', delay: 0.6 },
  { emoji: '🍳', depth: 18, className: 'right-[4%] top-[9%] text-4xl', delay: 1.1 },
  { emoji: '🥕', depth: 40, className: 'right-[12%] bottom-[16%] text-3xl', delay: 0.3 },
  { emoji: '🧀', depth: 28, className: 'left-[44%] top-[4%] text-2xl hidden sm:block', delay: 0.9 },
  { emoji: '🍓', depth: 32, className: 'left-[36%] bottom-[5%] text-2xl hidden sm:block', delay: 1.4 },
];

/** Counts 0 → target with an ease-out curve once the hero mounts. */
function useCountUp(target: number, duration = 1300, delay = 650) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const timer = setTimeout(() => {
      let start: number | null = null;
      const tick = (t: number) => {
        if (start === null) start = t;
        const p = Math.min((t - start) / duration, 1);
        setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, duration, delay]);

  return value;
}

export function Hero({ onCta }: { onCta: () => void }) {
  const kcal = useCountUp(1850);

  // Cursor parallax: write normalized coords to CSS vars, bites translate off them.
  const handleMove = (e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', String(((e.clientX - r.left) / r.width - 0.5) * 2));
    el.style.setProperty('--my', String(((e.clientY - r.top) / r.height - 0.5) * 2));
  };

  const stagger = (i: number) => ({ '--d': `${i * 0.09}s` }) as CSSProperties;

  return (
    <section className="relative overflow-hidden" onMouseMove={handleMove}>
      {/* soft drifting colour blobs */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="anim-drift absolute -top-24 -left-24 h-96 w-96 rounded-full bg-peach opacity-70 blur-3xl" />
        <div
          className="anim-drift absolute -right-20 -bottom-32 h-[26rem] w-[26rem] rounded-full bg-mint opacity-70 blur-3xl"
          style={{ '--d': '-7s' } as CSSProperties}
        />
      </div>

      {/* parallax floating food */}
      {BITES.map((b) => (
        <span
          key={b.emoji}
          aria-hidden="true"
          className={`pointer-events-none absolute select-none opacity-70 ${b.className}`}
          style={{
            transform: `translate(calc(var(--mx, 0) * ${b.depth}px), calc(var(--my, 0) * ${Math.round(b.depth * 0.6)}px))`,
            transition: 'transform 0.4s ease-out',
          }}
        >
          <span className="anim-float inline-block" style={{ '--d': `${b.delay}s` } as CSSProperties}>
            {b.emoji}
          </span>
        </span>
      ))}

      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 lg:grid-cols-2">
        <div className="text-center lg:text-left">
          <span
            className="anim-rise inline-flex -rotate-1 items-center gap-2 rounded-full bg-peach px-4 py-2 text-[13px] font-bold text-tomato"
            style={stagger(0)}
          >
            🍅 dinner sorted, all week
          </span>
          <h1
            className="anim-rise mt-5 font-display text-5xl font-extrabold leading-[0.98] tracking-tight text-balance sm:text-6xl"
            style={stagger(1)}
          >
            Cook what’s{' '}
            <span className="relative inline-block text-tomato">
              already
              <svg
                aria-hidden="true"
                className="absolute -bottom-2 left-0 w-full"
                viewBox="0 0 120 12"
                fill="none"
                preserveAspectRatio="none"
              >
                <path
                  className="squiggle-draw"
                  pathLength={1}
                  d="M2 8 Q 12 2 24 7 T 48 7 T 72 7 T 96 7 T 118 6"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </span>{' '}
            in your fridge.
          </h1>
          <p
            className="anim-rise mx-auto mt-5 max-w-md text-lg leading-normal text-latte lg:mx-0"
            style={stagger(2)}
          >
            Tell EatFit your goal and what you’ve got. Get a fun, calorie-smart week of meals —
            and we’ll grab the rest from the shop.
          </p>
          <div
            className="anim-rise mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
            style={stagger(3)}
          >
            <Button className="px-7 py-3.5 text-base hover:scale-[1.04]" onClick={onCta}>
              Generate my plan →
            </Button>
            <Button
              variant="secondary"
              className="px-6 py-3.5 text-base hover:scale-[1.04]"
              onClick={onCta}
            >
              Peek as guest
            </Button>
          </div>
          <p className="anim-rise mt-6 text-sm font-medium text-sand" style={stagger(4)}>
            No credit card · Works as a guest
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="anim-pop" style={{ '--d': '0.35s' } as CSSProperties}>
            <div className="rotate-2 transition-transform duration-500 ease-out hover:rotate-0 hover:scale-[1.02]">
              <LandingImage
                slot={LANDING_IMAGES.hero}
                priority
                sizes="(max-width: 1024px) 90vw, 45vw"
                className="aspect-square w-full rounded-[26px] border-2 border-ink"
              />
            </div>
          </div>
          {/* playful stat stickers */}
          <div
            className="anim-pop absolute -top-3 -left-3 sm:-left-5"
            style={{ '--d': '0.85s' } as CSSProperties}
          >
            <div className="anim-float -rotate-6 rounded-2xl border-2 border-ink bg-lime px-4 py-3 text-white">
              <p className="font-display text-2xl font-extrabold leading-none tabular-nums">
                {kcal.toLocaleString('en-US')}
              </p>
              <p className="mt-1 text-[11px] font-bold">kcal / day 🎯</p>
            </div>
          </div>
          <div
            className="anim-pop absolute -right-3 bottom-6 sm:-right-4"
            style={{ '--d': '1s' } as CSSProperties}
          >
            <div
              className="anim-float rotate-3 rounded-2xl border-2 border-ink bg-white px-4 py-2.5"
              style={{ '--d': '0.7s' } as CSSProperties}
            >
              <p className="text-[13px] font-bold">🛒 6 items · 1 tap</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
