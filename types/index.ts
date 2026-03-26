import { RootState as RootStateType } from "@/lib/redux";

export type RootState = RootStateType;

export interface User {
  id: string;
  user_id: string;
  name: string;
  password: string;
  email?: string;
  employee_id?: string;
  type?: string;
  school_id?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface AddUserFormValues {
  name: string;
  email: string;
  type: string;
  is_active: boolean;
}

export type {
  Barangay,
  Book,
  BookAllocation,
  BookIssuance,
  BookReturnCode,
  DoctorItem,
  DocumentTracker,
  Enrollment,
  EnrollmentLifecycleStatus,
  FamilyCompositionItem,
  Form137Request,
  Grade,
  Hospital,
  LearnerHealth,
  Lot,
  LotItem,
  LrnLookupResult,
  MedicalAssistance,
  PurchaseOrder,
  RecordRequest,
  RecordRequestStatus,
  Room,
  School,
  Section,
  SectionStudent,
  SectionSubject,
  SectionType,
  Student,
  StudentEntryMode,
  StudentSubject,
  Subject,
  SubjectAssignment,
  SubjectSchedule,
} from "./database";
