'use client';

import type { ActivityLevel, Sex } from '@/lib/schemas';

export interface ParamsState {
  age: string;
  weightKg: string;
  heightCm: string;
  sex: Sex | null;
  activityLevel: ActivityLevel | '';
}

export interface ParamsErrors {
  age?: string;
  weightKg?: string;
  heightCm?: string;
  sex?: string;
  activityLevel?: string;
}

export function validateParams(p: ParamsState): ParamsErrors {
  const errors: ParamsErrors = {};
  const age = Number(p.age);
  if (!p.age || !Number.isInteger(age) || age < 10 || age > 100) {
    errors.age = 'Whole number between 10 and 100';
  }
  const weight = Number(p.weightKg);
  if (!p.weightKg || Number.isNaN(weight) || weight < 30 || weight > 300) {
    errors.weightKg = 'Between 30 and 300 kg';
  }
  const height = Number(p.heightCm);
  if (!p.heightCm || Number.isNaN(height) || height < 100 || height > 250) {
    errors.heightCm = 'Between 100 and 250 cm';
  }
  if (!p.sex) errors.sex = 'Required';
  if (!p.activityLevel) errors.activityLevel = 'Required';
  return errors;
}

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary (little exercise)' },
  { value: 'light', label: 'Light (1–3 workouts/week)' },
  { value: 'moderate', label: 'Moderate (3–5 workouts/week)' },
  { value: 'active', label: 'Active (6–7 workouts/week)' },
];

const inputCls =
  'mt-1.5 w-full rounded-xl border-2 border-peach-line bg-white px-3 py-2.5 text-sm font-medium focus:border-ink focus:outline-none';

export function StepParams({
  value,
  errors,
  onChange,
}: {
  value: ParamsState;
  errors: ParamsErrors;
  onChange: (patch: Partial<ParamsState>) => void;
}) {
  return (
    <div>
      <h2 className="font-display text-2xl font-extrabold">Tell us about yourself</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Field label="Age" error={errors.age}>
          <input
            type="number"
            inputMode="numeric"
            value={value.age}
            onChange={(e) => onChange({ age: e.target.value })}
            className={inputCls}
            aria-invalid={Boolean(errors.age)}
          />
        </Field>
        <Field label="Weight (kg)" error={errors.weightKg}>
          <input
            type="number"
            inputMode="decimal"
            value={value.weightKg}
            onChange={(e) => onChange({ weightKg: e.target.value })}
            className={inputCls}
            aria-invalid={Boolean(errors.weightKg)}
          />
        </Field>
        <Field label="Height (cm)" error={errors.heightCm}>
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
        <Field label="Sex" error={errors.sex}>
          <div className="mt-1.5 grid grid-cols-2 overflow-hidden rounded-xl border-2 border-ink">
            {(['male', 'female'] as Sex[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={value.sex === s}
                onClick={() => onChange({ sex: s })}
                className={`px-3 py-2.5 text-sm capitalize transition-colors ${
                  value.sex === s
                    ? 'bg-tomato font-bold text-white'
                    : 'bg-white font-semibold text-latte hover:bg-cream'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Activity level" error={errors.activityLevel}>
          <select
            value={value.activityLevel}
            onChange={(e) => onChange({ activityLevel: e.target.value as ActivityLevel })}
            className={inputCls}
            aria-invalid={Boolean(errors.activityLevel)}
          >
            <option value="" disabled>
              Select…
            </option>
            {ACTIVITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
