'use client';

import type { Goal } from '@/lib/schemas';

const GOALS: { value: Goal; icon: string; title: string; text: string }[] = [
  { value: 'weight_loss', icon: '📉', title: 'Weight loss', text: 'Eat at a moderate calorie deficit' },
  { value: 'maintenance', icon: '⚖️', title: 'Maintenance', text: 'Keep your current weight' },
  { value: 'muscle_gain', icon: '💪', title: 'Muscle gain', text: 'Eat at a calorie surplus' },
];

export function StepGoal({
  value,
  onChange,
}: {
  value: Goal | null;
  onChange: (goal: Goal) => void;
}) {
  return (
    <div>
      <h2 className="font-display text-2xl font-extrabold">What’s your goal?</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {GOALS.map((g) => (
          <button
            key={g.value}
            type="button"
            aria-pressed={value === g.value}
            onClick={() => onChange(g.value)}
            className={`rounded-2xl border-2 p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato ${
              value === g.value
                ? 'border-ink bg-peach'
                : 'border-peach-line bg-white hover:border-ink'
            }`}
          >
            <span className="text-2xl" aria-hidden="true">
              {g.icon}
            </span>
            <span className="mt-2 block font-bold">{g.title}</span>
            <span className="mt-1 block text-sm text-latte">{g.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
