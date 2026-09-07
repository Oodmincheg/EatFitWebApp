'use client';

import { Chip } from '@/components/ui/Chip';
import { useI18n } from '@/hooks/useI18n';
import type { Profile } from '@/lib/schemas';

export function SummaryCard({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="-rotate-1 rounded-[20px] border-2 border-ink bg-lime px-6 py-4 text-white">
        <p className="text-[11px] font-bold tracking-wider">{t.summary.target}</p>
        <p className="font-display text-[42px] font-extrabold leading-none">
          {profile.calorieTarget.toLocaleString(t.intl)}{' '}
          <span className="text-base">{t.units.kcal}</span>
        </p>
      </div>
      <div className="flex max-w-sm flex-wrap items-center gap-2">
        <Chip label={t.goals[profile.goal]} selected />
        <Chip label={t.activityShort[profile.activityLevel]} />
        <Chip label={t.summary.stats(profile.age, profile.weightKg, profile.heightCm)} />
        {profile.dietaryTags.map((tag) => (
          <Chip key={tag} label={t.dietary[tag]} />
        ))}
      </div>
    </div>
  );
}
