"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getStudentSession, type StudentSessionPayload } from "./actions";

interface StudentSessionContextValue {
  session: StudentSessionPayload | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const StudentSessionContext = createContext<StudentSessionContextValue | null>(
  null,
);

export function StudentSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StudentSessionPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const s = await getStudentSession();
    setSession(s);
  }, []);

  useEffect(() => {
    getStudentSession().then((s) => {
      setSession(s);
      setIsLoading(false);
    });
  }, []);

  return (
    <StudentSessionContext.Provider value={{ session, isLoading, refresh }}>
      {children}
    </StudentSessionContext.Provider>
  );
}

export function useStudentSession() {
  const ctx = useContext(StudentSessionContext);
  if (!ctx) {
    throw new Error("useStudentSession must be used within StudentSessionProvider");
  }
  return ctx;
}
