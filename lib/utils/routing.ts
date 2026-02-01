import { supabase } from "@/lib/supabase/client";

/**
 * Generate routing number for a document type
 * Format: {document_type}-{sequential_number}
 * Example: "Letter-1023"
 */
export async function generateRoutingNumber(
  documentType: string,
): Promise<number> {
  const currentYear = new Date().getFullYear();

  // Try to get existing sequence for this document type and year
  const { data: existing, error: fetchError } = await supabase
    .from("adm_routing_sequences")
    .select("*")
    .eq("document_type", documentType)
    .eq("year", currentYear)
    .maybeSingle();

  if (fetchError && fetchError.code !== "PGRST116") {
    // PGRST116 is "not found" error, which is expected for new types
    throw new Error(`Failed to fetch routing sequence: ${fetchError.message}`);
  }

  if (existing) {
    // Increment existing sequence
    const newSequence = existing.current_sequence + 1;
    const { error: updateError } = await supabase
      .from("adm_routing_sequences")
      .update({ current_sequence: newSequence })
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(
        `Failed to update routing sequence: ${updateError.message}`,
      );
    }

    return newSequence;
  } else {
    // Create new sequence record
    const { data: newRecord, error: insertError } = await supabase
      .from("adm_routing_sequences")
      .insert({
        document_type: documentType,
        current_sequence: 1,
        year: currentYear,
      })
      .select()
      .single();

    if (insertError || !newRecord) {
      throw new Error(
        `Failed to create routing sequence: ${insertError?.message || "Unknown error"}`,
      );
    }

    return 1;
  }
}

/**
 * Generate routing slip number
 * Format: {document_type}-{routing_number}
 * Example: "Letter-1023"
 */
export async function generateRoutingSlipNo(
  documentType: string,
): Promise<string> {
  const routingNo = await generateRoutingNumber(documentType);
  return `${documentType}-${routingNo}`;
}

/**
 * Get user's office name from office settings
 */
export async function getUserOffice(userId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("adm_office_settings")
    .select("office_name")
    .eq("user_id", userId)
    .eq("module_name", "document_tracker")
    .maybeSingle();

  if (error) {
    console.error("Error fetching user office:", error);
    return null;
  }

  return data?.office_name || null;
}

/**
 * Extract office name from routing location string
 * Examples:
 * - "Forwarded to OCM" -> "OCM"
 * - "Received at OCM" -> "OCM"
 */
export function extractOfficeName(location: string): string | null {
  if (!location) return null;

  // Remove "Forwarded to " or "Received at " prefix
  const cleaned = location
    .replace(/^Forwarded to /i, "")
    .replace(/^Received at /i, "")
    .trim();

  return cleaned || null;
}
