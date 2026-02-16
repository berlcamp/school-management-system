import { RootState as RootStateType } from "@/lib/redux";

export type RootState = RootStateType;

export interface User {
  id: string;
  user_id: string;
  name: string;
  password: string;
  email?: string;
  type?: string;
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
  DoctorItem,
  DocumentTracker,
  Enrollment,
  FamilyCompositionItem,
  Form137Request,
  Grade,
  Hospital,
  Lot,
  LotItem,
  MedicalAssistance,
  PurchaseOrder,
  Room,
  Section,
  SectionStudent,
  SectionSubject,
  SectionType,
  Student,
  Subject,
  SubjectAssignment,
  SubjectSchedule,
} from "./database";
