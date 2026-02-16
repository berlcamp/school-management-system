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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useGpaThresholds } from "@/hooks/useGpaThresholds";
import { useAppSelector } from "@/lib/redux/hook";
import { GpaThresholds } from "@/lib/utils/gpaThresholds";
import { SectionType } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  heterogeneous: "Heterogeneous",
  homogeneous_fast_learner: "Homogeneous - Fast learner",
  homogeneous_crack_section: "Homogeneous - Crack section",
  homogeneous_random: "Homogeneous - Random",
};

const FormSchema = z.object({
  homogeneous_fast_learner_min: z
    .number()
    .min(0, "Must be 0-100")
    .max(100, "Must be 0-100"),
  homogeneous_crack_section_max: z
    .number()
    .min(0, "Must be 0-100")
    .max(100, "Must be 0-100"),
  heterogeneous_enabled: z.boolean(),
  homogeneous_random_enabled: z.boolean(),
});

type FormType = z.infer<typeof FormSchema>;

interface GpaThresholdModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GpaThresholdModal = ({ isOpen, onClose }: GpaThresholdModalProps) => {
  const user = useAppSelector((state) => state.user.user);
  const { thresholds, isLoading, save } = useGpaThresholds(
    isOpen,
    user?.school_id
  );
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      homogeneous_fast_learner_min: 90,
      homogeneous_crack_section_max: 75,
      heterogeneous_enabled: true,
      homogeneous_random_enabled: true,
    },
  });

  useEffect(() => {
    if (isOpen && !isLoading) {
      form.reset({
        homogeneous_fast_learner_min: thresholds.homogeneous_fast_learner.minGpa,
        homogeneous_crack_section_max: thresholds.homogeneous_crack_section.maxGpa,
        heterogeneous_enabled: thresholds.heterogeneous,
        homogeneous_random_enabled: thresholds.homogeneous_random,
      });
    }
  }, [isOpen, isLoading, thresholds, form]);

  const onSubmit = async (data: FormType) => {
    if (isSaving) return;
    setIsSaving(true);
    const newThresholds: GpaThresholds = {
      homogeneous_fast_learner: { minGpa: data.homogeneous_fast_learner_min },
      homogeneous_crack_section: { maxGpa: data.homogeneous_crack_section_max },
      heterogeneous: data.heterogeneous_enabled,
      homogeneous_random: data.homogeneous_random_enabled,
    };
    const result = await save(newThresholds);
    setIsSaving(false);
    if (result.success) {
      toast.success("GPA thresholds saved.");
      onClose();
    } else {
      toast.error(result.error ?? "Failed to save thresholds.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                GPA Section Thresholds
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Configure GPA thresholds for section types. When adding enrollment
                (e.g., Grade 7), the student&apos;s previous grade GPA (Grade 6) is used
                to filter which section types they qualify for.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6"
          >
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="homogeneous_fast_learner_min"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      {SECTION_TYPE_LABELS.homogeneous_fast_learner}
                    </FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">
                          Min GPA:
                        </span>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                          className="w-24"
                        />
                        <span className="text-muted-foreground text-xs">
                          (show if GPA ≥)
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="homogeneous_crack_section_max"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      {SECTION_TYPE_LABELS.homogeneous_crack_section}
                    </FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">
                          Max GPA:
                        </span>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                          className="w-24"
                        />
                        <span className="text-muted-foreground text-xs">
                          (show if GPA &lt;)
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="heterogeneous_enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <FormLabel className="text-sm font-medium">
                        {SECTION_TYPE_LABELS.heterogeneous}
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Always show (no GPA filter)
                      </p>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="homogeneous_random_enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <FormLabel className="text-sm font-medium">
                        {SECTION_TYPE_LABELS.homogeneous_random}
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Always show (no GPA filter)
                      </p>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="gap-3 pt-4 sm:gap-0">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || isSaving}>
                {isSaving ? "Saving..." : isLoading ? "Loading..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
