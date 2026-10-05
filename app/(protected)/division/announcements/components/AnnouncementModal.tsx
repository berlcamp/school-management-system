"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ALL_SCHOOLS,
  SchoolFilter,
} from "@/components/division-reports/SchoolFilter";
import { supabase } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export const PROFILE_SPECIALIZATION_LINK = "/profile#specialization";

export type Audience = "all" | "teachers" | "school_heads";

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: "All employees",
  teachers: "Teachers only",
  school_heads: "School heads only",
};

export interface AnnouncementRow {
  id: number;
  title: string;
  body: string;
  audience: Audience;
  school_id: number | null;
  link_path: string | null;
  created_at: string;
  archived_at: string | null;
}

type LinkChoice = "none" | "specialization" | "custom";

const linkChoiceOf = (path: string | null): LinkChoice =>
  !path ? "none" : path === PROFILE_SPECIALIZATION_LINK ? "specialization" : "custom";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData: AnnouncementRow | null;
}

export function AnnouncementModal({ isOpen, onClose, onSaved, editData }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [schoolId, setSchoolId] = useState<string>(ALL_SCHOOLS);
  const [linkChoice, setLinkChoice] = useState<LinkChoice>("specialization");
  const [customPath, setCustomPath] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(editData?.title ?? "Update your specialization");
    setBody(
      editData?.body ??
        "Please open My Profile and fill in your Specialization: your college major, your graduate major, and your specialization at DepEd.",
    );
    setAudience(editData?.audience ?? "all");
    setSchoolId(editData?.school_id != null ? String(editData.school_id) : ALL_SCHOOLS);
    const choice = editData ? linkChoiceOf(editData.link_path) : "specialization";
    setLinkChoice(choice);
    setCustomPath(choice === "custom" ? (editData?.link_path ?? "") : "");
  }, [isOpen, editData]);

  const linkPath =
    linkChoice === "none"
      ? null
      : linkChoice === "specialization"
        ? PROFILE_SPECIALIZATION_LINK
        : customPath.trim() || null;

  const save = async () => {
    if (saving) return;
    if (!title.trim() || !body.trim()) {
      toast.error("Title and message are required.");
      return;
    }
    if (linkChoice === "custom" && (!linkPath || !linkPath.startsWith("/") || linkPath.startsWith("//"))) {
      toast.error("A link must be a page in this system, starting with /.");
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      body: body.trim(),
      audience,
      school_id: schoolId === ALL_SCHOOLS ? null : Number(schoolId),
      link_path: linkPath,
    };
    const { error } = editData
      ? await supabase.from("sms_announcements").update(payload).eq("id", editData.id)
      : await supabase.from("sms_announcements").insert(payload);
    setSaving(false);
    if (error) {
      console.error("Failed to save announcement:", error);
      toast.error("Failed to save the announcement.");
      return;
    }
    toast.success(editData ? "Announcement updated." : "Announcement posted.");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Announcement" : "New Announcement"}</DialogTitle>
          <DialogDescription>
            Appears in the notification bell of every employee it is addressed to.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Title</Label>
            <Input id="ann-title" value={title} maxLength={150}
              onChange={(e) => setTitle(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Message</Label>
            <Textarea id="ann-body" rows={5} value={body}
              onChange={(e) => setBody(e.target.value)} disabled={saving} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Send to</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)} disabled={saving}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                    <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <SchoolFilter value={schoolId} onChange={setSchoolId} allowAll label="School" />
          </div>
          <div className="space-y-1.5">
            <Label>Link</Label>
            <Select value={linkChoice} onValueChange={(v) => setLinkChoice(v as LinkChoice)} disabled={saving}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No link</SelectItem>
                <SelectItem value="specialization">My Profile → Specialization</SelectItem>
                <SelectItem value="custom">Another page…</SelectItem>
              </SelectContent>
            </Select>
            {linkChoice === "custom" && (
              <Input placeholder="/teacher/grades" value={customPath}
                onChange={(e) => setCustomPath(e.target.value)} disabled={saving} />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {editData ? "Save" : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
