"use client";

import {
  attendancePercent,
  formatCount,
  formatRate,
  openConcerns,
  rehabilitationPercent,
  type SbfpOverviewTotals,
} from "@/lib/utils/sbfpOverview";
import { HeartPulse, MessageSquareWarning, School, UsersRound, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Tile {
  label: string;
  value: string;
  caption: string;
  icon: LucideIcon;
}

/** The dashboard's headline numbers: one figure each, the context beneath it. */
export function OverviewTiles({ totals }: { totals: SbfpOverviewTotals }) {
  const attendance = attendancePercent(totals);
  const rehab = rehabilitationPercent(totals);
  const concerns = openConcerns(totals);

  const tiles: Tile[] = [
    {
      label: "Schools feeding",
      value: formatCount(totals.schoolsFeeding),
      caption: `of ${formatCount(totals.schools)} schools · ${formatCount(totals.schoolsWithProgram)} opened a programme`,
      icon: School,
    },
    {
      label: "Beneficiaries",
      value: formatCount(totals.beneficiaries),
      caption: `${formatCount(totals.male)} male · ${formatCount(totals.female)} female · ${formatCount(totals.primary_count)} primary`,
      icon: UsersRound,
    },
    {
      label: "Feeding attendance",
      value: formatRate(attendance),
      caption:
        totals.feeding_days === 0
          ? "No feeding day recorded yet"
          : `${formatCount(totals.days_present)} meals served of ${formatCount(totals.expectedFeedings)} expected`,
      icon: UtensilsCrossed,
    },
    {
      label: "Rehabilitated",
      value: formatRate(rehab),
      caption:
        totals.wasted_at_baseline === 0
          ? "No wasted learner at baseline"
          : `${formatCount(totals.rehabilitated)} of ${formatCount(totals.wasted_at_baseline)} wasted at baseline reached normal`,
      icon: HeartPulse,
    },
    {
      label: "Open concerns",
      value: formatCount(concerns),
      caption: `${formatCount(totals.feedback_in_progress)} in progress · ${formatCount(totals.feedback_resolved)} resolved`,
      icon: MessageSquareWarning,
    },
  ];

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {tiles.map(({ label, value, caption, icon: Icon }) => (
        <li key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <Icon className="h-4 w-4 text-sky-700" aria-hidden="true" />
            {label}
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{caption}</p>
        </li>
      ))}
    </ul>
  );
}

function StatList({ items }: { items: { label: string; value: number }[] }) {
  return (
    <dl className="mt-4 divide-y divide-slate-100">
      {items.map((i) => (
        <div key={i.label} className="flex items-baseline justify-between gap-3 py-2.5">
          <dt className="text-sm text-slate-600">{i.label}</dt>
          <dd className="text-sm font-semibold tabular-nums text-slate-900">{formatCount(i.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Deliveries, hot meals, the four monitoring tools and the feedback log. */
export function ProgramActivity({ totals }: { totals: SbfpOverviewTotals }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section aria-labelledby="deliveries-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="deliveries-heading" className="text-base font-semibold text-slate-900">
          Deliveries
        </h2>
        <p className="mt-1 text-sm text-slate-600">Food and milk packs received by the schools.</p>
        <StatList
          items={[
            { label: "Deliveries logged", value: totals.deliveries },
            { label: "Packs received (new)", value: totals.packs_new },
            { label: "Replacement packs", value: totals.packs_replacement },
            { label: "Packs rejected", value: totals.packs_rejected },
            { label: "Milk participants", value: totals.milk_participants },
          ]}
        />
      </section>
      <section aria-labelledby="hot-meals-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="hot-meals-heading" className="text-base font-semibold text-slate-900">
          Hot meals
        </h2>
        <p className="mt-1 text-sm text-slate-600">Servings delivered from the central kitchens.</p>
        <StatList
          items={[
            { label: "Hot meal deliveries", value: totals.hot_meal_deliveries },
            { label: "Servings (new)", value: totals.servings_new },
            { label: "Replacement servings", value: totals.servings_replacement },
            { label: "Servings rejected", value: totals.servings_rejected },
          ]}
        />
      </section>
      <section aria-labelledby="monitoring-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="monitoring-heading" className="text-base font-semibold text-slate-900">
          Monitoring &amp; feedback
        </h2>
        <p className="mt-1 text-sm text-slate-600">Daily tools filed and concerns raised.</p>
        <StatList
          items={[
            { label: "Kitchen logs", value: totals.kitchen_logs },
            { label: "Food dispatch logs", value: totals.dispatch_logs },
            { label: "Receiving & feeding logs", value: totals.receiving_logs },
            { label: "Meal quality evaluations", value: totals.quality_evaluations },
            {
              label: "Concerns raised",
              value: totals.feedback_open + totals.feedback_in_progress + totals.feedback_resolved,
            },
          ]}
        />
      </section>
    </div>
  );
}
