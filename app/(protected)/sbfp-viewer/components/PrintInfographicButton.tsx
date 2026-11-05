"use client";

import { Button } from "@/components/ui/button";
import type { SbfpInfographicInput } from "@/lib/pdf/generateSbfpInfographic";
import { Loader2, Printer } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

/** Prints what the dashboard is showing now, filters included, as a one-page PDF. */
export function PrintInfographicButton({
  input,
  disabled,
}: {
  input: SbfpInfographicInput;
  disabled?: boolean;
}) {
  const [printing, setPrinting] = useState(false);

  const handleClick = async () => {
    setPrinting(true);
    try {
      // jsPDF stays out of the page's bundle until someone asks for the file.
      const { printSbfpInfographic } = await import("@/lib/pdf/generateSbfpInfographic");
      await printSbfpInfographic(input);
    } catch (err) {
      console.error("Error generating the SBFP infographic:", err);
      toast.error("The infographic could not be generated. Please try again.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Button type="button" className="h-11" onClick={handleClick} disabled={disabled || printing}>
      {printing ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Printer className="h-4 w-4" aria-hidden="true" />
      )}
      {printing ? "Preparing PDF..." : "Print infographic"}
    </Button>
  );
}
