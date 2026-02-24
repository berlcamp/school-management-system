# Database Schema Reference

Quick reference guide for the School Management System database schema.

**Note**: All tables are in the `procurements` schema. When querying, use `procurements.table_name` or ensure your `search_path` includes `procurements`.

## Table Relationships

```
sms_users (Staff/Teachers)
  ├── sms_subjects (subject_teacher_id)
  ├── sms_sections (section_adviser_id)
  ├── sms_grades (teacher_id)
  ├── sms_enrollments (enrolled_by, approved_by)
  ├── sms_form_requests (approved_by)
  └── sms_subject_schedules (teacher_id)

sms_students
  ├── sms_section_students (student_id)
  ├── sms_grades (student_id)
  ├── sms_enrollments (student_id)
  ├── sms_form_requests (student_id)
  └── sms_learner_health (student_id)

sms_sections
  ├── sms_students (current_section_id)
  ├── sms_section_students (section_id)
  ├── sms_grades (section_id)
  ├── sms_enrollments (section_id)
  ├── sms_subject_schedules (section_id)
  └── sms_learner_health (section_id)

sms_subjects
  ├── sms_grades (subject_id)
  └── sms_subject_schedules (subject_id)
```

## Key Tables

### sms_subjects

- **Purpose**: Store all subjects offered in the school
- **Key Fields**: `code` (unique), `grade_level`, `subject_teacher_id`
- **Unique Constraint**: `code` must be unique

### sms_sections

- **Purpose**: Class sections for each grade level
- **Key Fields**: `name`, `grade_level`, `school_year`, `section_adviser_id`
- **Unique Constraint**: `(name, school_year, grade_level)` combination

### sms_students

- **Purpose**: Student records with complete information
- **Key Fields**: `lrn` (unique), `enrollment_status`, `current_section_id`
- **Unique Constraint**: `lrn` must be unique

### sms_section_students

- **Purpose**: Track which students are in which sections
- **Key Fields**: `section_id`, `student_id`, `school_year`
- **Unique Constraint**: `(section_id, student_id, school_year)` combination
- **Note**: Use `transferred_at` to mark when a student leaves a section

### sms_grades

- **Purpose**: Store student grades per subject and grading period
- **Key Fields**: `student_id`, `subject_id`, `section_id`, `grading_period`, `grade`
- **Unique Constraint**: `(student_id, subject_id, section_id, grading_period, school_year)`
- **Grading Periods**: 1, 2, 3, 4 (quarters)

### sms_enrollments

- **Purpose**: Track enrollment requests and approvals
- **Key Fields**: `student_id`, `section_id`, `status`, `enrolled_by`, `approved_by`
- **Status Values**: `pending`, `approved`, `rejected`

### sms_learner_health

- **Purpose**: Learner basic health and nutrition records for DepEd SF8 (Learner Basic Health and Nutrition Report)
- **Key Fields**: `student_id`, `section_id`, `school_year`, `height_cm`, `weight_kg`, `nutritional_status`, `height_for_age`, `remarks`, `measured_at`
- **Unique Constraint**: `(student_id, section_id, school_year)` — one record per learner per section per school year
- **Nutritional Status**: `underweight`, `normal`, `overweight`, `obese`
- **Height for Age**: `severely_stunted`, `stunted`, `normal`, `tall`

### sms_form_requests

- **Purpose**: Form 137 (Permanent Record) requests
- **Key Fields**: `student_lrn`, `status`, `approved_by`
- **Status Values**: `pending`, `approved`, `rejected`, `completed`
- **Note**: Public can insert, authenticated users can read

### sms_subject_schedules

- **Purpose**: Subject schedules linking subjects, sections, teachers, rooms, and time slots (replaces former subject assignments)
- **Key Fields**: `teacher_id`, `subject_id`, `section_id`, `room_id`, `days_of_week`, `start_time`, `end_time`, `school_year`

## Common Queries

### Get all students in a section

```sql
SELECT s.*
FROM sms_students s
JOIN sms_section_students ss ON s.id = ss.student_id
WHERE ss.section_id = 'section-uuid'
  AND ss.school_year = '2024-2025'
  AND ss.transferred_at IS NULL;
```

### Get all subjects for a grade level

```sql
SELECT *
FROM sms_subjects
WHERE grade_level = 7
  AND is_active = true
ORDER BY code;
```

### Get student grades for a subject

```sql
SELECT g.*, s.name as subject_name, st.first_name, st.last_name
FROM procurements.sms_grades g
JOIN procurements.sms_subjects s ON g.subject_id = s.id
JOIN procurements.sms_students st ON g.student_id = st.id
WHERE g.student_id = 'student-uuid'
  AND g.subject_id = 'subject-uuid'
  AND g.school_year = '2024-2025'
ORDER BY g.grading_period;
```

### Get sections where a teacher is adviser

```sql
SELECT *
FROM procurements.sms_sections
WHERE section_adviser_id = 'teacher-uuid'
  AND is_active = true;
```

### Get pending enrollments

```sql
SELECT e.*,
       s.first_name || ' ' || s.last_name as student_name,
       sec.name as section_name
FROM procurements.sms_enrollments e
JOIN procurements.sms_students s ON e.student_id = s.id
JOIN procurements.sms_sections sec ON e.section_id = sec.id
WHERE e.status = 'pending'
ORDER BY e.created_at DESC;
```

## Data Validation Rules

1. **Grade Levels**: Must be between 1 and 12
2. **Grading Periods**: Must be 1, 2, 3, or 4
3. **Grades**: Must be between 0.00 and 100.00
4. **Gender**: Must be 'male' or 'female'
5. **Enrollment Status**: Must be 'enrolled', 'transferred', 'graduated', or 'dropped'
6. **LRN**: Must be unique across all students
7. **Subject Code**: Must be unique

## Timestamps

All tables have:

- `created_at`: Set automatically on insert
- `updated_at`: Updated automatically via trigger on update

## Indexes

Key indexes are created for:

- Foreign keys (for join performance)
- Frequently queried fields (LRN, status, school_year, etc.)
- Composite indexes for common query patterns

## Row Level Security (RLS)

All tables have RLS enabled with basic policies. Customize these based on your security requirements:

- **Read Access**: Generally available to authenticated users
- **Write Access**: Restricted to admins/school heads (customize as needed)
- **Form 137 Requests**: Public can insert, authenticated can read

## Helper Functions

### get_user_id_by_email(p_email TEXT)

Returns the UUID of a user from auth.users table by email address.

## Maintenance

### Update a student's section

```sql
-- Mark old section_student as transferred
UPDATE procurements.sms_section_students
SET transferred_at = NOW()
WHERE student_id = 'student-uuid'
  AND transferred_at IS NULL;

-- Add to new section
INSERT INTO procurements.sms_section_students (section_id, student_id, school_year)
VALUES ('new-section-uuid', 'student-uuid', '2024-2025');

-- Update student's current_section_id
UPDATE procurements.sms_students
SET current_section_id = 'new-section-uuid'
WHERE id = 'student-uuid';
```

### Calculate student average grade

```sql
SELECT
  student_id,
  subject_id,
  AVG(grade) as average_grade,
  CASE WHEN AVG(grade) >= 75 THEN 'Passed' ELSE 'Failed' END as final_remark
FROM procurements.sms_grades
WHERE student_id = 'student-uuid'
  AND school_year = '2024-2025'
GROUP BY student_id, subject_id;
```
