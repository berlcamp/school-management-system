/**
 * Constants & helpers for the Learner Cardex — Parent/Guardian Communication log.
 */
import type { CardexCommMode } from "@/types";

export const CARDEX_COMM_MODES: { value: CardexCommMode; label: string }[] = [
  { value: "phone_call", label: "Phone Call" },
  { value: "text_sms", label: "Text / SMS" },
  { value: "messenger", label: "Messenger / Chat" },
  { value: "home_visit", label: "Home Visit" },
  { value: "conference", label: "Conference" },
  { value: "letter", label: "Letter" },
  { value: "other", label: "Other" },
];

export function cardexCommModeLabel(mode: string | null | undefined): string {
  if (!mode) return "—";
  return CARDEX_COMM_MODES.find((m) => m.value === mode)?.label ?? mode;
}
