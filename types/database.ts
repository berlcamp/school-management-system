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
  | "division_admin";

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
  email?: string | null;
  telephone_number?: string | null;
  mobile_number?: string | null;
  facebook_url?: string | null;
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
export type Form137RequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed";
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
  created_at: string;
  updated_at: string;
}

// ============================================================================
// SECTION STUDENTS (Junction Table)
// ============================================================================

export interface SectionStudent {
  id: string;
  section_id: string; // Foreign key → sms_sections.id
  student_id: string; // Foreign key → sms_students.id
  school_year: string;
  enrolled_at: string; // Timestamp
  transferred_at?: string | null; // Timestamp
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
  enrollment_date: string; // Date
  status: EnrollmentRequestStatus;
  enrolled_by: string; // Foreign key → sms_users.id
  approved_by?: string | null; // Foreign key → sms_users.id
  remarks?: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// FORM 137 REQUESTS
// ============================================================================

export type DocumentRequestType = "form137" | "diploma";

export interface Form137Request {
  id: string;
  school_id?: string | null; // Foreign key → sms_schools.id
  request_type: DocumentRequestType;
  student_lrn: string; // Input by student
  student_id?: string | null; // Foreign key → sms_students.id (populated after validation)
  requestor_name: string;
  requestor_contact: string;
  requestor_relationship: string;
  purpose: string;
  status: Form137RequestStatus;
  requested_at: string; // Timestamp
  approved_by?: string | null; // Foreign key → sms_users.id (School Head)
  approved_at?: string | null; // Timestamp
  completed_at?: string | null; // Timestamp
  remarks?: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// SUBJECT ASSIGNMENTS (Many-to-many: Teachers ↔ Subjects)
// ============================================================================

export interface SubjectAssignment {
  id: string;
  teacher_id: string; // Foreign key → sms_users.id
  subject_id: string; // Foreign key → sms_subjects.id
  section_id?: string | null; // Foreign key → sms_sections.id (if assigned to specific section)
  school_year: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// ROOMS
// ============================================================================

export interface Room {
  id: string;
  school_id?: string | null; // Foreign key → sms_schools.id
  name: string; // Unique room name/code (e.g., "Room 101", "Lab A")
  building?: string | null;
  capacity?: number | null;
  room_type?: string | null; // "classroom", "laboratory", "library", "gym", etc.
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  date_returned?: string | null; // Date
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
