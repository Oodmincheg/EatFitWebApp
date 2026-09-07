'use client';

import { useI18n } from '@/hooks/useI18n';

/** Infinite scrolling dish ticker — content doubled so the -50% loop is seamless. */
export function Marquee() {
  const { t } = useI18n();
  const dishes = t.landing.marquee;
  return (
    <div aria-hidden="true" className="overflow-hidden py-5">
      <div className="-mx-4 -rotate-1 overflow-hidden border-y-2 border-ink bg-lime py-3.5">
        <div className="anim-marquee flex w-max items-center hover:[animation-play-state:paused]">
          {[...dishes, ...dishes].map((dish, i) => (
            <span
              key={i}
              className="flex items-center whitespace-nowrap text-[15px] font-bold text-white"
            >
              <span className="px-5">{dish}</span>
              <span className="text-white/60">✦</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
