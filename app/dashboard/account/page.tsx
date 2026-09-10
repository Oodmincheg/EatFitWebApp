'use client';

import { useState } from 'react';
import { StepGoal } from '@/components/onboarding/StepGoal';
import {
  StepParams,
  validateParams,
  type ParamsErrors,
  type ParamsState,
} from '@/components/onboarding/StepParams';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { calorieTarget } from '@/lib/calories';
import { profilePlanDays, profileSlots } from '@/lib/profile';
import {
  MEAL_SLOTS,
  PLAN_DAY_OPTIONS,
  orderSlots,
  type Goal,
  type MealSlot,
  type Profile,
  type ProfileInput,
  type Session,
} from '@/lib/schemas';

const MIN_TARGET = 800;
const MAX_TARGET = 6000;

export default function AccountPage() {
  const { user, profile } = useSession();

  // Layout guards guarantee both before this renders.
  if (!user || !profile) return null;

  return <AccountForm user={user} profile={profile} />;
}

function AccountForm({ user, profile }: { user: Session; profile: Profile }) {
  const toast = useToast();
  const { t } = useI18n();
  const { saveProfile } = useSession();
  const [goal, setGoal] = useState<Goal>(profile.goal);
  const [params, setParams] = useState<ParamsState>({
    age: String(profile.age),
    weightKg: String(profile.weightKg),
    heightCm: String(profile.heightCm),
    sex: profile.sex,
    activityLevel: profile.activityLevel,
  });
  const [errors, setErrors] = useState<ParamsErrors>({});
  const [manualTarget, setManualTarget] = useState(profile.calorieTargetOverride != null);
  const [targetText, setTargetText] = useState(String(profile.calorieTarget));
  const [slots, setSlots] = useState<MealSlot[]>(profileSlots(profile));
  const [planDays, setPlanDays] = useState<number>(profilePlanDays(profile));
  const [saving, setSaving] = useState(false);

  const overrideValue = Number(targetText);
  const overrideValid =
    Number.isInteger(overrideValue) &&
    overrideValue >= MIN_TARGET &&
    overrideValue <= MAX_TARGET;

  const toInput = (): ProfileInput => ({
    goal,
    age: Number(params.age),
    weightKg: Number(params.weightKg),
    heightCm: Number(params.heightCm),
    sex: params.sex!,
    activityLevel: params.activityLevel as ProfileInput['activityLevel'],
    // The pantry and dietary tags are edited elsewhere — keep them as they are.
    pantry: profile.pantry,
    dietaryTags: profile.dietaryTags,
    calorieTargetOverride: manualTarget && overrideValid ? overrideValue : null,
    mealSlots: orderSlots(slots),
    planDays: planDays as ProfileInput['planDays'],
  });

  // Live preview of the computed target (display-only; the server recomputes).
  const paramsValid = Object.keys(validateParams(params)).length === 0;
  const computedTarget = paramsValid ? calorieTarget(toInput()) : null;
  const previewTarget = manualTarget ? (overrideValid ? overrideValue : null) : computedTarget;

  // At least two meals: a day with one slot is not a plan.
  const toggleSlot = (slot: MealSlot) =>
    setSlots((prev) =>
      prev.includes(slot)
        ? prev.length > 2
          ? prev.filter((s) => s !== slot)
          : prev
        : orderSlots([...prev, slot])
    );

  const save = async () => {
    const errs = validateParams(params);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (manualTarget && !overrideValid) return;
    setSaving(true);
    try {
      const updated = await saveProfile(toInput());
      setTargetText(String(updated.calorieTarget));
      toast(t.account.saved(updated.calorieTarget.toLocaleString(t.intl)));
    } catch {
      toast(t.account.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-extrabold">{t.account.title}</h1>
        <p className="mt-0.5 text-sm font-semibold text-latte">
          {user.kind === 'google'
            ? t.account.google(user.displayName || user.email)
            : t.account.guest}
        </p>
      </div>

      <Card>
        <StepGoal value={goal} onChange={setGoal} />
      </Card>

      <Card>
        <StepParams
          value={params}
          errors={errors}
          onChange={(patch) => setParams((prev) => ({ ...prev, ...patch }))}
        />
      </Card>

      <Card>
        <h2 className="font-display text-lg font-extrabold">{t.account.targetTitle}</h2>
        <div className="mt-3 flex flex-col gap-2.5">
          <label className="flex items-start gap-3 text-sm font-semibold">
            <input
              type="radio"
              name="target-mode"
              checked={!manualTarget}
              onChange={() => setManualTarget(false)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-tomato"
            />
            <span>
              {t.account.targetAuto}
              <span className="mt-0.5 block text-xs font-medium text-latte">
                {computedTarget !== null
                  ? t.account.targetAutoHint(computedTarget.toLocaleString(t.intl))
                  : t.account.fixFields}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm font-semibold">
            <input
              type="radio"
              name="target-mode"
              checked={manualTarget}
              onChange={() => setManualTarget(true)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-tomato"
            />
            <span>
              {t.account.targetManual}
              <span className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_TARGET}
                  max={MAX_TARGET}
                  step={10}
                  value={targetText}
                  onFocus={() => setManualTarget(true)}
                  onChange={(e) => setTargetText(e.target.value)}
                  aria-label={t.account.targetManualLabel}
                  aria-invalid={manualTarget && !overrideValid}
                  className={`w-28 rounded-xl border-2 bg-paper px-3 py-2 text-sm font-semibold focus:outline-none ${
                    manualTarget && !overrideValid ? 'border-tomato' : 'border-peach-line focus:border-ink'
                  }`}
                />
                <span className="text-xs font-medium text-latte">{t.units.kcal}</span>
              </span>
              {manualTarget && !overrideValid && (
                <span className="mt-1 block text-xs font-bold text-tomato">
                  {t.account.targetRange}
                </span>
              )}
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-extrabold">{t.account.planTitle}</h2>
        <p className="mt-1 text-sm font-semibold text-latte">{t.account.planText}</p>

        <h3 className="mt-4 text-[11px] font-bold tracking-widest text-latte">
          {t.account.slotsLabel}
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {MEAL_SLOTS.map((slot) => {
            const active = slots.includes(slot);
            return (
              <button
                key={slot}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSlot(slot)}
                className={`rounded-full border-2 border-ink px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato ${
                  active ? 'bg-peach font-bold text-tomato' : 'bg-paper font-semibold text-ink hover:bg-cream'
                }`}
              >
                {t.meals[slot]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs font-medium text-latte">{t.account.slotsHint}</p>

        <h3 className="mt-5 text-[11px] font-bold tracking-widest text-latte">
          {t.account.daysLabel}
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLAN_DAY_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={planDays === days}
              onClick={() => setPlanDays(days)}
              className={`rounded-full border-2 border-ink px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato ${
                planDays === days
                  ? 'bg-peach font-bold text-tomato'
                  : 'bg-paper font-semibold text-ink hover:bg-cream'
              }`}
            >
              {t.account.daysOption(days)}
            </button>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border-2 border-ink bg-paper p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-bold tracking-widest text-latte">{t.account.target}</p>
          <p className="font-display text-2xl font-extrabold">
            {previewTarget !== null ? (
              <>
                {previewTarget.toLocaleString(t.intl)}{' '}
                <span className="text-sm text-latte">{t.units.kcal}</span>
              </>
            ) : (
              <span className="text-sm font-semibold text-tomato-deep">{t.account.fixFields}</span>
            )}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-latte">{t.account.applyNote}</p>
        </div>
        <Button className="px-6 py-3" onClick={save} disabled={saving}>
          {saving ? t.account.saving : t.account.save}
        </Button>
      </div>
    </>
  );
}
