'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FridgeModal } from '@/components/dashboard/FridgeModal';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { WeekSkeleton, WeekView } from '@/components/dashboard/WeekView';
import { WeekTemplate } from '@/components/dashboard/WeekTemplate';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { usePins } from '@/hooks/usePins';
import { usePlan } from '@/hooks/usePlan';
import { useProgress } from '@/hooks/useProgress';
import { eatenByDayName, planRange } from '@/lib/dates';
import { profilePlanDays } from '@/lib/profile';
import type { DietaryTag, MealPlan, PantryItem } from '@/lib/schemas';

export default function PlanPage() {
  const { t } = useI18n();
  const { profile, saveProfile } = useSession();
  const {
    plan,
    draft,
    generating,
    regeneratingDay,
    regeneratingMeal,
    error,
    generate,
    regenerateDay,
    regenerateMeal,
  } = usePlan();
  const { pin } = usePins();
  const { byDate } = useProgress(plan ? planRange(plan) : undefined);
  const toast = useToast();
  const [statusIdx, setStatusIdx] = useState(0);
  const [fridgeOpen, setFridgeOpen] = useState(false);
  const statusLines = t.plan.status;

  // Rotating status line while the model works on the next day.
  useEffect(() => {
    if (!generating) return;
    setStatusIdx(0);
    const timer = setInterval(
      () => setStatusIdx((i) => (i + 1) % statusLines.length),
      3000
    );
    return () => clearInterval(timer);
  }, [generating, statusLines.length]);

  if (!profile) return null;

  // The profile PUT rewrites createdAt on every save, so a plan generated
  // before the last save was built from settings that no longer apply.
  const planOutdated =
    plan !== null && Date.parse(profile.createdAt) > Date.parse(plan.generatedAt);

  // Fridge dialog confirmed: persist the pantry and dietary tags (so they're
  // prefilled next time and the server generates from them), then kick off
  // generation.
  const startGeneration = async (pantry: PantryItem[], dietaryTags: DietaryTag[]) => {
    setFridgeOpen(false);
    const tagsChanged =
      dietaryTags.length !== profile.dietaryTags.length ||
      dietaryTags.some((tag) => !profile.dietaryTags.includes(tag));
    const pantryChanged =
      pantry.length !== profile.pantry.length ||
      pantry.some((item, i) => item.name !== profile.pantry[i]?.name);
    if (pantryChanged || tagsChanged) {
      try {
        await saveProfile({
          goal: profile.goal,
          age: profile.age,
          weightKg: profile.weightKg,
          heightCm: profile.heightCm,
          sex: profile.sex,
          activityLevel: profile.activityLevel,
          pantry,
          dietaryTags,
          calorieTargetOverride: profile.calorieTargetOverride ?? null,
          mealSlots: profile.mealSlots,
          planDays: profile.planDays,
        });
      } catch {
        toast(t.plan.saveFridgeFailed);
        return;
      }
    }
    generate();
  };

  // While generating, the finished days render as a partial plan and the
  // rest of the week shows as placeholders.
  const totalDays = draft?.totalDays ?? profilePlanDays(profile);
  const draftPlan: MealPlan | null =
    draft && draft.days.length > 0
      ? { generatedAt: new Date().toISOString(), startDate: draft.startDate, days: draft.days }
      : null;

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
            {generating ? t.plan.cooking : plan ? t.plan.regenerate : t.plan.generate}
          </Button>
          {generating && (
            <span className="font-mono text-xs font-bold text-sand" role="status">
              {t.plan.progress(draft?.days.length ?? 0, totalDays)} · {statusLines[statusIdx]}
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
            {t.plan.outdated}
          </span>
          <Button variant="secondary" onClick={() => setFridgeOpen(true)}>
            {t.plan.outdatedButton}
          </Button>
        </div>
      )}

      {error && !generating && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-ink bg-apricot px-4 py-3 text-sm font-semibold"
        >
          <span>{error === 'generation_failed' ? t.plan.invalid : t.plan.upstream}</span>
          <Button variant="secondary" onClick={generate}>
            {t.common.tryAgain}
          </Button>
        </div>
      )}

      {generating ? (
        draftPlan ? (
          <WeekView
            plan={draftPlan}
            target={profile.calorieTarget}
            pendingDays={Math.max(0, totalDays - draftPlan.days.length)}
          />
        ) : (
          <WeekSkeleton days={totalDays} />
        )
      ) : plan ? (
        <>
          <WeekView
            plan={plan}
            target={profile.calorieTarget}
            eatenByDay={eatenByDayName(plan, byDate)}
            regeneratingDay={regeneratingDay}
            regeneratingMeal={regeneratingMeal}
            onRegenerateDay={regenerateDay}
            onRegenerateMeal={regenerateMeal}
            onPinSlot={(i, slot, dishId) => pin(plan.days[i].day, slot, dishId)}
          />
          <p className="text-sm font-semibold text-latte">
            {t.plan.needGroceries}{' '}
            <Link
              href="/dashboard/ingredients"
              className="font-bold text-tomato underline-offset-2 hover:underline"
            >
              {t.plan.buildCart}
            </Link>
          </p>
        </>
      ) : (
        <>
          <div className="rounded-3xl border-2 border-dashed border-sand py-10 text-center">
            <p className="text-3xl" aria-hidden="true">
              🍽️
            </p>
            <p className="mt-3 font-display text-lg font-extrabold">{t.plan.noPlan}</p>
            <p className="mt-1 text-sm text-latte">{t.plan.noPlanText}</p>
          </div>
          <WeekTemplate />
        </>
      )}

      <FridgeModal
        open={fridgeOpen}
        initial={profile.pantry}
        initialTags={profile.dietaryTags}
        onCancel={() => setFridgeOpen(false)}
        onGenerate={startGeneration}
      />
    </>
  );
}
