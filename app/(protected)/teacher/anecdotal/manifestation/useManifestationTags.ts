"use client";

import { supabase } from "@/lib/supabase/client";
import type {
  ManifestationIntervention,
  ManifestationTag,
  ManifestationTagItem,
} from "@/types";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

/** A learner's tagging record with everything the roster row needs to render. */
export interface TagBundle {
  tag: ManifestationTag;
  items: ManifestationTagItem[];
  interventions: ManifestationIntervention[];
}

/**
 * Loads the manifestation tagging records for a set of learners in a school
 * year, together with their tagged manifestations and interventions.
 *
 * Keyed by student id (string) because the roster comes from
 * `useAdvisoryLearners`, which is student-centric — most learners have no tag,
 * and the page renders the whole roster either way.
 */
export function useManifestationTags(
  studentIds: string[],
  schoolYear: string,
) {
  const [bundles, setBundles] = useState<Map<string, TagBundle>>(new Map());
  const [loading, setLoading] = useState(false);

  // Stable dependency: the hook re-runs when the roster contents change, not
  // when useAdvisoryLearners hands back a new array with the same learners.
  const idKey = [...studentIds].sort().join(",");

  const load = useCallback(async () => {
    const ids = idKey ? idKey.split(",") : [];
    if (ids.length === 0 || !schoolYear) {
      setBundles(new Map());
      return;
    }
    setLoading(true);
    try {
      const { data: tagRows, error: tagErr } = await supabase
        .from("sms_manifestation_tags")
        .select("*")
        .in("student_id", ids.map(Number))
        .eq("school_year", schoolYear);
      if (tagErr) throw new Error(tagErr.message);

      const tags = (tagRows || []) as ManifestationTag[];
      if (tags.length === 0) {
        setBundles(new Map());
        return;
      }

      const tagIds = tags.map((t) => Number(t.id));

      const [itemsRes, intervRes] = await Promise.all([
        supabase
          .from("sms_manifestation_tag_items")
          .select("*")
          .in("tag_id", tagIds),
        supabase
          .from("sms_manifestation_interventions")
          .select("*")
          .in("tag_id", tagIds)
          .order("intervention_date", { ascending: false }),
      ]);
      if (itemsRes.error) throw new Error(itemsRes.error.message);
      if (intervRes.error) throw new Error(intervRes.error.message);

      const itemsByTag = new Map<string, ManifestationTagItem[]>();
      for (const item of (itemsRes.data || []) as ManifestationTagItem[]) {
        const key = String(item.tag_id);
        const list = itemsByTag.get(key);
        if (list) list.push(item);
        else itemsByTag.set(key, [item]);
      }

      const intervByTag = new Map<string, ManifestationIntervention[]>();
      for (const iv of (intervRes.data || []) as ManifestationIntervention[]) {
        const key = String(iv.tag_id);
        const list = intervByTag.get(key);
        if (list) list.push(iv);
        else intervByTag.set(key, [iv]);
      }

      setBundles(
        new Map(
          tags.map((tag) => [
            String(tag.student_id),
            {
              tag,
              items: itemsByTag.get(String(tag.id)) ?? [],
              interventions: intervByTag.get(String(tag.id)) ?? [],
            },
          ]),
        ),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load tagging records.",
      );
      setBundles(new Map());
    } finally {
      setLoading(false);
    }
  }, [idKey, schoolYear]);

  useEffect(() => {
    load();
  }, [load]);

  return { bundles, loading, reload: load };
}
