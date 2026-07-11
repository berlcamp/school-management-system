"use client";

/**
 * Renders its children into a portal on document.body so printed content sits
 * outside the Radix Dialog (which is position:fixed + transform-centered, which
 * would otherwise push an absolutely-positioned print area off the page).
 *
 * The portal is hidden on screen and revealed only in print via the
 * `.print-portal` + `#<id>` rules in globals.css.
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function PrintPortal({ id, children }: { id: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div id={id} className="print-portal bg-white">
      {children}
    </div>,
    document.body,
  );
}
