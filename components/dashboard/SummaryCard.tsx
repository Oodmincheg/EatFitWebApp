'use client';

import { Chip } from '@/components/ui/Chip';
import { TAG_OPTIONS } from '@/lib/dietary';
import type { Profile } from '@/lib/schemas';

const GOAL_LABELS: Record<Profile['goal'], string> = {
  weight_loss: 'Weight loss',
  maintenance: 'Maintenance',
  muscle_gain: 'Muscle gain',
};

export function SummaryCard({ profile }: { profile: Profile }) {
  const tagLabel = (tag: Profile['dietaryTags'][number]) =>
    TAG_OPTIONS.find((t) => t.value === tag)?.label ?? tag;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="-rotate-1 rounded-[20px] border-2 border-ink bg-lime px-6 py-4 text-white">
        <p className="text-[11px] font-bold tracking-wider">YOUR DAILY TARGET</p>
        <p className="font-display text-[42px] font-extrabold leading-none">
          {profile.calorieTarget.toLocaleString('en-US')}{' '}
          <span className="text-base">kcal</span>
        </p>
      </div>
      <div className="flex max-w-sm flex-wrap items-center gap-2">
        <Chip label={GOAL_LABELS[profile.goal]} selected />
        <Chip
          label={profile.activityLevel.charAt(0).toUpperCase() + profile.activityLevel.slice(1)}
        />
        <Chip label={`${profile.age}y · ${profile.weightKg}kg · ${profile.heightCm}cm`} />
        {profile.dietaryTags.map((tag) => (
          <Chip key={tag} label={tagLabel(tag)} />
        ))}
      </div>
    </div>
  );
}
