"use client";

import { Button } from "@/components/ui/button";
import { HELPDESK_CATEGORIES } from "@/lib/constants/helpdesk";
import { submitPublicConcern } from "@/lib/helpdesk/publicActions";
import { Check, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

type Fields = "name" | "email" | "contact" | "school_office" | "category" | "subject" | "body";
const empty: Record<Fields, string> = {
  name: "",
  email: "",
  contact: "",
  school_office: "",
  category: "",
  subject: "",
  body: "",
};

function check(v: Record<Fields, string>): Partial<Record<Fields, string>> {
  const e: Partial<Record<Fields, string>> = {};
  if (!v.name.trim()) e.name = "Enter your name.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) e.email = "Enter a valid email address.";
  if (!v.category) e.category = "Choose a category.";
  if (v.subject.trim().length < 5) e.subject = "Subject must be 5 to 150 characters.";
  if (!v.body.trim()) e.body = "Describe your concern.";
  return e;
}

const fieldClass =
  "mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-600";

export function PublicContactForm() {
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const honeypot = useRef<HTMLInputElement>(null);
  const startedAt = useRef(0);
  const fieldsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const set = (field: Fields) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = check(values);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) {
      fieldsRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSubmitting(true);
    const result = await submitPublicConcern({
      ...values,
      website: honeypot.current?.value ?? "",
      started_at: startedAt.current,
    }).catch(() => null);
    setSubmitting(false);

    if (!result || !result.ok) {
      if (result && !result.ok && result.reset) startedAt.current = Date.now();
      setServerError(
        result && !result.ok
          ? result.error
          : "Could not send your concern. Check your connection and try again.",
      );
      return;
    }
    setDone(result.reference_code);
  };

  if (done) {
    return (
      <div className="text-center" role="status">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-6 w-6 text-emerald-700" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Concern sent</h2>
        <p className="mt-2 text-sm text-gray-700">Your reference code:</p>
        <div className="mt-2 inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2">
          <span className="font-mono text-lg font-semibold tracking-wider">{done}</span>
          <button
            type="button"
            aria-label="Copy reference code"
            onClick={() => {
              void navigator.clipboard.writeText(done);
              setCopied(true);
            }}
            className="rounded p-1 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <p className="mx-auto mt-3 max-w-md text-sm text-gray-700">
          Write this code down or take a screenshot. Replies are not emailed: come back to the
          status page and enter this code with {values.email.trim()} to read them and reply.
        </p>
        <Link href={`/contact/status?code=${encodeURIComponent(done)}`}>
          <Button className="mt-4">Check status</Button>
        </Link>
      </div>
    );
  }

  const field = (id: Fields, label: string, input: ReactNode, hint?: string) => (
    <div>
      <label htmlFor={`c-${id}`} className="text-sm font-medium text-gray-800">
        {label}
      </label>
      {input}
      {hint && !errors[id] && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {errors[id] && (
        <p id={`c-${id}-error`} role="alert" className="mt-1 text-xs text-red-700">
          {errors[id]}
        </p>
      )}
    </div>
  );
  const a11y = (id: Fields) => ({
    id: `c-${id}`,
    "aria-invalid": !!errors[id],
    "aria-describedby": errors[id] ? `c-${id}-error` : undefined,
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      <p className="text-sm text-gray-700">
        Ask a question or report a problem to the division office. You’ll get a reference code to
        follow the replies.
      </p>
      <p className="text-xs text-gray-600">
        Have an account? <Link href="/login" className="text-blue-700 underline">Sign in</Link> and
        use Help Desk in the menu to attach screenshots and follow replies there.
      </p>

      <div ref={fieldsRef} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "Full name", <input {...a11y("name")} autoComplete="name" maxLength={150} value={values.name} onChange={set("name")} className={fieldClass} />)}
          {field("email", "Email", <input {...a11y("email")} type="email" autoComplete="email" maxLength={254} value={values.email} onChange={set("email")} className={fieldClass} />)}
          {field("contact", "Contact no. (optional)", <input {...a11y("contact")} type="tel" autoComplete="tel" maxLength={50} value={values.contact} onChange={set("contact")} className={fieldClass} />)}
          {field("school_office", "School / Office (optional)", <input {...a11y("school_office")} maxLength={150} value={values.school_office} onChange={set("school_office")} className={fieldClass} />)}
        </div>
        {field(
          "category",
          "Category",
          <select {...a11y("category")} value={values.category} onChange={set("category")} className={fieldClass}>
            <option value="">Choose…</option>
            {HELPDESK_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>,
        )}
        {field("subject", "Subject", <input {...a11y("subject")} maxLength={150} value={values.subject} onChange={set("subject")} className={fieldClass} />)}
        {field(
          "body",
          "Message",
          <textarea {...a11y("body")} rows={6} maxLength={5000} value={values.body} onChange={set("body")} className={fieldClass} />,
          `${values.body.length}/5000`,
        )}
      </div>

      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        {/* Not named like a real field, so password managers and browser autofill leave it empty. */}
        <label htmlFor="c-hp-url">Leave this empty</label>
        <input
          ref={honeypot}
          id="c-hp-url"
          name="hp_url"
          type="text"
          tabIndex={-1}
          autoComplete="new-password"
          data-lpignore="true"
          data-1p-ignore="true"
        />
      </div>

      {serverError && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitting ? "Sending…" : "Send concern"}
      </Button>
      <p className="text-xs text-gray-600">
        Already sent one?{" "}
        <Link href="/contact/status" className="text-blue-700 underline">
          Check its status
        </Link>
        .
      </p>
    </form>
  );
}
