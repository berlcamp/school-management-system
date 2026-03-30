"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useGpaThresholds } from "@/hooks/useGpaThresholds";
import { GRADE_LEVEL_MIN } from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { Enrollment, LrnLookupResult, SectionType, StudentEntryMode } from "@/types/database";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Loader2, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import ECCDChecklistStep from "./ECCDChecklistStep";
import EnrollmentDetailsStep from "./EnrollmentDetailsStep";
import {
  EnrollmentFormSchema,
  EnrollmentFormType,
  ExistingStudentSchema,
  STUDENT_FORM_DEFAULTS,
  StudentFormSchema,
  StudentFormType,
} from "./enrollmentWizardSchema";
import SNEDDisabilityStep from "./SNEDDisabilityStep";
import StudentRecordStep from "./StudentRecordStep";
import WizardStepIndicator from "./WizardStepIndicator";

const SENIOR_HIGH_GRADE_MIN = 11;
const SENIOR_HIGH_GRADE_MAX = 12;

function getDocFileExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "pdf";
  return [".pdf", ".jpg", ".jpeg", ".png"].includes(`.${ext}`) ? ext : "pdf";
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: Enrollment | null;
}

const BASE_WIZARD_STEPS = [
  { label: "Student Record" },
  { label: "Enrollment Details" },
];

const KINDER_WIZARD_STEPS = [
  { label: "Student Record" },
  { label: "Enrollment Details" },
  { label: "ECCD Checklist" },
];

const SNED_WIZARD_STEPS = [
  { label: "Student Record" },
  { label: "Enrollment Details" },
  { label: "Disability Info" },
];

