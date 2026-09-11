'use client';

import Link from 'next/link';
import { TodayCard } from '@/components/dashboard/TodayCard';
import { WeekStrip } from '@/components/dashboard/WeekStrip';
import { Skeleton } from '@/components/ui/Skeleton';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { useProgress } from '@/hooks/useProgress';
import { addDays, dateKey, planStart } from '@/lib/dates';
import { profileSlots } from '@/lib/profile';
import { daySlots } from '@/lib/schemas';

export default function TodayPage() {
  const { t } = useI18n();
  const { profile, plan } = useSession();
  const { byDate, extrasByDate, loading, toggle, addExtra, removeExtra, estimateExtra } = useProgress();

  // Layout guards guarantee a profile before this renders.
  if (!profile) return null;

  const now = new Date();
  const todayKey = dateKey(now);
  // days[i] falls on planStart + i; today may be outside the plan's window.
  const todayPlan = plan?.days.find(
    (_, i) => dateKey(addDays(planStart(plan), i)) === todayKey
  );
  // The strip counts the slots the plan actually uses, not a fixed three.
  const slotCount = todayPlan ? daySlots(todayPlan).length : profileSlots(profile).length;

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-extrabold">{t.today.title}</h1>
        <p className="mt-0.5 text-sm font-semibold text-latte">
          {now.toLocaleDateString(t.intl, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <section className="rounded-3xl border-2 border-ink bg-paper p-4 sm:p-5">
            <h2 className="text-[11px] font-bold tracking-widest text-latte">{t.today.thisWeek}</h2>
            <div className="mt-3">
              <WeekStrip byDate={byDate} todayKey={todayKey} slotCount={slotCount} />
            </div>
          </section>

          {todayPlan ? (
            <TodayCard
              day={todayPlan}
              target={profile.calorieTarget}
              eaten={byDate[todayKey] ?? []}
              extras={extrasByDate[todayKey] ?? []}
              onToggle={(slot, eaten) => toggle(todayKey, slot, eaten)}
              onAddExtra={(input) => addExtra(todayKey, input)}
              onRemoveExtra={(id) => removeExtra(todayKey, id)}
              onEstimateExtra={estimateExtra}
            />
          ) : (
            <div className="rounded-3xl border-2 border-dashed border-sand py-16 text-center">
              <p className="text-3xl" aria-hidden="true">
                🍽️
              </p>
              <p className="mt-3 font-display text-lg font-extrabold">{t.today.noPlan}</p>
              <p className="mt-1 text-sm text-latte">{t.today.noPlanText}</p>
              <Link
                href="/dashboard/plan"
                className="mt-4 inline-block rounded-full bg-tomato px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_var(--color-tomato-deep)] hover:bg-tomato-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
              >
                {t.today.goToPlan}
              </Link>
            </div>
          )}
        </>
      )}
    </>
  );
}
