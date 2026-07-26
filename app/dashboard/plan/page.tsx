'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FridgeModal } from '@/components/dashboard/FridgeModal';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { WeekSkeleton, WeekView } from '@/components/dashboard/WeekView';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { usePlan } from '@/hooks/usePlan';
import { useProgress } from '@/hooks/useProgress';
import { eatenByDayName, planRange } from '@/lib/dates';
import type { DietaryTag } from '@/lib/schemas';

const STATUS_LINES = [
  'Composing your week…',
  'Balancing calories across days…',
  'Checking your fridge…',
  'Filling the gaps with groceries…',
  'Plating it all up…',
];

export default function PlanPage() {
  const { profile, saveProfile } = useSession();
  const { plan, generating, regeneratingDay, error, generate, regenerateDay } = usePlan();
  const { byDate } = useProgress(plan ? planRange(plan) : undefined);
  const toast = useToast();
  const [statusIdx, setStatusIdx] = useState(0);
  const [fridgeOpen, setFridgeOpen] = useState(false);

  // Rotating status line while the model works (5–30 s expected).
  useEffect(() => {
    if (!generating) return;
    setStatusIdx(0);
    const timer = setInterval(
      () => setStatusIdx((i) => (i + 1) % STATUS_LINES.length),
      3000
    );
    return () => clearInterval(timer);
  }, [generating]);

  if (!profile) return null;

  // The profile PUT rewrites createdAt on every save, so a plan generated
  // before the last save was built from settings that no longer apply.
  const planOutdated =
    plan !== null && Date.parse(profile.createdAt) > Date.parse(plan.generatedAt);

  // Fridge dialog confirmed: persist the list and dietary tags (so they're
  // prefilled next time and the server generates from them), then kick off
  // generation.
  const startGeneration = async (ingredients: string, dietaryTags: DietaryTag[]) => {
    setFridgeOpen(false);
    const tagsChanged =
      dietaryTags.length !== profile.dietaryTags.length ||
      dietaryTags.some((t) => !profile.dietaryTags.includes(t));
    if (ingredients !== profile.ingredients || tagsChanged) {
      try {
        await saveProfile({
          goal: profile.goal,
          age: profile.age,
          weightKg: profile.weightKg,
          heightCm: profile.heightCm,
          sex: profile.sex,
          activityLevel: profile.activityLevel,
          ingredients,
          dietaryTags,
        });
      } catch {
        toast('Could not save your fridge list. Try again.');
        return;
      }
    }
    generate();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-6">
        <SummaryCard profile={profile} />
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Button
            className="px-6 py-3.5 text-[15px]"
            onClick={() => setFridgeOpen(true)}
            disabled={generating || regeneratingDay !== null}
          >
            {generating ? 'Cooking…' : plan ? 'Regenerate 🎲' : 'Generate my week 🎲'}
          </Button>
          {generating && (
            <span className="font-mono text-xs font-bold text-sand" role="status">
              {STATUS_LINES[statusIdx]}
            </span>
          )}
        </div>
      </div>

      {planOutdated && !generating && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-ink bg-peach px-4 py-3 text-sm font-semibold"
        >
          <span>
            <span aria-hidden="true">⚙️ </span>
            Your settings changed after this plan was made, so it may no longer
            match your goal. Regenerate to bring it up to date.
          </span>
          <Button variant="secondary" onClick={() => setFridgeOpen(true)}>
            Regenerate
          </Button>
        </div>
      )}

      {error && !generating && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-ink bg-apricot px-4 py-3 text-sm font-semibold"
        >
          <span>
            {error === 'generation_failed'
              ? 'The AI produced an invalid plan. Your previous plan is untouched.'
              : 'Could not reach the meal-planning service.'}
          </span>
          <Button variant="secondary" onClick={generate}>
            Try again
          </Button>
        </div>
      )}

      {generating ? (
        <WeekSkeleton />
      ) : plan ? (
        <>
          <WeekView
            plan={plan}
            target={profile.calorieTarget}
            eatenByDay={eatenByDayName(plan, byDate)}
            regeneratingDay={regeneratingDay}
            onRegenerateDay={regenerateDay}
          />
          <p className="text-sm font-semibold text-latte">
            Need groceries for this menu?{' '}
            <Link
              href="/dashboard/ingredients"
              className="font-bold text-tomato underline-offset-2 hover:underline"
            >
              Build your cart →
            </Link>
          </p>
        </>
      ) : (
        <div className="rounded-3xl border-2 border-dashed border-sand py-16 text-center">
          <p className="text-3xl" aria-hidden="true">
            🍽️
          </p>
          <p className="mt-3 font-display text-lg font-extrabold">No plan yet</p>
          <p className="mt-1 text-sm text-latte">
            Generate your first weekly menu to see it here.
          </p>
        </div>
      )}

      <FridgeModal
        open={fridgeOpen}
        initial={profile.ingredients}
        initialTags={profile.dietaryTags}
        onCancel={() => setFridgeOpen(false)}
        onGenerate={startGeneration}
      />
    </>
  );
}