export default function EnrollmentWizard({
  isOpen,
  onClose,
  editData,
}: ModalProps) {
  const { thresholds } = useGpaThresholds(isOpen);
  const user = useAppSelector((state) => state.user.user);
  const dispatch = useAppDispatch();
  const isDivisionAdmin = user?.type === "division_admin";
  const hasSchoolScope = user?.school_id != null || isDivisionAdmin;

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [entryMode, setEntryMode] = useState<StudentEntryMode>("new");
  const [lookupResult, setLookupResult] = useState<LrnLookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCurrentSchool, setIsCurrentSchool] = useState(false);

  // Section state
  const [sections, setSections] = useState<
    Array<{
      id: string;
      name: string;
      grade_level: number;
      school_year: string;
      section_type?: SectionType | null;
    }>
  >([]);

  // GPA state
  const [studentPreviousGpa, setStudentPreviousGpa] = useState<
    number | null | undefined
  >(undefined);

  // Document uploads
  const [birthCertificateFile, setBirthCertificateFile] = useState<File | null>(null);
  const [goodMoralFile, setGoodMoralFile] = useState<File | null>(null);
  const birthCertInputRef = useRef<HTMLInputElement>(null);
  const goodMoralInputRef = useRef<HTMLInputElement>(null);

  // ECCD Checklist state (Kindergarten only)
  const [eccdRatings, setEccdRatings] = useState<Record<string, string>>({});

  // SNED disability state
  const [snedDisabilities, setSnedDisabilities] = useState<string[]>([]);

  // LRN lookup timer
  const lrnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit mode: fetch student name
  const [editingStudentName, setEditingStudentName] = useState("");

  // Step 1 form (student record)
  const studentForm = useForm<StudentFormType>({
    resolver: zodResolver(
      entryMode === "new" ? StudentFormSchema : ExistingStudentSchema
    ),
    defaultValues: STUDENT_FORM_DEFAULTS,
  });

  // Step 2 form (enrollment details)
  const enrollmentForm = useForm<EnrollmentFormType>({
    resolver: zodResolver(EnrollmentFormSchema),
    defaultValues: {
      student_id: "",
      section_id: "",
      school_year: getCurrentSchoolYear(),
      grade_level: 1,
      semester: null,
    },
  });

  const gradeLevel = enrollmentForm.watch("grade_level");
  const isKindergarten = gradeLevel === 0;
  const isSNED = gradeLevel === -1;
  const hasStep3 = isKindergarten || isSNED;
  const wizardSteps = isKindergarten
    ? KINDER_WIZARD_STEPS
    : isSNED
      ? SNED_WIZARD_STEPS
      : BASE_WIZARD_STEPS;

  // ── LRN Lookup ─────────────────────────────────────────────────
  const performLrnLookup = useCallback(
    async (lrn: string) => {
      const trimmed = lrn.trim();
      if (trimmed.length < 4) {
        setLookupResult(null);
        setEntryMode("new");
        setIsCurrentSchool(false);
        return;
      }

      setIsLookingUp(true);
      try {
        const { data, error } = await supabase.rpc("lookup_student_by_lrn", {
          p_lrn: trimmed,
        });

        if (error || !data || data.length === 0) {
          setLookupResult(null);
          setEntryMode("new");
          setIsCurrentSchool(false);
        } else {
          const result = data[0] as LrnLookupResult;
          setLookupResult(result);

          const atThisSchool =
            user?.school_id != null &&
            String(result.current_school_id) === String(user.school_id);
          setIsCurrentSchool(atThisSchool);
          setEntryMode(atThisSchool ? "existing" : "transferee");
        }
      } catch {
        setLookupResult(null);
        setEntryMode("new");
        setIsCurrentSchool(false);
      } finally {
        setIsLookingUp(false);
      }
    },
    [user?.school_id]
  );

  const handleLrnChange = useCallback(
    (lrn: string) => {
      if (lrnTimerRef.current) clearTimeout(lrnTimerRef.current);
      if (lrn.trim().length < 4) {
        setLookupResult(null);
        setEntryMode("new");
        setIsCurrentSchool(false);
        return;
      }
      lrnTimerRef.current = setTimeout(() => {
        performLrnLookup(lrn);
      }, 500);
    },
    [performLrnLookup]
  );

  // ── Fetch sections ──────────────────────────────────────────────
  const fetchSections = useCallback(
    async (overrideGradeLevel?: number) => {
      const levelToUse = overrideGradeLevel ?? gradeLevel;

      if (!hasSchoolScope || !Number.isFinite(levelToUse)) {
        setSections([]);
        return;
      }

      let query = supabase
        .from("sms_sections")
        .select("id, name, grade_level, school_year, section_type")
        .eq("is_active", true)
        .eq("grade_level", levelToUse)
        .order("name");
      if (user?.school_id != null) {
        query = query.eq("school_id", user.school_id);
      }
      const { data } = await query;
      if (data) setSections(data);
    },
    [gradeLevel, user?.school_id, hasSchoolScope]
  );

  // Fetch sections when grade level changes on step 2
  useEffect(() => {
    if (isOpen && currentStep === 2 && Number.isFinite(gradeLevel)) {
      fetchSections();
    }
  }, [isOpen, currentStep, gradeLevel, fetchSections]);

  // ── Fetch GPA ───────────────────────────────────────────────────
  useEffect(() => {
    const fetchGpa = async () => {
      const studentId = enrollmentForm.getValues("student_id");
      if (
        !isOpen ||
        editData ||
        !studentId ||
        !hasSchoolScope ||
        gradeLevel <= GRADE_LEVEL_MIN ||
        entryMode === "transferee"
      ) {
        setStudentPreviousGpa(undefined);
        return;
      }

      const { data, error } = await supabase.rpc("get_student_previous_gpa", {
        p_student_id: studentId,
        p_grade_level: gradeLevel,
        ...(user?.school_id != null && { p_school_id: user.school_id }),
      });

      if (error) {
        setStudentPreviousGpa(null);
        return;
      }
      setStudentPreviousGpa(data != null ? Number(data) : null);
    };

    if (currentStep === 2) fetchGpa();
  }, [
    isOpen,
    editData,
    currentStep,
    gradeLevel,
    hasSchoolScope,
    user?.school_id,
    enrollmentForm,
    entryMode,
  ]);

  // ── Edit mode setup ─────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && editData) {
      setCurrentStep(2);
      setEntryMode("existing");
      const isSeniorHigh =
        editData.grade_level >= SENIOR_HIGH_GRADE_MIN &&
        editData.grade_level <= SENIOR_HIGH_GRADE_MAX;
      enrollmentForm.reset({
        student_id: editData.student_id ? String(editData.student_id) : "",
        section_id: editData.section_id ? String(editData.section_id) : "",
        school_year: editData.school_year,
        grade_level: editData.grade_level,
        semester: isSeniorHigh ? editData.semester ?? 1 : null,
      });
      if (editData.grade_level != null) {
        fetchSections(editData.grade_level);
      }
      // Fetch student name
      const fetchName = async () => {
        const { data } = await supabase
          .from("sms_students")
          .select("first_name, last_name, middle_name, lrn")
          .eq("id", editData.student_id)
          .single();
        if (data) {
          setEditingStudentName(
            `${data.first_name}${data.middle_name ? ` ${data.middle_name.charAt(0)}.` : ""} ${data.last_name}`
          );
          studentForm.setValue("lrn", data.lrn);
        }
      };
      fetchName();
      // Fetch existing SNED disabilities for edit mode
      if (editData.grade_level === -1) {
        const fetchDisabilities = async () => {
          const { data } = await supabase
            .from("sms_student_disabilities")
            .select("disability")
            .eq("student_id", editData.student_id)
            .eq("enrollment_id", editData.id);
          if (data) {
            setSnedDisabilities(data.map((d) => d.disability));
          }
        };
        fetchDisabilities();
      }
    } else if (isOpen && !editData) {
      setCurrentStep(1);
      setEntryMode("new");
      setLookupResult(null);
      setIsCurrentSchool(false);
      studentForm.reset(STUDENT_FORM_DEFAULTS);
      enrollmentForm.reset({
        student_id: "",
        section_id: "",
        school_year: getCurrentSchoolYear(),
        grade_level: 1,
        semester: null,
      });
      setBirthCertificateFile(null);
      setGoodMoralFile(null);
      setEccdRatings({});
      setSnedDisabilities([]);
      setEditingStudentName("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editData]);

  // ── Cleanup timer on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (lrnTimerRef.current) clearTimeout(lrnTimerRef.current);
    };
  }, []);

  // ── Step navigation ─────────────────────────────────────────────
  const handleContinueToStep2 = async () => {
    if (entryMode === "new") {
      const valid = await studentForm.trigger();
      if (!valid) {
        toast.error("Please fix the form errors before continuing.");
        return;
      }
    } else if (entryMode === "existing" || entryMode === "transferee") {
      if (!lookupResult) {
        toast.error("No student selected.");
        return;
      }
      // Set student_id on enrollment form
      enrollmentForm.setValue("student_id", String(lookupResult.student_id));
    }

    setCurrentStep(2);
    // Fetch sections for the initial grade/year
    fetchSections();
  };

  const handleBack = () => {
    if (editData && !isSNED) return; // Can't go back in edit mode (except SNED)
    if (editData && isSNED && currentStep === 3) {
      setCurrentStep(2);
      return;
    }
    if (currentStep === 3) {
      setCurrentStep(2);
    } else {
      setCurrentStep(1);
    }
  };

  // ── Build student name for step 2 header ────────────────────────
  const getStudentName = () => {
    if (editData && editingStudentName) return editingStudentName;
    if (lookupResult) {
      return [
        lookupResult.first_name,
        lookupResult.middle_name
          ? `${lookupResult.middle_name.charAt(0)}.`
          : "",
        lookupResult.last_name,
        lookupResult.suffix,
      ]
        .filter(Boolean)
        .join(" ");
    }
    const vals = studentForm.getValues();
    return [vals.first_name, vals.middle_name ? `${vals.middle_name.charAt(0)}.` : "", vals.last_name, vals.suffix]
      .filter(Boolean)
      .join(" ");
  };

  const getStudentLrn = () => {
    if (lookupResult) return lookupResult.lrn;
    return studentForm.getValues("lrn") || "";
  };

  // ── Save ECCD BOSY ratings after enrollment ─────────────────────
  const saveEccdRatings = async (
    studentId: string,
    sectionId: string,
    enrollSchoolYear: string
  ) => {
    const entries = Object.entries(eccdRatings)
      .filter(([, val]) => val && !Number.isNaN(Number(val)))
      .map(([competencyId, val]) => ({
        student_id: studentId,
        competency_id: competencyId,
        section_id: sectionId,
        school_year: enrollSchoolYear,
        period: "BOSY" as const,
        rating: Number(val),
        assessed_by: user?.system_user_id ?? null,
        school_id: (user?.school_id as string) ?? null,
      }));

    if (entries.length > 0) {
      const { error } = await supabase
        .from("sms_eccd_assessments")
        .upsert(entries, {
          onConflict:
            "student_id,competency_id,section_id,school_year,period",
          ignoreDuplicates: false,
        });
      if (error) {
        console.error("Error saving ECCD ratings:", error);
        toast.error("Enrollment saved but ECCD ratings failed to save.");
      }
    }
  };

  // ── Save SNED disabilities after enrollment ────────────────────
  const saveSnedDisabilities = async (
    studentId: string,
    enrollmentId: string
  ) => {
    if (snedDisabilities.length === 0) return;

    const entries = snedDisabilities.map((disability) => ({
      student_id: studentId,
      enrollment_id: enrollmentId,
      disability,
      school_id: (user?.school_id as string) ?? null,
    }));

    const { error } = await supabase
      .from("sms_student_disabilities")
      .upsert(entries, {
        onConflict: "student_id,enrollment_id,disability",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error("Error saving SNED disabilities:", error);
      toast.error("Enrollment saved but disability info failed to save.");
    }
  };

  // ── Navigate to step 3 (Kindergarten ECCD / SNED Disability) ───
  const handleContinueToStep3 = async () => {
    const enrollmentValid = await enrollmentForm.trigger();
    if (!enrollmentValid) {
      toast.error("Please fix the form errors before continuing.");
      return;
    }
    setCurrentStep(3);
  };

  // ── Submit ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const enrollmentValid = await enrollmentForm.trigger();
    if (!enrollmentValid) {
      toast.error("Please fix the form errors before submitting.");
      return;
    }

    if (!user?.system_user_id) {
      toast.error("User information is missing. Please try again.");
      return;
    }
    if (!hasSchoolScope) {
      toast.error("You do not have a school assigned.");
      return;
    }

    setIsSubmitting(true);
    const enrollData = enrollmentForm.getValues();
    const isSeniorHigh =
      enrollData.grade_level >= SENIOR_HIGH_GRADE_MIN &&
      enrollData.grade_level <= SENIOR_HIGH_GRADE_MAX;

    try {
      if (editData?.id) {
        // ── EDIT MODE ──
        const updateData = {
          section_id: enrollData.section_id,
          school_year: enrollData.school_year.trim(),
          grade_level: enrollData.grade_level,
          ...(isSeniorHigh && { semester: enrollData.semester ?? 1 }),
          ...(!isSeniorHigh && { semester: null }),
        };

        const { data: updated, error } = await supabase
          .from("sms_enrollments")
          .update(updateData)
          .eq("id", editData.id)
          .select()
          .single();
        if (error) throw new Error(error.message);

        await supabase
          .from("sms_students")
          .update({
            grade_level: enrollData.grade_level,
            current_section_id: enrollData.section_id,
          })
          .eq("id", editData.student_id);

        // Save SNED disabilities in edit mode
        if (enrollData.grade_level === -1) {
          // Delete removed disabilities
          await supabase
            .from("sms_student_disabilities")
            .delete()
            .eq("student_id", editData.student_id)
            .eq("enrollment_id", editData.id);
          // Insert current selections
          if (snedDisabilities.length > 0) {
            await saveSnedDisabilities(
              String(editData.student_id),
              String(editData.id)
            );
          }
        }

        dispatch(updateList(updated));
        onClose();
        toast.success("Enrollment updated successfully!");
        return;
      }

      // ── NEW STUDENT ──
      if (entryMode === "new") {
        const studentData = studentForm.getValues();

        // Insert student
        const { data: newStudent, error: studentErr } = await supabase
          .from("sms_students")
          .insert([
            {
              lrn: studentData.lrn.trim(),
              first_name: studentData.first_name.trim(),
              middle_name: studentData.middle_name?.trim() || null,
              last_name: studentData.last_name.trim(),
              suffix: studentData.suffix?.trim() || null,
              date_of_birth: studentData.date_of_birth,
              gender: studentData.gender,
              mother_tongue: studentData.mother_tongue?.trim() || null,
              ip_ethnic_group: studentData.ip_ethnic_group?.trim() || null,
              religion: studentData.religion?.trim() || null,
              purok: studentData.purok?.trim() || null,
              barangay: studentData.barangay?.trim() || null,
              municipality_city: studentData.municipality_city?.trim() || null,
              province: studentData.province?.trim() || null,
              contact_number: studentData.contact_number?.trim() || null,
              email: studentData.email?.trim() || null,
              father_last_name: studentData.father_last_name?.trim() || null,
              father_first_name: studentData.father_first_name?.trim() || null,
              father_middle_name: studentData.father_middle_name?.trim() || null,
              mother_last_name: studentData.mother_last_name?.trim() || null,
              mother_first_name: studentData.mother_first_name?.trim() || null,
              mother_middle_name: studentData.mother_middle_name?.trim() || null,
              guardian_last_name: studentData.guardian_last_name?.trim() || null,
              guardian_first_name: studentData.guardian_first_name?.trim() || null,
              guardian_middle_name: studentData.guardian_middle_name?.trim() || null,
              parent_guardian_contact: studentData.parent_guardian_contact?.trim() || null,
              previous_school: studentData.previous_school?.trim() || null,
              enrollment_status: "enrolled",
              ...(user?.school_id != null && { school_id: user.school_id }),
              ...(user?.system_user_id != null && { encoded_by: user.system_user_id }),
              enrolled_at: new Date().toISOString(),
            },
          ])
          .select()
          .single();

        if (studentErr) {
          if (studentErr.code === "23505") {
            studentForm.setError("lrn", {
              type: "manual",
              message: "LRN already exists",
            });
            setCurrentStep(1);
            setIsSubmitting(false);
            return;
          }
          throw new Error(studentErr.message);
        }

        // Upload documents
        const schoolId = user?.school_id ?? "default";
        const studentId = newStudent.id;

        if (birthCertificateFile) {
          const ext = getDocFileExtension(birthCertificateFile.name);
          const path = `${schoolId}/${studentId}/birth_certificate.${ext}`;
          await supabase.storage.from("diplomas").upload(path, birthCertificateFile, {
            upsert: true,
            contentType: birthCertificateFile.type,
          });
          await supabase.from("sms_students").update({ birth_certificate_file_path: path }).eq("id", studentId);
        }
        if (goodMoralFile) {
          const ext = getDocFileExtension(goodMoralFile.name);
          const path = `${schoolId}/${studentId}/good_moral.${ext}`;
          await supabase.storage.from("diplomas").upload(path, goodMoralFile, {
            upsert: true,
            contentType: goodMoralFile.type,
          });
          await supabase.from("sms_students").update({ good_moral_file_path: path }).eq("id", studentId);
        }

        // Create enrollment
        const { data: enrollment, error: enrollErr } = await supabase
          .from("sms_enrollments")
          .insert([
            {
              student_id: studentId,
              section_id: enrollData.section_id,
              school_year: enrollData.school_year.trim(),
              grade_level: enrollData.grade_level,
              ...(isSeniorHigh && { semester: enrollData.semester ?? 1 }),
              ...(!isSeniorHigh && { semester: null }),
              enrollment_date: new Date().toISOString().split("T")[0],
              status: "approved",
              enrollment_status: "active",
              enrolled_by: user.system_user_id,
              approved_by: user.system_user_id,
              ...(user?.school_id != null && { school_id: user.school_id }),
            },
          ])
          .select()
          .single();

        if (enrollErr) {
          if (
            enrollErr.code === "23505" &&
            (enrollErr.message?.includes("uq_enrollments_student_school_year") ||
              enrollErr.message?.includes("uq_enrollments_student_school_year_semester"))
          ) {
            toast.error("Student is already enrolled for this school year.");
            setIsSubmitting(false);
            return;
          }
          throw new Error(enrollErr.message);
        }

        // Update student with grade level
        await supabase
          .from("sms_students")
          .update({
            grade_level: enrollData.grade_level,
            current_section_id: enrollData.section_id,
          })
          .eq("id", studentId);

        const selectedSection = sections.find(
          (s) => String(s.id) === String(enrollData.section_id)
        );
        // Save ECCD BOSY ratings for Kindergarten
        if (isKindergarten && Object.keys(eccdRatings).length > 0) {
          await saveEccdRatings(
            studentId,
            enrollData.section_id,
            enrollData.school_year.trim()
          );
        }
        // Save SNED disabilities
        if (isSNED && snedDisabilities.length > 0) {
          await saveSnedDisabilities(studentId, enrollment.id);
        }

        dispatch(
          addItem({
            ...enrollment,
            student: newStudent,
            section: selectedSection ?? null,
          })
        );
        onClose();
        toast.success("Student enrolled successfully!");
        return;
      }

      // ── EXISTING STUDENT (re-enrollment) ──
      if (entryMode === "existing" && lookupResult) {
        // Check duplicate enrollment
        let existingQuery = supabase
          .from("sms_enrollments")
          .select("id")
          .eq("student_id", lookupResult.student_id)
          .eq("school_year", enrollData.school_year.trim());
        if (user?.school_id != null) {
          existingQuery = existingQuery.eq("school_id", user.school_id);
        }
        if (isSeniorHigh && (enrollData.semester === 1 || enrollData.semester === 2)) {
          existingQuery = existingQuery.eq("semester", enrollData.semester);
        } else {
          existingQuery = existingQuery.is("semester", null);
        }
        const { data: existing } = await existingQuery.maybeSingle();

        if (existing) {
          toast.error(
            isSeniorHigh
              ? "Student is already enrolled for this semester."
              : "Student is already enrolled for this school year."
          );
          setIsSubmitting(false);
          return;
        }

        const { data: enrollment, error: enrollErr } = await supabase
          .from("sms_enrollments")
          .insert([
            {
              student_id: lookupResult.student_id,
              section_id: enrollData.section_id,
              school_year: enrollData.school_year.trim(),
              grade_level: enrollData.grade_level,
              ...(isSeniorHigh && { semester: enrollData.semester ?? 1 }),
              ...(!isSeniorHigh && { semester: null }),
              enrollment_date: new Date().toISOString().split("T")[0],
              status: "approved",
              enrollment_status: "active",
              enrolled_by: user.system_user_id,
              approved_by: user.system_user_id,
              ...(user?.school_id != null && { school_id: user.school_id }),
            },
          ])
          .select()
          .single();

        if (enrollErr) {
          if (enrollErr.code === "23505") {
            toast.error("Student is already enrolled for this school year.");
            setIsSubmitting(false);
            return;
          }
          throw new Error(enrollErr.message);
        }

        await supabase
          .from("sms_students")
          .update({
            grade_level: enrollData.grade_level,
            current_section_id: enrollData.section_id,
            enrollment_status: "enrolled",
          })
          .eq("id", lookupResult.student_id);

        const selectedSection = sections.find(
          (s) => String(s.id) === String(enrollData.section_id)
        );
        // Save ECCD BOSY ratings for Kindergarten
        if (isKindergarten && Object.keys(eccdRatings).length > 0) {
          await saveEccdRatings(
            String(lookupResult.student_id),
            enrollData.section_id,
            enrollData.school_year.trim()
          );
        }
        // Save SNED disabilities
        if (isSNED && snedDisabilities.length > 0) {
          await saveSnedDisabilities(
            String(lookupResult.student_id),
            enrollment.id
          );
        }

        dispatch(
          addItem({
            ...enrollment,
            student: lookupResult,
            section: selectedSection ?? null,
          })
        );
        onClose();
        toast.success("Student enrolled successfully!");
        return;
      }

      // ── TRANSFEREE ──
      if (entryMode === "transferee" && lookupResult) {
        const { data, error } = await supabase.rpc(
          "enroll_student_with_record_request",
          {
            p_student_id: lookupResult.student_id,
            p_requesting_school_id: user.school_id,
            p_requested_by: user.system_user_id,
            p_section_id: enrollData.section_id,
            p_grade_level: enrollData.grade_level,
            p_school_year: enrollData.school_year.trim(),
            ...(isSeniorHigh && { p_semester: enrollData.semester ?? 1 }),
          }
        );

        if (error) throw new Error(error.message);

        const enrollmentId = data?.[0]?.enrollment_id;
        if (enrollmentId) {
          const { data: enrollment } = await supabase
            .from("sms_enrollments")
            .select("*, student:sms_students(*), section:sms_sections(*)")
            .eq("id", enrollmentId)
            .single();
          if (enrollment) dispatch(addItem(enrollment));
        }

        onClose();
        toast.success(
          `Student enrolled. Record request sent to ${lookupResult.current_school_name ?? "the previous school"}. Enrollment will be approved once accepted.`,
          { duration: 5000 }
        );
        return;
      }
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(
        err instanceof Error ? err.message : "Error saving enrollment"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto p-0"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-2 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                {editData ? "Edit Enrollment" : "New Enrollment"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                {editData
                  ? "Update enrollment details"
                  : "Enroll a new or existing student"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Step indicator — hidden in edit mode, except SNED */}
        {(!editData || (editData && isSNED)) && (
          <div className="border-b px-6 pb-4">
            <WizardStepIndicator
              currentStep={currentStep}
              steps={editData && isSNED
                ? [{ label: "Enrollment Details" }, { label: "Disability Info" }]
                : wizardSteps}
            />
          </div>
        )}

        {/* Step content */}
        <div className="px-6 py-4 min-h-[200px]">
          {currentStep === 1 && !editData && (
            <Form {...studentForm}>
              <StudentRecordStep
                form={studentForm}
                entryMode={entryMode}
                lookupResult={lookupResult}
                isLookingUp={isLookingUp}
                isCurrentSchool={isCurrentSchool}
                isSubmitting={isSubmitting}
                birthCertificateFile={birthCertificateFile}
                goodMoralFile={goodMoralFile}
                onBirthCertChange={setBirthCertificateFile}
                onGoodMoralChange={setGoodMoralFile}
                birthCertInputRef={birthCertInputRef}
                goodMoralInputRef={goodMoralInputRef}
                onLrnChange={handleLrnChange}
              />
            </Form>
          )}

          {currentStep === 2 && (
            <Form {...enrollmentForm}>
              <EnrollmentDetailsStep
                form={enrollmentForm}
                sections={sections}
                isSubmitting={isSubmitting}
                entryMode={entryMode}
                lookupResult={lookupResult}
                studentName={getStudentName()}
                studentLrn={getStudentLrn()}
                studentPreviousGpa={studentPreviousGpa}
                thresholds={thresholds}
                onGradeLevelChange={(level) => {
                  fetchSections(level);
                }}
              />
            </Form>
          )}

          {currentStep === 3 && isKindergarten && (
            <ECCDChecklistStep
              ratings={eccdRatings}
              onRatingsChange={setEccdRatings}
              isSubmitting={isSubmitting}
            />
          )}

          {currentStep === 3 && isSNED && (
            <SNEDDisabilityStep
              selectedDisabilities={snedDisabilities}
              onDisabilitiesChange={setSnedDisabilities}
              isSubmitting={isSubmitting}
            />
          )}
        </div>

        {/* Footer with navigation */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="h-11 min-w-[100px]"
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            {/* Back button — on step 2 or 3, not in edit mode (except SNED edit) */}
            {(currentStep === 2 || currentStep === 3) && (!editData || (editData && isSNED && currentStep === 3)) && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={isSubmitting}
                className="h-11"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
            )}

            {/* Step 1: Continue to step 2 */}
            {currentStep === 1 && !editData && (
              <Button
                type="button"
                onClick={handleContinueToStep2}
                disabled={isSubmitting || isLookingUp || (!lookupResult && !studentForm.getValues("lrn")?.trim())}
                className={cn("h-11 min-w-[140px]")}
              >
                Continue
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}

            {/* Step 2: For Kindergarten/SNED, continue to step 3; otherwise submit */}
            {currentStep === 2 && hasStep3 && (!editData || isSNED) && (
              <Button
                type="button"
                onClick={handleContinueToStep3}
                disabled={isSubmitting}
                className="h-11 min-w-[140px]"
              >
                Continue
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}

            {currentStep === 2 && (!hasStep3 || (editData && !isSNED)) && (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="h-11 min-w-[140px]"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {editData ? "Updating..." : "Enrolling..."}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {editData
                      ? "Update Enrollment"
                      : entryMode === "transferee"
                        ? "Enroll & Request Record"
                        : "Enroll Student"}
                  </span>
                )}
              </Button>
            )}

            {/* Step 3: ECCD Checklist / SNED Disability — Skip or Enroll/Update */}
            {currentStep === 3 && hasStep3 && (
              <>
                {!editData && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (isKindergarten) setEccdRatings({});
                      if (isSNED) setSnedDisabilities([]);
                      handleSubmit();
                    }}
                    disabled={isSubmitting}
                    className="h-11"
                  >
                    Skip & Enroll
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="h-11 min-w-[140px]"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {editData ? "Updating..." : "Enrolling..."}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {editData ? "Update Enrollment" : "Enroll Student"}
                    </span>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
