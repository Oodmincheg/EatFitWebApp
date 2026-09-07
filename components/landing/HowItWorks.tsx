'use client';

import { useI18n } from '@/hooks/useI18n';
import { Reveal } from './Reveal';

const STYLES: { n: string; accent: string; bg: string; tilt: string }[] = [
  { n: '01', accent: 'text-tomato', bg: 'bg-peach', tilt: 'md:hover:-rotate-1' },
  { n: '02', accent: 'text-lime-deep', bg: 'bg-mint', tilt: 'md:hover:rotate-1' },
  { n: '03', accent: 'text-tomato-deep', bg: 'bg-apricot', tilt: 'md:hover:-rotate-1' },
];

export function HowItWorks() {
  const { t } = useI18n();
  const how = t.landing.how;
  return (
    <section id="how-it-works" className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal>
          <h2 className="text-center font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {how.title}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-latte">{how.subtitle}</p>
        </Reveal>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STYLES.map((s, i) => {
            const step = how.steps[i];
            return (
              <li key={s.n}>
                <Reveal delay={i * 0.12} className="h-full">
                  <div
                    className={`h-full rounded-[20px] border-2 border-ink p-6 transition-all duration-300 ease-out hover:-translate-y-2 hover:shadow-[6px_6px_0_var(--color-ink)] ${s.tilt} ${s.bg}`}
                  >
                    <p className={`font-display text-[32px] font-extrabold leading-none ${s.accent}`}>
                      {s.n}
                    </p>
                    <h3 className="mt-3 text-[16.5px] font-bold">{step.title}</h3>
                    <p className="mt-1.5 text-[13.5px] leading-normal text-latte">{step.text}</p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
