'use client';

import { useEffect, useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Progress } from '@/components/onboarding/Progress';
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
import type { Goal, ProfileInput } from '@/lib/schemas';

interface WizardState {
  step: 1 | 2;
  goal: Goal | null;
  params: ParamsState;
}

type Action =
  | { type: 'goal'; goal: Goal }
  | { type: 'params'; patch: Partial<ParamsState> }
  | { type: 'step'; step: WizardState['step'] };

const initialState: WizardState = {
  step: 1,
  goal: null,
  params: { age: '', weightKg: '', heightCm: '', sex: null, activityLevel: '' },
};

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case 'goal':
      return { ...state, goal: action.goal };
    case 'params':
      return { ...state, params: { ...state.params, ...action.patch } };
    case 'step':
      return { ...state, step: action.step };
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useI18n();
  const { loading, user, profile, saveProfile } = useSession();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [paramErrors, setParamErrors] = useState<ParamsErrors>({});
  const [target, setTarget] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // §3.1 guard: no session → redirect to landing. Already onboarded →
  // settings live in My account now (the `saving` check keeps the wizard's
  // own finish flow heading to the dashboard instead).
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/');
    else if (profile && !saving) router.replace('/dashboard/account');
  }, [loading, user, profile, saving, router]);

  if (loading || !user || (profile && !saving)) {
    return <main className="p-8 text-center text-sm font-medium text-sand">{t.common.loading}</main>;
  }

  const next = () => {
    if (!state.goal) return;
    dispatch({ type: 'step', step: 2 });
  };

  const toInput = (): ProfileInput => ({
    goal: state.goal!,
    age: Number(state.params.age),
    weightKg: Number(state.params.weightKg),
    heightCm: Number(state.params.heightCm),
    sex: state.params.sex!,
    activityLevel: state.params.activityLevel as ProfileInput['activityLevel'],
    // The fridge list and dietary tags are collected in the generate-plan
    // dialog, not here.
    ingredients: '',
    dietaryTags: [],
  });

  // Finish: show computed target (display-only; server recomputes), then confirm.
  const finish = () => {
    const errors = validateParams(state.params);
    setParamErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setTarget(calorieTarget(toInput()));
  };

  const confirm = async () => {
    setSaving(true);
    try {
      await saveProfile(toInput());
      router.push('/dashboard');
    } catch {
      toast(t.onboarding.saveFailed);
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Progress step={state.step} total={2} />
      <Card className="mt-6 sm:p-8">
        {target !== null ? (
          <div className="text-center">
            <h2 className="font-display text-2xl font-extrabold">{t.onboarding.doneTitle}</h2>
            <p className="mt-4 text-latte">{t.onboarding.yourTarget}</p>
            <div className="mt-3 inline-block -rotate-1 rounded-[20px] border-2 border-ink bg-lime px-6 py-4 text-white">
              <p className="text-[11px] font-bold tracking-wider">{t.onboarding.targetLabel}</p>
              <p className="font-display text-[42px] font-extrabold leading-none">
                {target.toLocaleString(t.intl)} <span className="text-base">{t.units.kcal}</span>
              </p>
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="secondary" onClick={() => setTarget(null)} disabled={saving}>
                {t.common.back}
              </Button>
              <Button onClick={confirm} disabled={saving}>
                {saving ? t.onboarding.saving : t.onboarding.toDashboard}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {state.step === 1 && (
              <StepGoal value={state.goal} onChange={(goal) => dispatch({ type: 'goal', goal })} />
            )}
            {state.step === 2 && (
              <StepParams
                value={state.params}
                errors={paramErrors}
                onChange={(patch) => dispatch({ type: 'params', patch })}
              />
            )}
            <div className="mt-8 flex justify-between">
              <Button
                variant="ghost"
                onClick={() => dispatch({ type: 'step', step: 1 })}
                disabled={state.step === 1}
              >
                {t.common.back}
              </Button>
              {state.step < 2 ? (
                <Button onClick={next} disabled={!state.goal}>
                  {t.common.next}
                </Button>
              ) : (
                <Button onClick={finish}>{t.onboarding.finish}</Button>
              )}
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
