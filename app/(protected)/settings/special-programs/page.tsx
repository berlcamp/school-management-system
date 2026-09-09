"use client";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  specializationLabel,
  type SpecialProgram,
  type SpecialProgramSpecialization,
} from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { ArrowLeft, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { SpecialProgramModal } from "./components/SpecialProgramModal";
import { SpecializationModal } from "./components/SpecializationModal";

/**
 * Special Programs settings (migration 179).
 *
 * ONE PAGE FOR BOTH SCOPES, exactly as School Calendar does it: a school-level
 * user manages their own programs here, and the division office reaches the
 * same page from Division Office → Special Programs to maintain the shared
 * national list (rows with a NULL school_id, usable by every school).
 *
 * The scope rule is not enforced here — the RLS policies are (migration 179,
 * following 125). A school-level role cannot match a NULL-school_id row in any
 * write policy, so the buttons this page hides are refused by the database as
 * well. The anon key ships in the browser bundle; a hidden button is not a
 * permission (the 161 lesson).
 */
export default function SpecialProgramsSettingsPage() {
  const user = useAppSelector((state) => state.user.user);
  const userType = user?.type;
  const schoolId = user?.school_id != null ? String(user.school_id) : null;

  const canManageDivision =
    userType === "division_admin" ||
    userType === "division_type" ||
    userType === "super admin";

  const [programs, setPrograms] = useState<SpecialProgram[]>([]);
  const [specializations, setSpecializations] = useState<
    SpecialProgramSpecialization[]
  >([]);
  const [loading, setLoading] = useState(true);

  const [programModal, setProgramModal] = useState<{
    open: boolean;
    editData?: SpecialProgram | null;
    scopeSchoolId: string | null;
  }>({ open: false, scopeSchoolId: null });

  const [strandModal, setStrandModal] = useState<{
    open: boolean;
    program: SpecialProgram | null;
    editData?: SpecialProgramSpecialization | null;
  }>({ open: false, program: null });

  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "program"; row: SpecialProgram }
    | { kind: "strand"; row: SpecialProgramSpecialization }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    // Division rows are readable by everybody by design; a school-level user
    // additionally sees their own. The filter mirrors the calendar page.
    let query = supabase
      .from("sms_special_programs")
      .select("*")
      .order("name");
    query =
      schoolId == null
        ? query.is("school_id", null)
        : query.or(`school_id.is.null,school_id.eq.${Number(schoolId)}`);

    const [{ data: programData, error }, { data: strandData }] =
      await Promise.all([
        query,
        supabase
          .from("sms_special_program_specializations")
          .select("*")
          .order("name"),
      ]);

    if (!isMounted.current) return;

    if (error) {
      console.error("Failed to load special programs:", error);
      toast.error("Failed to load special programs.");
      setPrograms([]);
    } else {
      setPrograms((programData ?? []) as SpecialProgram[]);
    }
    setSpecializations((strandData ?? []) as SpecialProgramSpecialization[]);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /** A school-level user may edit their own rows; division users edit theirs. */
  const canEdit = (program: SpecialProgram): boolean =>
    program.school_id == null
      ? canManageDivision
      : schoolId != null && String(program.school_id) === schoolId;

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const { error } =
        pendingDelete.kind === "program"
          ? await supabase
              .from("sms_special_programs")
              .delete()
              .eq("id", pendingDelete.row.id)
          : await supabase
              .from("sms_special_program_specializations")
              .delete()
              .eq("id", pendingDelete.row.id);

      if (error) throw error;
      toast.success("Deleted.");
      setPendingDelete(null);
      fetchAll();
    } catch (err) {
      console.error("Delete special program:", err);
      // The FKs are ON DELETE RESTRICT (migration 179): a program a subject or
      // a learner still points at cannot be deleted, and should not be.
      toast.error(
        "Could not delete — subjects or learners still reference it. Mark it inactive instead.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const strandsFor = (programId: string) =>
    specializations.filter(
      (s) => String(s.special_program_id) === String(programId),
    );

  const divisionPrograms = programs.filter((p) => p.school_id == null);
  const schoolPrograms = programs.filter((p) => p.school_id != null);

  const renderProgram = (program: SpecialProgram) => {
    const strands = strandsFor(program.id);
    const editable = canEdit(program);
    const label = specializationLabel(program);

    return (
      <div key={program.id} className="rounded-lg border">
        <div className="flex items-start justify-between gap-3 border-b bg-muted/40 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground ring-1 ring-border">
                {program.code}
              </span>
              <span className="font-medium">{program.name}</span>
              {program.school_id == null && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800">
                  Division-wide
                </span>
              )}
              {!program.is_active && (
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                  Inactive
                </span>
              )}
            </div>
            {program.description && (
              <p className="mt-1 text-xs text-muted-foreground">
                {program.description}
              </p>
            )}
          </div>
          {editable && (
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() =>
                  setProgramModal({
                    open: true,
                    editData: program,
                    scopeSchoolId:
                      program.school_id == null
                        ? null
                        : String(program.school_id),
                  })
                }
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-destructive"
                onClick={() => setPendingDelete({ kind: "program", row: program })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
            {editable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-emerald-700 hover:bg-emerald-50"
                onClick={() =>
                  setStrandModal({ open: true, program, editData: null })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add {label.toLowerCase()}
              </Button>
            )}
          </div>

          {strands.length === 0 ? (
            /* Not an error state: STE and SPJ genuinely have no second level,
               and a subject tags to the program as a whole. */
            <p className="text-xs text-muted-foreground">
              None defined. Subjects tag to the whole program.
            </p>
          ) : (
            <div className="divide-y">
              {strands.map((strand) => (
                <div
                  key={strand.id}
                  className="flex items-center justify-between gap-2 py-1.5"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {strand.code}
                    </span>
                    {strand.name}
                    {!strand.is_active && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] text-gray-700">
                        Inactive
                      </span>
                    )}
                  </span>
                  {editable && (
                    <span className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6"
                        onClick={() =>
                          setStrandModal({
                            open: true,
                            program,
                            editData: strand,
                          })
                        }
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-destructive"
                        onClick={() =>
                          setPendingDelete({ kind: "strand", row: strand })
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="app__main">
      <div className="mb-4">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to School Settings
        </Link>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <CardTitle className="text-base">Special Programs</CardTitle>
          </div>
          <CardDescription>
            Special curricular programs (SPA, SPS, SPFL, …) and the strands
            beneath them. Tag a subject to one from Subjects &rarr; Special
            Program. A learner&apos;s membership is separate, and is set from
            the section.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Division-wide</h3>
                    <p className="text-xs text-muted-foreground">
                      Maintained by the division office and available to every
                      school.
                    </p>
                  </div>
                  {canManageDivision && (
                    <Button
                      size="sm"
                      onClick={() =>
                        setProgramModal({
                          open: true,
                          editData: null,
                          scopeSchoolId: null,
                        })
                      }
                    >
                      <Plus className="h-4 w-4" />
                      Add division program
                    </Button>
                  )}
                </div>
                {divisionPrograms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    None yet.
                    {canManageDivision
                      ? " Add the national programs the division runs."
                      : " The division office has not added any."}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {divisionPrograms.map(renderProgram)}
                  </div>
                )}
              </section>

              {schoolId != null && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">This school</h3>
                      <p className="text-xs text-muted-foreground">
                        Programs this school runs on its own.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        setProgramModal({
                          open: true,
                          editData: null,
                          scopeSchoolId: schoolId,
                        })
                      }
                    >
                      <Plus className="h-4 w-4" />
                      Add program
                    </Button>
                  </div>
                  {schoolPrograms.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {schoolPrograms.map(renderProgram)}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <SpecialProgramModal
        isOpen={programModal.open}
        onClose={() => setProgramModal({ open: false, scopeSchoolId: null })}
        editData={programModal.editData}
        scopeSchoolId={programModal.scopeSchoolId}
        onSaved={fetchAll}
      />

      <SpecializationModal
        isOpen={strandModal.open}
        onClose={() => setStrandModal({ open: false, program: null })}
        program={strandModal.program}
        editData={strandModal.editData}
        onSaved={fetchAll}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete this entry?"
        description={
          pendingDelete?.kind === "program"
            ? "Subjects and learners already tagged to it will block the delete. Marking it inactive retires it without disturbing anything."
            : "Subjects and learners already tagged to it will block the delete."
        }
        confirmText="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
