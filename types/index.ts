import { RootState as RootStateType } from "@/lib/redux";

export type RootState = RootStateType;

export interface User {
  id: string;
  user_id: string;
  name: string;
  password: string;
  email?: string;
  employee_id?: string;
  position?: string | null;
  type?: string;
  school_id?: string | null;
  staff_category_code?: string | null;
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
  Evaluation,
  EvaluationQuestion,
  EvaluationRespondentType,
  EvaluationResponse,
  EvaluationType,
  BookAllocation,
  BookIssuance,
  BookReturnCode,
  DoctorItem,
  DocumentTracker,
  EccdAssessment,
  EccdCompetency,
  EccdDomain,
  EccdPeriod,
  EccdScaleScore,
  Enrollment,
  EnrollmentLifecycleStatus,
  FamilyCompositionItem,
  Grade,
  Hospital,
  LearnerHealth,
  Lot,
  LotItem,
  LrnLookupResult,
  MPSEntry,
  MedicalAssistance,
  PurchaseOrder,
  RecordRequest,
  RecordRequestStatus,
  ClassSizeStandard,
  Room,
  RoomCondition,
  School,
  StaffCategory,
  StaffCategoryCode,
  Section,
  SectionSubject,
  SectionType,
  Student,
  StudentEntryMode,
  StudentSubject,
  Subject,
  SubjectSchedule,
} from "./database";
