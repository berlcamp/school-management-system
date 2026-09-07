"use client";

import { SidebarContext } from "@/components/ui/sidebar";
import { useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Wide-screen mode for the class record: collapse the app sidebar so the grid
 * gets the whole viewport, without going into browser fullscreen.
 *
 * The class record is the one page in the system that is reliably wider than
 * the screen -- a term can carry twenty-odd assessment columns plus the six
 * computed ones -- so the horizontal scroll is constant and the 15rem sidebar
 * is the cheapest thing to give up.
 *
 * `useSidebar()` is deliberately not used: it THROWS when there is no
 * provider, and the agent branch of the protected layout renders none. Reading
 * the context directly degrades to a no-op instead of white-screening a page
 * that otherwise works.
 *
 * What is restored on the way out is whatever the sidebar was BEFORE wide mode,
 * not a hardcoded "open" -- a teacher who keeps it collapsed keeps it
 * collapsed. Restoring also happens on unmount, so navigating away mid-session
 * does not strand them without a sidebar.
 */
export function useWideScreen() {
  const sidebar = useContext(SidebarContext);
  const [wide, setWide] = useState(false);

  /** What to put the sidebar back to; null when wide mode is off. */
  const restoreTo = useRef<boolean | null>(null);

  // Kept in a ref so the unmount cleanup calls the CURRENT setter: setOpen is
  // rebuilt whenever `open` changes, and the cleanup closes over mount-time
  // values. Assigned in an effect rather than during render, which would be an
  // impure write.
  const setOpenRef = useRef<((open: boolean) => void) | undefined>(undefined);
  useEffect(() => {
    setOpenRef.current = sidebar?.setOpen;
  }, [sidebar?.setOpen]);

  const toggle = useCallback(() => {
    if (wide) {
      if (restoreTo.current !== null) sidebar?.setOpen(restoreTo.current);
      restoreTo.current = null;
      setWide(false);
      return;
    }
    restoreTo.current = sidebar?.open ?? true;
    sidebar?.setOpen(false);
    setWide(true);
  }, [wide, sidebar]);

  useEffect(
    () => () => {
      if (restoreTo.current !== null) setOpenRef.current?.(restoreTo.current);
    },
    []
  );

  return {
    wide,
    toggle,
    /** False where there is no sidebar to hide, so the button can stay hidden. */
    available: sidebar !== null,
  };
}
