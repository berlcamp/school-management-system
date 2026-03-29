"use client";

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
import { Lock } from "lucide-react";
import toast from "react-hot-toast";

export default function SystemSettingsPage() {
  const user = useAppSelector((state) => state.user.user);
  const schoolId = user?.school_id;

  const { settings, isLoading, save } = useSchoolSettings(true, schoolId);

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
    </div>
  );
}
