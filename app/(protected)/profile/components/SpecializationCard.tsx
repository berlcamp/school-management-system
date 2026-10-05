"use client";

/**
 * The three-part specialization (migration 198), kept by the employee:
 * (1) undergraduate major, (2) graduate major, (3) specialization at DepEd —
 * the last being 146's `learning_area`, so the Teaching Specialization report
 * reads it unchanged. Its own form and Save so it can be updated from the
 * announcement link without touching My Details.
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GRADUATE_MAJORS,
  LEARNING_AREAS,
  MajorOption,
  OTHER_CODE,
  OTHER_TEXT_MAX,
  UNDERGRAD_MAJORS,
  decodeMajor,
  encodeMajor,
  majorGroups,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { GraduationCap, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface MajorState {
  code: string;
  otherText: string;
}

const EMPTY: MajorState = { code: "", otherText: "" };

const toState = (value: string | null): MajorState => {
  const { code, otherText } = decodeMajor(value);
  return { code: code ?? "", otherText };
};

function MajorSelect({
  id,
  label,
  hint,
  list,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  list: readonly MajorOption[];
  value: MajorState;
  onChange: (next: MajorState) => void;
  disabled: boolean;
}) {
  const known = !value.code || list.some((m) => m.code === value.code);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value.code}
        onValueChange={(code) => onChange({ code, otherText: value.otherText })}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {majorGroups(list).map((group) => (
            <SelectGroup key={group}>
              <SelectLabel>{group}</SelectLabel>
              {list
                .filter((m) => m.group === group)
                .map((m) => (
                  <SelectItem key={m.code} value={m.code}>
                    {m.label}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
          {!known && (
            <SelectItem value={value.code}>{value.code} (current)</SelectItem>
          )}
        </SelectContent>
      </Select>
      {value.code === OTHER_CODE && (
        <Input
          aria-label={`${label} — specify`}
          placeholder="Type your major"
          maxLength={OTHER_TEXT_MAX}
          value={value.otherText}
          onChange={(e) => onChange({ code: OTHER_CODE, otherText: e.target.value })}
          disabled={disabled}
        />
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function SpecializationCard({ userId }: { userId: number }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [undergrad, setUndergrad] = useState<MajorState>(EMPTY);
  const [graduate, setGraduate] = useState<MajorState>(EMPTY);
  const [learningArea, setLearningArea] = useState("");
  const [saved, setSaved] = useState("");

  const snapshot = (u: MajorState, g: MajorState, l: string) =>
    JSON.stringify([u, g, l]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sms_users")
      .select("undergrad_major, graduate_major, learning_area")
      .eq("id", userId)
      .single();
    setLoading(false);
    if (error || !data) {
      toast.error("Failed to load your specialization.");
      return;
    }
    const u = toState(data.undergrad_major as string | null);
    const g = toState(data.graduate_major as string | null);
    const l = (data.learning_area as string | null) ?? "";
    setUndergrad(u);
    setGraduate(g);
    setLearningArea(l);
    setSaved(snapshot(u, g, l));
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await load();
    })();
    return () => {
      isMounted = false;
    };
  }, [load]);

  // Arriving from an announcement link: bring the card into view once loaded.
  useEffect(() => {
    if (!loading && window.location.hash === "#specialization") {
      document.getElementById("specialization")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loading]);

  const dirty = snapshot(undergrad, graduate, learningArea) !== saved;

  const onSave = async () => {
    if (saving) return;
    for (const [state, name] of [
      [undergrad, "undergraduate major"],
      [graduate, "graduate major"],
    ] as const) {
      if (state.code === OTHER_CODE && !state.otherText.trim()) {
        toast.error(`Type your ${name}, or pick it from the list.`);
        return;
      }
    }
    setSaving(true);
    const { error } = await supabase
      .from("sms_users")
      .update({
        undergrad_major: encodeMajor(undergrad.code, undergrad.otherText),
        graduate_major: encodeMajor(graduate.code, graduate.otherText),
        learning_area: learningArea || null,
      })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      toast.error("Failed to save your specialization.");
      return;
    }
    setSaved(snapshot(undergrad, graduate, learningArea));
    toast.success("Specialization updated.");
  };

  return (
    <Card id="specialization" className="scroll-mt-20">
      <CardHeader className="border-b">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="h-4 w-4" /> Specialization
        </CardTitle>
        <CardDescription>
          Reported to the Schools Division Office. Pick &ldquo;General&rdquo; if
          your major was general education, or &ldquo;Other&rdquo; to type it.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-5">
            <MajorSelect
              id="undergrad-major"
              label="1. Major in college (undergraduate)"
              hint="Your bachelor's degree major."
              list={UNDERGRAD_MAJORS}
              value={undergrad}
              onChange={setUndergrad}
              disabled={saving}
            />
            <MajorSelect
              id="graduate-major"
              label="2. Major in graduate school"
              hint="Master's or doctorate major. Pick “None” if you have not enrolled in one."
              list={GRADUATE_MAJORS}
              value={graduate}
              onChange={setGraduate}
              disabled={saving}
            />
            <div className="space-y-1.5">
              <Label htmlFor="work-specialization">
                3. Specialization at DepEd
              </Label>
              <Select
                value={learningArea}
                onValueChange={setLearningArea}
                disabled={saving}
              >
                <SelectTrigger id="work-specialization" className="w-full">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {LEARNING_AREAS.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The learning area you mainly teach or handle in your current
                post.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={onSave} disabled={saving || !dirty}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Save Specialization
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={saving || !dirty}
                onClick={() => load()}
              >
                Discard
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
