'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { WeekView } from '@/components/dashboard/WeekView';
import { Skeleton } from '@/components/ui/Skeleton';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { eatenByDayName, formatDateTime, planRange } from '@/lib/dates';
import type { DayProgress, MealPlan, MealSlot } from '@/lib/schemas';

export default function HistoryPage() {
  const { t } = useI18n();
  const { profile } = useSession();
  const [plans, setPlans] = useState<MealPlan[] | null>(null);
  const [eatenByDate, setEatenByDate] = useState<Record<string, MealSlot[]>>({});
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/plans');
        if (cancelled || !res.ok) return;
        const data: { plans: MealPlan[] } = await res.json();
        if (cancelled) return;
        setPlans(data.plans);
        if (data.plans.length === 0) return;

        // One progress fetch spanning every plan's 7-day window.
        const ranges = data.plans.map(planRange);
        const from = ranges.map((r) => r.from).sort()[0];
        const to = ranges.map((r) => r.to).sort().at(-1)!;
        const progRes = await fetch(`/api/progress?from=${from}&to=${to}`);
        if (cancelled || !progRes.ok) return;
        const prog: { days: DayProgress[] } = await progRes.json();
        if (!cancelled) {
          setEatenByDate(Object.fromEntries(prog.days.map((d) => [d.date, d.eaten])));
        }
      } catch {
        if (!cancelled) setPlans((prev) => prev ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!profile) return null;

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-extrabold">{t.history.title}</h1>
        <p className="mt-0.5 text-sm font-semibold text-latte">{t.history.subtitle}</p>
      </div>

      {plans === null ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-sand py-16 text-center">
          <p className="text-3xl" aria-hidden="true">
            🗂️
          </p>
          <p className="mt-3 font-display text-lg font-extrabold">{t.history.empty}</p>
          <p className="mt-1 text-sm text-latte">
            <Link
              href="/dashboard/plan"
              className="font-bold text-tomato underline-offset-2 hover:underline"
            >
              {t.history.emptyLink}
            </Link>
            {t.history.emptyText}
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {plans.map((plan, idx) => {
            const avgKcal = Math.round(
              plan.days.reduce((sum, d) => sum + d.total_kcal, 0) / plan.days.length
            );
            const eatenByDay = eatenByDayName(plan, eatenByDate);
            const eatenCount = Object.values(eatenByDay).reduce(
              (sum, slots) => sum + slots.length,
              0
            );
            const expanded = expandedIdx === idx;
            return (
              <li key={plan.generatedAt} className="rounded-3xl border-2 border-ink bg-white">
                <button
                  onClick={() => setExpandedIdx(expanded ? null : idx)}
                  aria-expanded={expanded}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl px-5 py-4 text-left hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-display text-[15px] font-extrabold">
                        {t.history.weekOf(formatDateTime(plan.generatedAt, t.intl))}
                      </span>
                      {idx === 0 && (
                        <span className="rounded-full bg-mint px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-lime-deep">
                          {t.history.current}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-latte">
                      {t.history.avg(
                        avgKcal.toLocaleString(t.intl),
                        profile.calorieTarget.toLocaleString(t.intl)
                      )}
                      <span className={eatenCount > 0 ? 'text-lime-deep' : undefined}>
                        {t.history.eaten(eatenCount)}
                      </span>
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-sm font-bold text-latte">
                    {expanded ? t.history.hide : t.history.view}
                  </span>
                </button>
                {expanded && (
                  <div className="border-t-2 border-peach-line p-4">
                    <WeekView
                      plan={plan}
                      target={profile.calorieTarget}
                      eatenByDay={eatenByDay}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
