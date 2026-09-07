'use client';

import { useI18n } from '@/hooks/useI18n';
import { LandingImage } from './LandingImage';
import { LANDING_IMAGES } from './images';
import { Reveal } from './Reveal';

const IMAGES = [
  LANDING_IMAGES.featureCalories,
  LANDING_IMAGES.featureFridge,
  LANDING_IMAGES.featureCart,
];

export function Features() {
  const { t } = useI18n();
  const features = t.landing.features;
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <Reveal>
        <h2 className="text-center font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
          {features.title}
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {features.items.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.12} className="h-full">
            <article className="group h-full overflow-hidden rounded-[20px] border-2 border-ink bg-white transition-all duration-300 ease-out hover:-translate-y-2 hover:shadow-[6px_6px_0_var(--color-ink)]">
              <div className="overflow-hidden border-b-2 border-ink">
                <LandingImage
                  slot={IMAGES[i]}
                  alt={f.alt}
                  sizes="(max-width: 768px) 90vw, 30vw"
                  className="aspect-[4/3] w-full transition-transform duration-500 ease-out group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <h3 className="text-[16.5px] font-bold">{f.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-normal text-latte">{f.text}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
