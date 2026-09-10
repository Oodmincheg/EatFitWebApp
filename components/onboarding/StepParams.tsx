'use client';

import { useI18n } from '@/hooks/useI18n';
import type { Dict } from '@/lib/i18n';
import type { ActivityLevel, Sex } from '@/lib/schemas';

export interface ParamsState {
  age: string;
  weightKg: string;
  heightCm: string;
  sex: Sex | null;
  activityLevel: ActivityLevel | '';
}

// Error codes, rendered through t.onboarding.errors.
type ErrorCode = keyof Dict['onboarding']['errors'];

export interface ParamsErrors {
  age?: ErrorCode;
  weightKg?: ErrorCode;
  heightCm?: ErrorCode;
  sex?: ErrorCode;
  activityLevel?: ErrorCode;
}

export function validateParams(p: ParamsState): ParamsErrors {
  const errors: ParamsErrors = {};
  const age = Number(p.age);
  if (!p.age || !Number.isInteger(age) || age < 10 || age > 100) {
    errors.age = 'age';
  }
  const weight = Number(p.weightKg);
  if (!p.weightKg || Number.isNaN(weight) || weight < 30 || weight > 300) {
    errors.weightKg = 'weight';
  }
  const height = Number(p.heightCm);
  if (!p.heightCm || Number.isNaN(height) || height < 100 || height > 250) {
    errors.heightCm = 'height';
  }
  if (!p.sex) errors.sex = 'required';
  if (!p.activityLevel) errors.activityLevel = 'required';
  return errors;
}

const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active'];
const SEXES: Sex[] = ['male', 'female'];

const inputCls =
  'mt-1.5 w-full rounded-xl border-2 border-peach-line bg-paper px-3 py-2.5 text-sm font-medium focus:border-ink focus:outline-none';

export function StepParams({
  value,
  errors,
  onChange,
}: {
  value: ParamsState;
  errors: ParamsErrors;
  onChange: (patch: Partial<ParamsState>) => void;
}) {
  const { t } = useI18n();
  const msg = (code?: ErrorCode) => (code ? t.onboarding.errors[code] : undefined);
  return (
    <div>
      <h2 className="font-display text-2xl font-extrabold">{t.onboarding.paramsTitle}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Field label={t.onboarding.fields.age} error={msg(errors.age)}>
          <input
            type="number"
            inputMode="numeric"
            value={value.age}
            onChange={(e) => onChange({ age: e.target.value })}
            className={inputCls}
            aria-invalid={Boolean(errors.age)}
          />
        </Field>
        <Field label={t.onboarding.fields.weight} error={msg(errors.weightKg)}>
          <input
            type="number"
            inputMode="decimal"
            value={value.weightKg}
            onChange={(e) => onChange({ weightKg: e.target.value })}
            className={inputCls}
            aria-invalid={Boolean(errors.weightKg)}
          />
        </Field>
        <Field label={t.onboarding.fields.height} error={msg(errors.heightCm)}>
          <input
            type="number"
            inputMode="decimal"
            value={value.heightCm}
            onChange={(e) => onChange({ heightCm: e.target.value })}
            className={inputCls}
            aria-invalid={Boolean(errors.heightCm)}
          />
        </Field>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={t.onboarding.fields.sex} error={msg(errors.sex)}>
          <div className="mt-1.5 grid grid-cols-2 overflow-hidden rounded-xl border-2 border-ink">
            {SEXES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={value.sex === s}
                onClick={() => onChange({ sex: s })}
                className={`px-3 py-2.5 text-sm transition-colors ${
                  value.sex === s
                    ? 'bg-tomato font-bold text-white'
                    : 'bg-paper font-semibold text-latte hover:bg-cream'
                }`}
              >
                {t.sex[s]}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t.onboarding.fields.activity} error={msg(errors.activityLevel)}>
          <select
            value={value.activityLevel}
            onChange={(e) => onChange({ activityLevel: e.target.value as ActivityLevel })}
            className={inputCls}
            aria-invalid={Boolean(errors.activityLevel)}
          >
            <option value="" disabled>
              {t.onboarding.select}
            </option>
            {ACTIVITY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {t.activity[level]}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-bold">
      {label}
      {children}
      {error && (
        <span className="mt-1 block text-xs font-semibold text-tomato-deep">{error}</span>
      )}
    </label>
  );
}
