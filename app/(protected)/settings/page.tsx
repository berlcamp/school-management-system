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
import { CalendarClock, Lock, User } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function SystemSettingsPage() {
  const user = useAppSelector((state) => state.user.user);
  const schoolId = user?.school_id;

  const { settings, isLoading, save } = useSchoolSettings(true, schoolId);

  const [principalName, setPrincipalName] = useState(settings.principal_name ?? "");
  const [principalTitle, setPrincipalTitle] = useState(settings.principal_title ?? "");

  useEffect(() => {
    setPrincipalName(settings.principal_name ?? "");
    setPrincipalTitle(settings.principal_title ?? "");
  }, [settings.principal_name, settings.principal_title]);

  const savePrincipalField = async (field: "principal_name" | "principal_title", value: string) => {
    const result = await save({ ...settings, [field]: value || null });
    if (result.success) {
      toast.success("Saved.");
    } else {
      toast.error("Failed to save. Please try again.");
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
      <h1 className="text-2xl font-semibold mb-6">System Settings</h1>

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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
