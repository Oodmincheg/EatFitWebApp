'use client';

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

          {/* Rendered with `day` null outside the plan's window too: extras are
              logged against the date, so they must stay reachable without a plan. */}
          <TodayCard
            day={todayPlan ?? null}
            target={profile.calorieTarget}
            eaten={byDate[todayKey] ?? []}
            extras={extrasByDate[todayKey] ?? []}
            onToggle={(slot, eaten) => toggle(todayKey, slot, eaten)}
            onAddExtra={(input) => addExtra(todayKey, input)}
            onRemoveExtra={(id) => removeExtra(todayKey, id)}
            onEstimateExtra={estimateExtra}
          />
        </>
      )}
    </>
  );
}
