"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { aralProgramLabel, getGradeLevelLabel } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import type { AralProgram } from "@/types";
import { Loader2, Sprout, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AddTutorModal } from "./components/AddTutorModal";

interface TutorRow {
  id: string;
  program: AralProgram;
  gradeLevel: number;
  name: string;
  email: string;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();
  const canManage = ["school_head", "admin", "super admin"].includes(
    user?.type ?? "",
  );
  const schoolId = user?.school_id ?? null;

  const [rows, setRows] = useState<TutorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (user && !canManage) router.replace("/aral");
  }, [user, canManage, router]);

  const load = useCallback(async () => {
    if (schoolId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data: tutors, error } = await supabase
        .from("sms_aral_tutors")
        .select("id, user_id, program, grade_level")
        .eq("school_id", Number(schoolId))
        .order("id", { ascending: false });
      if (error) throw new Error(error.message);
      const list = tutors || [];

      const userIds = [...new Set(list.map((t) => t.user_id))];

      const usersById = new Map<string, { name: string; email: string }>();
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("sms_users")
          .select("id, name, email")
          .in("id", userIds);
        (users || []).forEach((u) =>
          usersById.set(String(u.id), {
            name: u.name as string,
            email: u.email as string,
          }),
        );
      }

      setRows(
        list.map((t) => {
          const u = usersById.get(String(t.user_id));
          return {
            id: String(t.id),
            program: t.program as AralProgram,
            gradeLevel: t.grade_level as number,
            name: u?.name ?? `#${t.user_id}`,
            email: u?.email ?? "",
          };
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load tutors.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  const removeTutor = async (id: string) => {
    if (!window.confirm("Remove this tutor assignment?")) return;
    try {
      const { error } = await supabase
        .from("sms_aral_tutors")
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Tutor removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove.");
    }
  };

  if (!canManage) return null;

  return (
    <div>
      <div className="app__title">
        <Link
          href="/aral"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← ARAL
        </Link>
        <h1 className="app__title_text flex items-center gap-2">
          <Sprout className="h-5 w-5" />
          ARAL Tutors
        </h1>
        <p className="text-sm text-muted-foreground">
          Tutors sign in with their email (Google) and view the learners
          assigned to them on the program roster.
        </p>
      </div>

      <div className="app__content space-y-4">
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => setModalOpen(true)}
            disabled={schoolId == null}
          >
            <UserPlus className="h-4 w-4 mr-1" /> Add Tutor
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            {schoolId == null ? (
              <p className="py-8 text-center text-muted-foreground">
                Select a school to manage tutors.
              </p>
            ) : loading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No tutors yet. Add one to start assigning learners.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-sm border-collapse min-w-full">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="border px-3 py-2 text-left">Name</th>
                      <th className="border px-3 py-2 text-left">Email</th>
                      <th className="border px-3 py-2 text-left">Program</th>
                      <th className="border px-3 py-2 text-left">Grade Level</th>
                      <th className="border px-2 py-2 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="border px-3 py-1.5">{r.name}</td>
                        <td className="border px-3 py-1.5 text-muted-foreground">
                          {r.email}
                        </td>
                        <td className="border px-3 py-1.5">
                          {aralProgramLabel(r.program)}
                        </td>
                        <td className="border px-3 py-1.5">
                          {getGradeLevelLabel(r.gradeLevel)}
                        </td>
                        <td className="border px-2 py-1.5 text-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-600 hover:text-red-700"
                            onClick={() => removeTutor(r.id)}
                            aria-label="Remove tutor"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {schoolId != null && (
        <AddTutorModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          schoolId={schoolId}
          onSaved={load}
        />
      )}
    </div>
  );
}
