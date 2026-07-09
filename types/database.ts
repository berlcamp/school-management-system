/**
 * Database Type Definitions
 */

export interface User {
  id: string;
  user_id: string; // Supabase Auth user ID
  school_id?: string | null;
  name: string;
  email: string;
  phone?: string;
  position?: string;
  employee_id?: string;
  type?:
    | "school_head"
    | "teacher"
    | "registrar"
    | "admin"
    | "super admin"
    | "division_admin"
    | "division_type"
    | "librarian"
    | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// BARANGAYS
// ============================================================================

export interface Barangay {
  id: string;
  barangay: string | null;
  municipality: string | null;
}

// ============================================================================
// HOSPITALS
// ============================================================================

export interface Hospital {
  id: string;
  name: string;
  address: string | null;
  hospital_director: string | null;
  position: string | null;
  full_hospital_name: string | null;
  greeting_name: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

// ============================================================================
// MEDICAL ASSISTANCE
// ============================================================================

export interface FamilyCompositionItem {
  fullname: string;
  category: string;
  remarks: string;
}

export interface DoctorItem {
  doctor_name: string;
  professional_fee: number;
}

export interface MedicalAssistance {
  id: string;
  hospital_id: string;
  hospital_name?: string; // For backward compatibility/joins
  total_bill_amount: number;
  philhealth_granted_amount: number | null;
  room_type?: string | null;
  diagnosis?: string | null;
  remarks?: string | null;
  reason_not_ward?: string | null;
  reason_not_mhars?: string | null;
  patient_fullname: string;
  patient_barangay_id: string;
  patient_address?: string; // For backward compatibility/joins
  patient_age_value: number;
  patient_age_unit: "years" | "months" | "days";
  patient_age?: number; // For backward compatibility
  patient_gender: string;
  patient_service_provider?: string | null;
  patient_category?: string | null;
  patient_contact_number?: string | null;
  patient_ap?: boolean | null;
  requester_fullname: string;
  requester_barangay_id: string;
  requester_address?: string; // For backward compatibility/joins
  requester_age_value: number;
  requester_age_unit: "years" | "months" | "days";
  requester_age?: number; // For backward compatibility
  requester_gender: string;
  requester_service_provider?: string | null;
  requester_category?: string | null;
  requester_contact_number?: string | null;
  requester_ap?: boolean | null;
  requester_relationship?: string | null;
  family_composition?: FamilyCompositionItem[] | null;
  doctors?: DoctorItem[] | null;
  status:
    | "pending"
    | "for evaluation"
    | "approved"
    | "rejected"
    | "processing"
    | "completed"
    | "endorsed to hor"
    | "endorsed to lgu";
  access_type: "LGU" | "HOR" | "LGU_TO_HOR" | "HOR_TO_LGU";
  lgu_amount?: number | null;
  maifip_amount?: number | null;
  dswd_amount?: number | null;
  lgu_gl_no?: number | null;
  maifip_gl_no?: number | null;
  dswd_gl_no?: number | null;
  date_approved?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export type NotificationType =
  | "approval_request"
  | "approval_approved"
  | "approval_rejected"
  | "approval_returned"
  | "delivery_received"
  | "inspection_completed"
  | "payment_forwarded"
  | "system_alert";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  entity_type?: string | null;
  entity_id?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

// ============================================================================
// MEDICAL ASSISTANCE ACTIVITY LOG
// ============================================================================

export interface MedicalAssistanceActivityLog {
  id: string;
  medical_assistance_id: string;
  user_id: string;
  action:
    | "created"
    | "endorsed_to_hor"
    | "endorsed_to_lgu"
    | "approved"
    | "updated"
    | "rejected";
  description: string | null;
  created_at: string;
}

// ============================================================================
// DOCUMENT TRACKER
// ============================================================================

export interface DocumentTracker {
  id: string;
  type: string | null;
  particulars: string | null;
  status: string | null;
  activity_date: string | null;
  user_id: string | null;
  date_received: string | null;
  requester: string | null;
  attachments: Record<string, unknown> | null;
  specify: string | null;
  location: string | null;
  archived: boolean | null;
  amount: string | null;
  received_from: string | null;
  received_by: string | null;
  routing_no: number | null;
  routing_slip_no: string | null;
  time_received: string | null;
  agency: string | null;
  contact_number: string | null;
  cheque_no: string | null;
  created_at: string | null;
  recent_remarks: Record<string, unknown> | null;
}

export interface TrackerRemark {
  id: string;
  user_id: string | null;
  tracker_id: number | null;
  timestamp: string | null;
  user: string | null;
  remarks: string | null;
}

export interface TrackerRoute {
  id: string;
  date: string;
  time: string | null;
  user: string | null;
  title: string | null;
  tracker_id: number | null;
  user_id: string | null;
  message: Record<string, unknown> | null;
}

// ============================================================================
// OFFICE SETTINGS
// ============================================================================

export interface OfficeSetting {
  id: string;
  user_id: number;
  office_name: string;
  module_name: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// ROUTING SEQUENCES
// ============================================================================

export interface RoutingSequence {
  id: string;
  document_type: string;
  current_sequence: number;
  year: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// PURCHASE ORDERS
// ============================================================================

export interface LotItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
}

export interface Lot {
  lot_number: string;
  description: string;
  items: LotItem[];
}

export interface PurchaseOrder {
  id: string;
  pr_number: string;
  date: string;
  status: "draft" | "approved";
  lots: Lot[];
  office_division?: string | null;
  purpose?: string | null;
  source_of_funds?: string | null;
  mode_of_procurement?: string | null;
  delivery_period?: string | null;
  delivery_location?: string | null;
  terms_of_payment?: string | null;
  particulars?: string | null;
  prepared_by_name?: string | null;
  prepared_by_position?: string | null;
  requester_name?: string | null;
  requester_position?: string | null;
  approver_name?: string | null;
  approver_position?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// SCHOOL MANAGEMENT SYSTEM
// ============================================================================

export type StaffType =
  | "school_head"
  | "teacher"
  | "registrar"
  | "admin"
  | "division_admin"
  | "division_type";

// ============================================================================
// SCHOOLS (DepEd division schools)
// ============================================================================

export interface School {
  id: string;
  school_id: string; // 6-digit DepEd School ID
  name: string;
  school_type?: string | null;
  address?: string | null;
  district?: string | null;
  region?: string | null;
  municipality_city?: string | null;
  barangay?: string | null;
  street?: string | null;
  email?: string | null;
  telephone_number?: string | null;
  mobile_number?: string | null;
  facebook_url?: string | null;
  twitter_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  principal_name?: string | null;
  principal_email?: string | null;
  principal_phone?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export type EnrollmentStatus =
  | "enrolled"
  | "transferred"
  | "graduated"
  | "dropped";
export type EnrollmentRequestStatus = "pending" | "approved" | "rejected";
export type EnrollmentLifecycleStatus =
  | "active"
  | "completed"
  | "transferred_out"
  | "dropped"
  | "pending_transfer"
  | "pending_review"
  | "retained"
  | "promoted"
  | "graduated";
export type RecordRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";
export type StudentEntryMode = "new" | "existing" | "transferee";
export type Gender = "male" | "female";

// ============================================================================
// SUBJECTS
// ============================================================================

export interface Subject {
  id: string;
  school_id?: string | null; // Foreign key → sms_schools.id
  code: string; // Unique subject code (e.g., "MATH-101")
  name: string;
  description?: string | null;
  grade_level: number; // 0=Kindergarten, 1-12
  subject_teacher_id?: string | null; // Foreign key → sms_users.id
  is_active: boolean;
  is_graded?: boolean; // When false, subject does not appear in Grade Entry module
  is_madrasah?: boolean; // When true, only selectively enrolled students take this subject
  created_at: string;
  updated_at: string;
}

// ============================================================================
// SECTIONS
// ============================================================================

export type SectionType =
  | "heterogeneous"
  | "homogeneous_fast_learner"
  | "homogeneous_crack_section"
  | "homogeneous_random";

export interface Section {
  id: string;
  school_id?: string | null; // Foreign key → sms_schools.id
  name: string; // Section name (e.g., "Grade 7-A")
  grade_level: number; // 0=Kindergarten, 1-12
  school_year: string; // e.g., "2024-2025"
  section_type?: SectionType | null;
  section_adviser_id?: string | null; // Foreign key → sms_users.id
  max_students?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// STUDENTS
// ============================================================================

export interface Student {
  id: string;
  school_id?: string | null; // Foreign key → sms_schools.id
  lrn: string; // DepEd Learner Reference Number (unique)
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  date_of_birth: string; // Date
  gender: Gender;
  mother_tongue?: string | null;
  ip_ethnic_group?: string | null;
  religion?: string | null;
  purok?: string | null;
  barangay?: string | null;
  municipality_city?: string | null;
  province?: string | null;
  contact_number?: string | null;
  email?: string | null;
  father_last_name?: string | null;
  father_first_name?: string | null;
  father_middle_name?: string | null;
  mother_last_name?: string | null;
  mother_first_name?: string | null;
  mother_middle_name?: string | null;
  guardian_last_name?: string | null;
  guardian_first_name?: string | null;
  guardian_middle_name?: string | null;
  parent_guardian_name?: string | null;
  parent_guardian_contact?: string | null;
  parent_guardian_relationship?: string | null;
  previous_school?: string | null;
  enrollment_status: EnrollmentStatus;
  current_section_id?: string | null; // Foreign key → sms_sections.id
  encoded_by?: string | null; // Foreign key → sms_users.id - user who added this student
  grade_level?: number | null; // Current grade level (0=Kindergarten, 1-12)
  enrollment_id?: string | null; // Foreign key → sms_enrollments.id
  enrolled_at?: string | null; // Timestamp
  diploma_file_path?: string | null; // Path in Supabase Storage
  birth_certificate_file_path?: string | null; // Path in Supabase Storage
  good_moral_file_path?: string | null; // Path in Supabase Storage
  created_at: string;
  updated_at: string;
}

// ============================================================================
// LEARNER HEALTH (DepEd SF8)
// ============================================================================

export interface LearnerHealth {
  id: string;
  student_id: string;
  section_id: string;
  school_year: string;
  height_cm: number | null;
  weight_kg: number | null;
  nutritional_status:
    | "underweight"
    | "normal"
    | "overweight"
    | "obese"
    | null;
  height_for_age:
    | "severely_stunted"
    | "stunted"
    | "normal"
    | "tall"
    | null;
  remarks: string | null;
  measured_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// SECTION SUBJECTS (Junction Table)
// ============================================================================

export interface SectionSubject {
  id: string;
  section_id: string; // Foreign key → sms_sections.id
  subject_id: string; // Foreign key → sms_subjects.id
  school_year: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// STUDENT SUBJECTS (Selective Enrollment - Madrasah)
// ============================================================================

export interface StudentSubject {
  id: string;
  student_id: string; // Foreign key → sms_students.id
  subject_id: string; // Foreign key → sms_subjects.id
  section_id: string; // Foreign key → sms_sections.id
  school_id: string; // Foreign key → sms_schools.id
  school_year: string;
  enrolled_at: string;
  enrolled_by?: string | null; // Foreign key → sms_users.id
  created_at: string;
  updated_at: string;
}

// ============================================================================
// GRADES
// ============================================================================

export interface Grade {
  id: string;
  student_id: string; // Foreign key → sms_students.id
  subject_id: string; // Foreign key → sms_subjects.id
  section_id: string; // Foreign key → sms_sections.id
  grading_period: number; // 1, 2, 3, or 4
  school_year: string;
  grade: number; // 0.00 to 100.00
  remarks?: string | null; // "Passed" | "Failed" | etc.
  teacher_id: string; // Foreign key → sms_users.id
  created_at: string;
  updated_at: string;
}

// ============================================================================
// ATTENDANCE
// ============================================================================

export interface Attendance {
  id: string;
  student_id: string; // Foreign key → sms_students.id
  section_id: string; // Foreign key → sms_sections.id
  school_id?: string | null; // Foreign key → sms_schools.id
  school_year: string;
  date: string; // YYYY-MM-DD
  status: "present" | "absent" | "tardy";
  recorded_by?: string | null; // Foreign key → sms_users.id
  created_at: string;
  updated_at: string;
}

// ============================================================================
// ENROLLMENTS
// ============================================================================

export interface Enrollment {
  id: string;
  school_id?: string | null; // Foreign key → sms_schools.id
  student_id: string; // Foreign key → sms_students.id
  section_id: string; // Foreign key → sms_sections.id
  school_year: string;
  grade_level: number; // 0=Kindergarten, 1-12
  semester?: number | null; // 1 | 2 for grade 11-12, null for 0-10
  enrollment_date: string; // Date
  status: EnrollmentRequestStatus;
  enrollment_status: EnrollmentLifecycleStatus; // Lifecycle: active, completed, transferred_out, etc.
  origin_school_id?: string | null; // FK → sms_schools.id — school student came from (for transfers)
  record_request_id?: string | null; // FK → sms_record_requests.id — linked transfer request
  date_dropped?: string | null; // Date student was dropped (NLIS)
  transfer_destination_school_id?: string | null; // FK → sms_schools.id (proactive transfer out)
  transfer_date?: string | null; // Effective date of transfer out
  enrolled_by: string; // Foreign key → sms_users.id
  approved_by?: string | null; // Foreign key → sms_users.id
  remarks?: string | null;
  created_at: string;
  updated_at: string;
}


// ============================================================================
// DOCUMENT REQUESTS (new — sms_requests table)
// ============================================================================

export type RequestStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "completed";

export type DocumentRequestType = "form137" | "diploma";
export type RequesterType = "school" | "parent" | "student";

export interface DocumentRequest {
  id: string;
  tracking_number: string;
  school_id?: string | null;
  request_type: DocumentRequestType;
  requester_type: RequesterType;
  requester_name: string;
  requester_contact: string;
  requester_email?: string | null;
  requester_relationship: string;
  student_name: string;
  student_lrn: string;
  student_id?: string | null;
  last_school_attended?: string | null;
  year_graduated?: string | null;
  purpose: string;
  status: RequestStatus;
  rejection_reason?: string | null;
  delivery_file_path?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  completed_by?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestAttachment {
  id: string;
  request_id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size?: number | null;
  uploaded_by?: string | null;
  category: "attachment" | "sf10_delivery";
  created_at: string;
}

export interface RequestLog {
  id: string;
  request_id: string;
  action:
    | "created"
    | "under_review"
    | "approved"
    | "rejected"
    | "completed"
    | "attachment_added";
  actor_name?: string | null;
  actor_id?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface DocumentRequestWithRelations extends DocumentRequest {
  student?: Student | null;
  attachments?: RequestAttachment[];
  logs?: RequestLog[];
}

// ============================================================================
// ROOMS
// ============================================================================

export type RoomCondition =
  | "good"
  | "needs_minor_repair"
  | "needs_major_repair"
  | "condemned";

export interface Room {
  id: string;
  school_id?: string | null; // Foreign key → sms_schools.id
  name: string; // Unique room name/code (e.g., "Room 101", "Lab A")
  building?: string | null;
  capacity?: number | null;
  room_type?: string | null; // "classroom", "laboratory", "library", "gym", etc.
  condition?: RoomCondition | null;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffCategory {
  id: string;
  code: string;
  label: string;
  is_teaching: boolean;
  sort_order: number;
  created_at?: string;
}

export type StaffCategoryCode =
  | "admin"
  | "utility"
  | "security"
  | "health"
  | "library"
  | "guidance"
  | "other"
  | "teacher";

export interface ClassSizeStandard {
  grade_level: number;
  max_students: number;
}

// ============================================================================
// SUBJECT SCHEDULES
// ============================================================================

export interface SubjectSchedule {
  id: string;
  subject_id: string; // Foreign key → sms_subjects.id
  section_id: string; // Foreign key → sms_sections.id
  teacher_id: string; // Foreign key → sms_users.id
  room_id: string; // Foreign key → sms_rooms.id
  school_id?: string | null; // Foreign key → sms_schools.id
  days_of_week: number[]; // Array of day numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
  start_time: string; // HH:mm format (e.g., "08:30")
  end_time: string; // HH:mm format (e.g., "10:15")
  school_year: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// BOOKS (DepEd SF3 - Books Issued and Returned)
// ============================================================================

export interface Book {
  id: string;
  school_id?: string | null; // Foreign key → sms_schools.id
  title: string;
  subject_area: string; // e.g. "English", "Mathematics"
  grade_level: number; // 1-12
  isbn?: string | null;
  quantity: number; // Total stock copies the school has
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type BookReturnCode = "FM" | "TDO" | "NEG";

export interface BookIssuance {
  id: string;
  student_id: string; // Foreign key → sms_students.id
  book_id: string; // Foreign key → sms_books.id
  section_id: string; // Foreign key → sms_sections.id
  school_id?: string | null; // Foreign key → sms_schools.id
  school_year: string;
  date_issued: string; // Date
  date_returned?: string | null; // Date - student returned to teacher
  returned_to_manager_at?: string | null; // When teacher returned to book manager
  condition_on_return?: string | null;
  return_code?: BookReturnCode | null; // FM=Force Majeure, TDO=Transferred/Dropout, NEG=Negligence
  remarks?: string | null;
  issued_by?: string | null; // Foreign key → sms_users.id
  created_at: string;
  updated_at: string;
  book?: Book;
  student?: Student;
  section?: Section;
}

// ============================================================================
// BOOK ALLOCATIONS (Book Manager → Teacher/Adviser)
// ============================================================================

export interface BookAllocation {
  id: string;
  school_id: string; // Foreign key → sms_schools.id
  teacher_id: string; // Foreign key → sms_users.id
  book_id: string; // Foreign key → sms_books.id
  quantity: number;
  school_year: string;
  created_at: string;
  updated_at: string;
  book?: Book;
  teacher?: User;
}

// ============================================================================
// HISTORICAL GRADES (for SF10 historical encoding)
// ============================================================================

export interface HistoricalGradeEntry {
  q1: number | null;
  q2: number | null;
  q3: number | null; // null for SHS semester records
  q4: number | null; // null for SHS semester records
}

export interface HistoricalGrades {
  id: string;
  student_id: string;
  school_id: string;
  grade_level: number;
  school_year: string;
  section_name: string;
  school_name: string;
  school_id_code: string;
  district: string;
  division: string;
  region: string;
  adviser_name: string;
  semester: number | null; // null for K-10; 1 or 2 for SHS
  track: string | null; // SHS only
  strand: string | null; // SHS only
  grades: Record<string, HistoricalGradeEntry>;
  general_average: number | null;
  encoded_by: string;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// RECORD REQUESTS (Inter-school student record transfers)
// ============================================================================

export interface RecordRequest {
  id: string;
  student_id: string; // FK → sms_students.id
  student_lrn: string;
  requesting_school_id: string; // FK → sms_schools.id — school requesting the record
  origin_school_id: string; // FK → sms_schools.id — school that has the record
  status: RecordRequestStatus;
  target_grade_level?: number | null; // Grade level the student will enroll in
  target_school_year?: string | null;
  requested_by: string; // FK → sms_users.id
  approved_by?: string | null; // FK → sms_users.id
  remarks?: string | null;
  rejection_reason?: string | null;
  record_access_granted: boolean;
  access_granted_at?: string | null;
  requested_at: string;
  responded_at?: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations (optional, populated by queries)
  student?: Student | null;
  requesting_school?: School | null;
  origin_school?: School | null;
}

// ============================================================================
// LRN LOOKUP RESULT (from lookup_student_by_lrn RPC)
// ============================================================================

// ============================================================================
// ECCD CHECKLIST (Kindergarten Assessment)
// ============================================================================

export type EccdPeriod = "1ST_SEM" | "2ND_SEM";

export interface EccdDomain {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EccdCompetency {
  id: string;
  domain_id: string;
  code: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EccdAssessment {
  id: string;
  student_id: string;
  competency_id: string;
  section_id: string;
  school_year: string;
  period: EccdPeriod;
  rating: 0 | 1 | null;
  assessed_by: string | null;
  school_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EccdScaleScore {
  id: string;
  domain_id: string;
  raw_score: number;
  scale_score: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// LRN LOOKUP RESULT (from lookup_student_by_lrn RPC)
// ============================================================================

// ============================================================================
// EVALUATIONS
// ============================================================================

export type EvaluationType = "student_to_teacher" | "teacher_to_principal" | "principal_to_teacher";
export type EvaluationRespondentType = "student" | "teacher" | "principal";

export interface Evaluation {
  id: string;
  school_id: string;
  title: string;
  description?: string | null;
  school_year: string;
  type: EvaluationType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EvaluationQuestion {
  id: string;
  evaluation_id: string;
  question_text: string;
  order_number: number;
  created_at: string;
  updated_at: string;
}

export interface EvaluationResponse {
  id: string;
  evaluation_id: string;
  question_id: string;
  respondent_type: EvaluationRespondentType;
  respondent_id: string;
  evaluatee_id: string;
  rating: number;
  school_year: string;
  school_id: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// MPS (Mean Percentage Score)
// ============================================================================

export interface MPSEntry {
  id: string;
  school_id: string;
  subject_id: string;
  section_id: string;
  grade_level: number;
  school_year: string;
  grading_period: number;
  mps: number;
  teacher_id: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// CLASS RECORD (DepEd 2026-2027 MATATAG, 3-term grading)
// ============================================================================

// Component groups in the class record.
//   WW = Written / Oral Works
//   PT = Product / Performance Tasks
//   ST = Summative Tests & Term Exams
export type ClassRecordComponent = "WW" | "PT" | "ST";

export interface ClassRecord {
  id: string;
  school_id: string;
  teacher_id: string;
  subject_id: string;
  section_id: string;
  school_year: string;
  grading_period: number; // 1-3 (1st/2nd/3rd Term)
  term_start: string | null;
  term_end: string | null;
  ww_weight: number;
  pt_weight: number;
  st_weight: number;
  use_transmutation: boolean;
  is_posted: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassRecordItem {
  id: string;
  class_record_id: string;
  component: ClassRecordComponent;
  label: string | null; // activity title ("click to edit")
  max_score: number;
  weight: number | null; // per-item weight % (ST fixed items only; NULL for WW/PT)
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ClassRecordScore {
  id: string;
  item_id: string;
  student_id: string;
  raw_score: number | null; // null = not yet entered
  created_at: string;
  updated_at: string;
}

// ============================================================================
// ASSESSMENTS — CRLA (Comprehensive Rapid Literacy Assessment, Grades 1-3)
// ============================================================================

export interface CrlaMaterial {
  id: string;
  title: string;
  grade_level: number;
  language: string; // English | Filipino | Mother Tongue
  phases: string[]; // BoSY | MoSY | EoSY; empty = any phase
  instructions: string | null;
  passage_title: string | null;
  passage_text: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrlaMaterialTask {
  id: string;
  material_id: string;
  label: string;
  task_type: string; // letters | words | sentences | passage
  items: string | null;
  file_url: string | null;
  file_name: string | null;
  max_score: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CrlaBand {
  id: string;
  material_id: string;
  min_score: number;
  max_score: number;
  label: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CrlaRecord {
  id: string;
  material_id: string;
  school_id: string;
  section_id: string;
  student_id: string;
  teacher_id: string | null;
  phase: string; // BoSY | MoSY | EoSY
  school_year: string;
  date_assessed: string | null;
  total_score: number | null;
  profile_label: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrlaRecordScore {
  id: string;
  record_id: string;
  task_id: string;
  raw_score: number | null; // null = not yet entered
  created_at: string;
  updated_at: string;
}

// --- CRLA Part 2: Record Form (Reading Fluency & Comprehension) --------------

export interface CrlaRecordForm {
  id: string;
  title: string;
  grade_level: number;
  language: string; // English | Filipino | Mother Tongue
  story_title: string | null;
  instructions: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrlaRecordFormLine {
  id: string;
  record_form_id: string;
  position: number;
  line_text: string;
  word_count: number;
  question: string | null;
  answer_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrlaRecordFormObservation {
  id: string;
  record_form_id: string;
  level_no: number; // 1-4
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CrlaRecordFormRecord {
  id: string;
  record_form_id: string;
  school_id: string;
  section_id: string;
  student_id: string;
  teacher_id: string | null;
  phase: string; // BoSY | MoSY | EoSY
  school_year: string;
  date_assessed: string | null;
  total_miscues: number | null;
  comprehension_correct: number | null;
  comprehension_total: number | null;
  observation_level: number | null; // 1-4
  observations_notes: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrlaRecordFormLineScore {
  id: string;
  record_id: string;
  line_id: string;
  miscues: number | null;
  answer_status: string | null; // correct | wrong | na
  created_at: string;
  updated_at: string;
}

// ============================================================================
// ASSESSMENTS — Phil-IRI (Philippine Informal Reading Inventory, Grades 3-10)
// ============================================================================

export interface PhilIriMaterial {
  id: string;
  title: string;
  grade_level: number;
  language: string; // English | Filipino
  set_label: string | null; // e.g. Set A / Set B
  passage_title: string | null;
  passage_text: string | null;
  word_count: number;
  instructions: string | null;
  file_url: string | null; // uploaded DepEd material (image / PDF)
  file_name: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PhilIriQuestion {
  id: string;
  material_id: string;
  question_no: number;
  question_text: string;
  correct_answer: string | null;
  question_type: string; // literal | inferential | critical
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PhilIriRecord {
  id: string;
  material_id: string;
  school_id: string;
  section_id: string;
  student_id: string;
  teacher_id: string | null;
  phase: string; // BoSY | MoSY | EoSY
  school_year: string;
  form_type: string; // screening | individual
  date_assessed: string | null;
  // GST screening scoresheet (STCRR / TPPK) — form_type = 'screening'
  test_taken: boolean | null;
  literal_correct: number | null; // out of 7
  inferential_correct: number | null; // out of 7
  critical_correct: number | null; // out of 6
  total_score: number | null; // out of 20
  screening_result: string | null; // ≥14 → no need; <14 → for Phil-IRI
  // Individual Record Form (3A / 3B) — form_type = 'individual'
  reading_time_seconds: number | null;
  reading_rate: number | null; // words per minute
  comprehension_raw: number | null; // correct responses
  comprehension_total: number | null; // number of questions
  miscue_counts: Record<string, number> | null; // per miscue-type counts
  comprehension_answers: Record<string, string> | null; // per-question answers
  miscues: number | null; // total miscues
  word_reading_score: number | null; // %
  comprehension_score: number | null; // %
  word_reading_level: string | null;
  comprehension_level: string | null;
  overall_reading_level: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface PhilIriAnswer {
  id: string;
  record_id: string;
  question_id: string;
  is_correct: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// ASSESSMENTS — RMA (Rapid Mathematics Assessment, Grades 1-10)
// ============================================================================

export interface RmaMaterial {
  id: string;
  title: string;
  grade_level: number;
  instructions: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RmaItem {
  id: string;
  material_id: string;
  item_no: number;
  domain: string | null;
  question_text: string | null;
  correct_answer: string | null;
  max_score: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface RmaBand {
  id: string;
  material_id: string;
  min_score: number; // percentage of total possible
  max_score: number;
  label: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface RmaRecord {
  id: string;
  material_id: string;
  school_id: string;
  section_id: string;
  student_id: string;
  teacher_id: string | null;
  phase: string; // BoSY | MoSY | EoSY
  school_year: string;
  date_assessed: string | null;
  total_score: number | null;
  mastery_label: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface RmaItemScore {
  id: string;
  record_id: string;
  item_id: string;
  raw_score: number | null; // null = not yet entered
  created_at: string;
  updated_at: string;
}

// ============================================================================
// LRN LOOKUP RESULT (from lookup_student_by_lrn RPC)
// ============================================================================

export interface LrnLookupResult {
  student_id: string;
  lrn: string;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  suffix?: string | null;
  date_of_birth: string;
  gender: string;
  current_school_id?: string | null;
  current_school_name?: string | null;
  current_grade_level?: number | null;
  current_school_year?: string | null;
  enrollment_status?: string | null;
}
