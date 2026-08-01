"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAppSelector } from "@/lib/redux/hook";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { ArrowRight, CalendarClock, ClipboardList, GraduationCap, ImageIcon, Lock, User } from "lucide-react";
import {
  isSchoolManagementPublicObjectUrl,
  objectPathFromSchoolManagementPublicUrl,
  removeSchoolManagementObjects,
  uploadSchoolLandingHeroImage,
} from "@/lib/utils/schoolLandingHeroStorage";
import Link from "next/link";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

export default function SystemSettingsPage() {
  const user = useAppSelector((state) => state.user.user);
  const schoolId = user?.school_id;

  const { settings, isLoading, save } = useSchoolSettings(true, schoolId);

  const [principalName, setPrincipalName] = useState(settings.principal_name ?? "");
  const [principalTitle, setPrincipalTitle] = useState(settings.principal_title ?? "");
  const [snedCoordinator, setSnedCoordinator] = useState(
    settings.sned_coordinator_name ?? ""
  );
  const [landingHeroUrl, setLandingHeroUrl] = useState(
    settings.landing_hero_image_url ?? ""
  );
  const [heroUploading, setHeroUploading] = useState(false);
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPrincipalName(settings.principal_name ?? "");
    setPrincipalTitle(settings.principal_title ?? "");
    setSnedCoordinator(settings.sned_coordinator_name ?? "");
  }, [
    settings.principal_name,
    settings.principal_title,
    settings.sned_coordinator_name,
  ]);

  useEffect(() => {
    setLandingHeroUrl(settings.landing_hero_image_url ?? "");
  }, [settings.landing_hero_image_url]);

  const savePrincipalField = async (
    field: "principal_name" | "principal_title" | "sned_coordinator_name",
    value: string
  ) => {
    const result = await save({ ...settings, [field]: value || null });
    if (result.success) {
      toast.success("Saved.");
    } else {
      toast.error("Failed to save. Please try again.");
    }
  };

  const removeStoredHeroIfApplicable = async (url: string | null) => {
    if (!url || !isSchoolManagementPublicObjectUrl(url)) return;
    const path = objectPathFromSchoolManagementPublicUrl(url);
    if (path) await removeSchoolManagementObjects([path]);
  };

  const handleHeroFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || schoolId == null) return;

    setHeroUploading(true);
    try {
      const previousUrl = settings.landing_hero_image_url;
      const { publicUrl } = await uploadSchoolLandingHeroImage(file, schoolId);
      const result = await save({
        ...settings,
        landing_hero_image_url: publicUrl,
      });
      if (!result.success) {
        toast.error("Uploaded but failed to save URL. Please try again.");
        return;
      }
      setLandingHeroUrl(publicUrl);
      if (
        previousUrl &&
        previousUrl !== publicUrl &&
        isSchoolManagementPublicObjectUrl(previousUrl)
      ) {
        await removeStoredHeroIfApplicable(previousUrl);
      }
      toast.success("Hero image uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setHeroUploading(false);
    }
  };

  const handleClearLandingHero = async () => {
    if (schoolId == null) return;
    const url = settings.landing_hero_image_url;
    setHeroUploading(true);
    try {
      await removeStoredHeroIfApplicable(url ?? null);
      const result = await save({ ...settings, landing_hero_image_url: null });
      if (result.success) {
        setLandingHeroUrl("");
        toast.success("Hero image removed.");
      } else {
        toast.error("Failed to clear setting. Please try again.");
      }
    } finally {
      setHeroUploading(false);
    }
  };

  const handleToggle = async (value: boolean) => {
    const result = await save({ ...settings, allow_edit_previous_school_year: value });
    if (result.success) {
      toast.success(
        value
          ? "Editing previous school year records is now allowed."
          : "Editing previous school year records is now locked."
      );
    } else {
      toast.error("Failed to save setting. Please try again.");
    }
  };

  const handlePromotedGradesToggle = async (value: boolean) => {
    const result = await save({ ...settings, allow_edit_promoted_student_grades: value });
    if (result.success) {
      toast.success(
        value
          ? "Editing grades for promoted students is now allowed."
          : "Editing grades for promoted students is now locked."
      );
    } else {
      toast.error("Failed to save setting. Please try again.");
    }
  };

  const handleDeadlineChange = async (value: string) => {
    const deadline = value || null;
    const result = await save({ ...settings, promotion_deadline: deadline });
    if (result.success) {
      toast.success(
        deadline
          ? "Promotion deadline has been set."
          : "Promotion deadline has been cleared."
      );
    } else {
      toast.error("Failed to save setting. Please try again.");
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">School Settings</h1>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Record Editing Controls</CardTitle>
          </div>
          <CardDescription>
            Manage editing permissions for student records across school years.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none">
                Allow editing records from previous school years
              </p>
              <p className="text-sm text-muted-foreground">
                When off, grades, attendance, and health records from previous
                school years are locked and cannot be modified.
              </p>
            </div>
            <Switch
              id="allow-edit-previous-year"
              checked={settings.allow_edit_previous_school_year}
              onCheckedChange={handleToggle}
              disabled={isLoading}
            />
          </div>
          <hr className="my-4" />
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium leading-none">
                  Allow editing grades for promoted students
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                When on, teachers can view and edit grades for students who have
                already been promoted.
              </p>
            </div>
            <Switch
              id="allow-edit-promoted-grades"
              checked={settings.allow_edit_promoted_student_grades}
              onCheckedChange={handlePromotedGradesToggle}
              disabled={isLoading}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Promotion Controls</CardTitle>
          </div>
          <CardDescription>
            Set deadlines for student promotion for the current school year ({getCurrentSchoolYear()}).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="promotion-deadline" className="text-sm font-medium">
                Deadline for Promotion
              </Label>
              <p className="text-sm text-muted-foreground">
                After this date, the Promote button on section pages will be disabled.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Input
                id="promotion-deadline"
                type="date"
                className="w-48"
                value={settings.promotion_deadline ?? ""}
                onChange={(e) => handleDeadlineChange(e.target.value)}
                disabled={isLoading}
              />
              {settings.promotion_deadline && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeadlineChange("")}
                  disabled={isLoading}
                >
                  Clear
                </Button>
              )}
            </div>
            {settings.promotion_deadline && new Date(settings.promotion_deadline + "T23:59:59") < new Date() && (
              <p className="text-sm text-destructive font-medium">
                This deadline has passed. Promotion is currently disabled.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">School Principal</CardTitle>
          </div>
          <CardDescription>
            Set the school principal&apos;s name and title for report card signatories.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="principal-name" className="text-sm font-medium">
                Principal Name
              </Label>
              <Input
                id="principal-name"
                type="text"
                className="w-72"
                placeholder="e.g. JUAN DELA CRUZ, PhD"
                value={principalName}
                onChange={(e) => setPrincipalName(e.target.value)}
                onBlur={() => savePrincipalField("principal_name", principalName)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="principal-title" className="text-sm font-medium">
                Principal Title
              </Label>
              <Input
                id="principal-title"
                type="text"
                className="w-72"
                placeholder="e.g. Principal III"
                value={principalTitle}
                onChange={(e) => setPrincipalTitle(e.target.value)}
                onBlur={() => savePrincipalField("principal_title", principalTitle)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sned-coordinator" className="text-sm font-medium">
                SNED School Coordinator
              </Label>
              <Input
                id="sned-coordinator"
                type="text"
                className="w-72"
                placeholder="e.g. MARIA S. SANTOS"
                value={snedCoordinator}
                onChange={(e) => setSnedCoordinator(e.target.value)}
                onBlur={() =>
                  savePrincipalField("sned_coordinator_name", snedCoordinator)
                }
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Signatory on the printed SNED parent/guardian consent form.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Public school page</CardTitle>
          </div>
          <CardDescription>
            Optional banner image at the top of the public school page (schools directory → school
            detail).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <input
              ref={heroFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              aria-label="Upload hero banner image"
              onChange={handleHeroFileSelected}
              disabled={isLoading || schoolId == null || heroUploading}
            />
            <div className="space-y-1">
              <Label className="text-sm font-medium">Hero banner image</Label>
              <p className="text-sm text-muted-foreground">
                Wide image (about 1600×400px or larger). Stored in Supabase Storage (bucket{" "}
                <span className="font-mono text-xs">school-management</span>). JPEG, PNG, WebP,
                or GIF, up to 5 MB.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isLoading || schoolId == null || heroUploading}
                onClick={() => heroFileInputRef.current?.click()}
              >
                {heroUploading ? "Uploading…" : "Upload image"}
              </Button>
              {landingHeroUrl.trim().length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={isLoading || schoolId == null || heroUploading}
                  onClick={() => void handleClearLandingHero()}
                >
                  Remove image
                </Button>
              )}
            </div>
            {landingHeroUrl.trim().length > 0 && (
              <div className="rounded-lg border bg-muted/30 overflow-hidden max-w-2xl">
                <img
                  src={landingHeroUrl}
                  alt="Preview of public school page hero banner"
                  className="w-full h-36 sm:h-44 object-cover"
                />
              </div>
            )}
            {schoolId == null && (
              <p className="text-sm text-muted-foreground">
                Select a school account to edit this setting.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">ECCD Checklist Management</CardTitle>
          </div>
          <CardDescription>
            Manage ECCD domains, checklist items, and scale score mappings for Kindergarten assessments.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Link href="/settings/eccd">
            <Button variant="outline" className="gap-2">
              Manage ECCD Checklist
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
