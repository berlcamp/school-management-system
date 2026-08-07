"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { setUser } from "@/lib/redux/userSlice";
import { supabase } from "@/lib/supabase/client";
import {
  formatUserType,
  getAvatarColor,
  getInitials,
  googleAvatarUrl,
} from "@/lib/utils/userProfile";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShieldCheck, UserCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

/**
 * Self-service profile editing for any signed-in staff member.
 *
 * Only the four descriptive fields below are writable. Email is the sign-in
 * identity — `AuthGuard` resolves the `sms_users` row by matching it against the
 * Supabase session, so letting a user change it here would lock them out of the
 * system. Role, school, and active status stay with whoever administers staff;
 * a user must not be able to promote themselves.
 */
const FormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  position: z.string().trim().optional(),
  employee_id: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

type FormType = z.infer<typeof FormSchema>;

interface ProfileRow {
  name: string;
  email: string;
  position: string | null;
  employee_id: string | null;
  phone: string | null;
  type: string | null;
}

export default function ProfilePage() {
  const user = useAppSelector((state) => state.user.user);
  const dispatch = useAppDispatch();
  const systemUserId = user?.system_user_id ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [schoolName, setSchoolName] = useState("");

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: "", position: "", employee_id: "", phone: "" },
  });

  const loadProfile = useCallback(async () => {
    if (systemUserId == null) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sms_users")
      .select("name, email, position, employee_id, phone, type")
      .eq("id", systemUserId)
      .single();
    setLoading(false);

    if (error || !data) {
      toast.error("Failed to load your profile.");
      return;
    }
    const row = data as ProfileRow;
    setProfile(row);
    form.reset({
      name: row.name ?? "",
      position: row.position ?? "",
      employee_id: row.employee_id ?? "",
      phone: row.phone ?? "",
    });
  }, [systemUserId, form]);

  useEffect(() => {
    let isMounted = true;
    if (systemUserId == null) return;
    (async () => {
      if (isMounted) await loadProfile();
    })();
    return () => {
      isMounted = false;
    };
  }, [systemUserId, loadProfile]);

  useEffect(() => {
    let isMounted = true;
    const schoolId = user?.school_id;
    if (schoolId == null) {
      setSchoolName("");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("sms_schools")
        .select("name")
        .eq("id", Number(schoolId))
        .maybeSingle();
      if (isMounted) setSchoolName(data?.name ?? "");
    })();
    return () => {
      isMounted = false;
    };
  }, [user?.school_id]);

  const onSubmit = async (values: FormType) => {
    if (saving || systemUserId == null) return;
    setSaving(true);

    // Whitelisted explicitly rather than spread from the form, so a field added
    // to the schema later cannot silently become self-editable.
    const { error } = await supabase
      .from("sms_users")
      .update({
        name: values.name,
        position: values.position || null,
        employee_id: values.employee_id || null,
        phone: values.phone || null,
      })
      .eq("id", systemUserId);
    setSaving(false);

    if (error) {
      toast.error("Failed to save your profile.");
      return;
    }

    // Keep the header and every other `user.name` reader in step without a reload.
    if (user) dispatch(setUser({ ...user, name: values.name }));
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            name: values.name,
            position: values.position || null,
            employee_id: values.employee_id || null,
            phone: values.phone || null,
          }
        : prev
    );
    form.reset(values);
    toast.success("Profile updated.");
  };

  const displayName = profile?.name || user?.name || "";
  const photoUrl = googleAvatarUrl(user?.user_metadata);
  const roleLabel = formatUserType(profile?.type ?? user?.type);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <UserCog className="h-5 w-5" />
          My Profile
        </h1>
        <p className="text-sm text-muted-foreground">
          Update your own details. Your role and school are managed by your
          school administrator.
        </p>
      </div>

      <div className="app__content max-w-2xl space-y-4">
        {/* Identity — everything here is read-only */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Avatar className="size-16 shrink-0">
                <AvatarImage
                  src={photoUrl}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                />
                <AvatarFallback
                  className={`${getAvatarColor(
                    displayName
                  )} text-white text-lg font-semibold`}
                >
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-0.5">
                <p className="font-semibold truncate">{displayName || "—"}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {profile?.email ?? user?.email ?? "—"}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {roleLabel && <span>{roleLabel}</span>}
                  {roleLabel && schoolName && <span>·</span>}
                  {schoolName && <span className="truncate">{schoolName}</span>}
                </div>
              </div>
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Your photo and email address come from the Google account you sign
              in with, so they cannot be changed here. Update the photo in your
              Google account and it will follow on your next sign-in.
            </p>
          </CardContent>
        </Card>

        {/* Editable details */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">My Details</CardTitle>
            <CardDescription>
              These appear on the forms and reports you author.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-5"
                >
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Juan Dela Cruz" {...field} />
                        </FormControl>
                        <FormDescription>
                          Used as your name on class records, COT forms, and
                          printed reports.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Teacher III, Master Teacher I"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Your DepEd rank. Classroom observation forms suggest
                          your career stage from this, so keep it current after a
                          promotion.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="employee_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employee ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Number</FormLabel>
                        <FormControl>
                          <Input placeholder="09XXXXXXXXX" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      disabled={saving || !form.formState.isDirty}
                    >
                      {saving && (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      )}
                      Save Changes
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={saving || !form.formState.isDirty}
                      onClick={() => loadProfile()}
                    >
                      Discard
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
