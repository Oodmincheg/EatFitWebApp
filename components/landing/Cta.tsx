'use client';

import { CSSProperties } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { Reveal } from './Reveal';

const SPRINKLES: { emoji: string; className: string; delay: number }[] = [
  { emoji: '🍕', className: 'left-[6%] top-[18%] text-3xl -rotate-12', delay: 0 },
  { emoji: '🥗', className: 'right-[8%] top-[22%] text-3xl rotate-12', delay: 0.7 },
  { emoji: '🍜', className: 'left-[14%] bottom-[16%] text-2xl rotate-6', delay: 1.2 },
  { emoji: '🍳', className: 'right-[15%] bottom-[14%] text-2xl -rotate-6', delay: 0.4 },
];

export function Cta({ onCta }: { onCta: () => void }) {
  const { t } = useI18n();
  const cta = t.landing.cta;
  return (
    <section className="px-4 pb-16 sm:pb-20">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border-2 border-ink bg-tomato px-6 py-14 text-center sm:py-16">
          {SPRINKLES.map((s) => (
            <span
              key={s.emoji}
              aria-hidden="true"
              className={`pointer-events-none absolute hidden select-none opacity-50 sm:block ${s.className}`}
            >
              <span
                className="anim-float inline-block"
                style={{ '--d': `${s.delay}s` } as CSSProperties}
              >
                {s.emoji}
              </span>
            </span>
          ))}
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-white text-balance sm:text-4xl">
            {cta.title}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-white/85">{cta.text}</p>
          <button
            onClick={onCta}
            className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-base font-bold text-tomato transition-all hover:scale-105 hover:bg-peach hover:animate-[wiggle_0.4s_ease-in-out] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {cta.button}
          </button>
        </div>
      </Reveal>
    </section>
  );
}
