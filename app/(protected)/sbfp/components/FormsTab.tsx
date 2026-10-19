"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import {
  SBFP_FORMS,
  SBFP_WEIGHING_PERIODS,
  type SbfpFormKey,
  type SbfpWeighingPeriod,
} from "@/lib/constants/sbfp";
import {
  printSbfpForm1A,
  printSbfpForm1B,
  printSbfpForm2,
  printSbfpForm3,
  printSbfpForm4,
  printSbfpForm5Consolidated,
  printSbfpForm5Milk,
  printSbfpForm6,
  printSbfpMidlineList,
  type Form3Section,
  type SbfpHeaderInfo,
} from "@/lib/pdf/generateSbfpForms";
import {
  fetchBeneficiaryViews,
  fetchContacts,
  fetchDeliveries,
  fetchFeedingDays,
  fetchFeedingRecords,
} from "@/lib/sbfp/queries";
import { supabase } from "@/lib/supabase/client";
import { todayIso } from "@/lib/utils/schoolCalendar";
import {
  feedingAttendance,
  feedingDaysInMonth,
  schoolYearMonths,
  type FeedingAttendance,
  type SbfpBeneficiaryView,
} from "@/lib/utils/sbfp";
import { Loader2, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { buildSbfpHeaderInfo } from "./headerInfo";
import { sectionOptionLabel, type SbfpTabProps } from "./types";

const ALL = "__all__";
const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return MONTH_FMT.format(new Date(y, m - 1, 1));
};

interface Counts {
  total: number;
  primary: number;
  secondary: number;
  feedingDays: number;
}

