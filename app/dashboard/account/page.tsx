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
import type { Goal, Profile, ProfileInput, Session } from '@/lib/schemas';

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
  const [saving, setSaving] = useState(false);

  const toInput = (): ProfileInput => ({
    goal,
    age: Number(params.age),
    weightKg: Number(params.weightKg),
    heightCm: Number(params.heightCm),
    sex: params.sex!,
    activityLevel: params.activityLevel as ProfileInput['activityLevel'],
    // The fridge list and dietary tags are edited in the generate-plan
    // dialog — keep them as they are.
    ingredients: profile.ingredients,
    dietaryTags: profile.dietaryTags,
  });

  // Live preview of the target (display-only; the server recomputes on save).
  const paramsValid = Object.keys(validateParams(params)).length === 0;
  const previewTarget = paramsValid ? calorieTarget(toInput()) : null;

  const save = async () => {
    const errs = validateParams(params);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      const updated = await saveProfile(toInput());
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

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border-2 border-ink bg-white p-4 sm:p-5">
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