export function FormsTab({
  schoolId,
  schoolYear,
  program,
  sections,
  ownRecordsOnly,
}: SbfpTabProps) {
  const { settings } = useSchoolSettings(true, schoolId);
  const [busy, setBusy] = useState<SbfpFormKey | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [form2Period, setForm2Period] = useState<SbfpWeighingPeriod>("baseline");
  const months = useMemo(() => schoolYearMonths(schoolYear), [schoolYear]);
  const [form3Month, setForm3Month] = useState(() => {
    const now = todayIso().slice(0, 7);
    return months.includes(now) ? now : months[0];
  });
  const [form3Section, setForm3Section] = useState(ALL);

  useEffect(() => {
    if (!program) return;
    let isMounted = true;
    (async () => {
      const [rows, days] = await Promise.all([
        fetchBeneficiaryViews(program),
        fetchFeedingDays(program.id),
      ]);
      if (!isMounted) return;
      setCounts({
        total: rows.length,
        primary: rows.filter((r) => r.classification === "primary").length,
        secondary: rows.filter((r) => r.classification === "secondary").length,
        feedingDays: days.length,
      });
    })().catch((err) => console.error("Error loading SBFP counts:", err));
    return () => {
      isMounted = false;
    };
  }, [program]);

  if (!program) return null;

  const headerInfo = () => buildSbfpHeaderInfo(program, schoolId, schoolYear, settings);

  /** Attendance over the feeding days, or only those on or before `through`. */
  const attendanceFor = async (
    rows: SbfpBeneficiaryView[],
    through?: string | null,
  ): Promise<Map<string, FeedingAttendance>> => {
    const [allDays, records] = await Promise.all([
      fetchFeedingDays(program.id),
      fetchFeedingRecords(rows.map((r) => r.id)),
    ]);
    const days = through ? allDays.filter((d) => d <= through) : allDays;
    return new Map(
      rows.map((r) => [r.id, feedingAttendance(records.get(r.id) ?? new Map(), days)]),
    );
  };

  const printForm3 = async (info: SbfpHeaderInfo) => {
    const chosen = form3Section === ALL ? sections : sections.filter((s) => s.id === form3Section);
    const rows = await fetchBeneficiaryViews(program);
    const days = feedingDaysInMonth(await fetchFeedingDays(program.id), form3Month);
    const [y, m] = form3Month.split("-").map(Number);
    const last = String(new Date(y, m, 0).getDate()).padStart(2, "0");
    const codes = await fetchFeedingRecords(
      rows.map((r) => r.id),
      { from: `${form3Month}-01`, to: `${form3Month}-${last}` },
    );

    const adviserIds = [
      ...new Set(chosen.map((s) => s.section_adviser_id).filter((id): id is string => !!id)),
    ];
    const adviserName = new Map<string, string>();
    if (adviserIds.length > 0) {
      const { data } = await supabase
        .from("sms_users")
        .select("id, name")
        .in("id", adviserIds.map(Number));
      for (const u of data ?? []) adviserName.set(String(u.id), String(u.name ?? ""));
    }

    const sheets: Form3Section[] = chosen
      .map((s) => ({
        gradeLevel: s.grade_level,
        sectionName: s.name,
        adviserName: s.section_adviser_id ? adviserName.get(s.section_adviser_id) ?? "" : "",
        rows: rows.filter((r) => r.section_id === s.id),
      }))
      // "All sections" prints only the sections that feed someone.
      .filter((s) => form3Section !== ALL || s.rows.length > 0);

    if (sheets.length === 0) {
      toast.error("No beneficiaries in the chosen section(s)");
      return;
    }
    if (days.length === 0) {
      toast("No feeding days in this month — the day columns print blank");
    }
    printSbfpForm3(info, sheets, form3Month, days, codes);
  };

  const handlePrint = async (key: SbfpFormKey) => {
    setBusy(key);
    try {
      const info = await headerInfo();
      switch (key) {
        case "1A":
          printSbfpForm1A(info, await fetchBeneficiaryViews(program));
          break;
        case "1M": {
          const rows = await fetchBeneficiaryViews(program);
          printSbfpMidlineList(
            info,
            rows,
            await attendanceFor(rows, program.midline_weighing_date),
          );
          break;
        }
        case "1B": {
          const rows = await fetchBeneficiaryViews(program);
          printSbfpForm1B(info, rows, await attendanceFor(rows));
          break;
        }
        case "2":
          printSbfpForm2(info, await fetchBeneficiaryViews(program), form2Period);
          break;
        case "3":
          await printForm3(info);
          break;
        case "4":
          printSbfpForm4(info, await fetchContacts(program.id));
          break;
        case "5":
          printSbfpForm5Milk(info, await fetchBeneficiaryViews(program));
          break;
        case "5C": {
          const rows = await fetchBeneficiaryViews(program);
          printSbfpForm5Consolidated(info, rows, await attendanceFor(rows));
          break;
        }
        case "6": {
          const [rows, deliveries] = await Promise.all([
            fetchBeneficiaryViews(program),
            fetchDeliveries(program.id),
          ]);
          printSbfpForm6(info, rows, deliveries);
          break;
        }
      }
    } catch (err) {
      console.error(`Error printing SBFP Form ${key}:`, err);
      toast.error("Failed to generate the form");
    } finally {
      setBusy(null);
    }
  };

  const options = (key: SbfpFormKey) => {
    if (key === "2") {
      return (
        <Select
          value={form2Period}
          onValueChange={(v) => setForm2Period(v as SbfpWeighingPeriod)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SBFP_WEIGHING_PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.form2Caption} of feeding ({p.label.toLowerCase()})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (key === "3") {
      return (
        <div className="flex flex-wrap gap-2">
          <Select value={form3Month} onValueChange={setForm3Month}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {monthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={form3Section} onValueChange={setForm3Section}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sections</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {sectionOptionLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {ownRecordsOnly && (
        <p className="text-sm text-muted-foreground">
          These forms list only the learners you encoded. The school head, admin,
          school nurse or focal person prints the whole school&apos;s forms.
        </p>
      )}
      {counts && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Beneficiaries", value: counts.total },
            { label: "Primary", value: counts.primary },
            { label: "Secondary", value: counts.secondary },
            { label: "Feeding days", value: counts.feedingDays },
          ].map((c) => (
            <Card key={c.label}>
              <CardContent className="py-4">
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="text-2xl font-semibold tabular-nums">{c.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {SBFP_FORMS.map((f) => (
          <Card key={f.key}>
            <CardHeader>
              <CardTitle className="text-base">
                {f.code} — {f.title}
              </CardTitle>
              <CardDescription>{f.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              {options(f.key)}
              <Button onClick={() => handlePrint(f.key)} disabled={busy !== null}>
                {busy === f.key ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4 mr-2" />
                )}
                Print
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
