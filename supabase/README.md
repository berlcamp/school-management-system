# Database Schema Setup

This directory contains SQL migration files for the School Management System database schema.

**Important**: All tables are created in the `procurements` schema, not the default `public` schema. This matches your Supabase client configuration.

## Setup Instructions

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file `001_school_management_schema.sql`
4. Copy and paste the entire contents into the SQL Editor
5. Click **Run** to execute the migration

### Option 2: Using Supabase CLI

If you have Supabase CLI installed:

```bash
# Make sure you're logged in
supabase login

# Link your project (if not already linked)
supabase link --project-ref your-project-ref

# Run the migration
supabase db push
```

### Option 3: Manual Execution

You can also execute the SQL file directly using `psql` or any PostgreSQL client:

```bash
psql -h your-db-host -U postgres -d postgres -f supabase/migrations/001_school_management_schema.sql
```

## What This Migration Creates

The migration creates the following tables in the `procurements` schema:

1. **sms_subjects** - Subjects offered in the school
2. **sms_sections** - Class sections for each grade level
3. **sms_students** - Student records with LRN
4. **sms_section_students** - Junction table for students in sections
5. **sms_grades** - Student grades per subject and grading period
6. **sms_enrollments** - Enrollment requests and approvals
7. **sms_form137_requests** - Form 137 (Permanent Record) requests
8. **sms_subject_assignments** - Teacher-subject assignments

## Features Included

- ✅ All foreign key relationships
- ✅ Proper indexes for performance
- ✅ Check constraints for data validation
- ✅ Unique constraints where needed
- ✅ Automatic `updated_at` timestamp triggers
- ✅ Row Level Security (RLS) policies
- ✅ Helper functions

## Important Notes

1. **RLS Policies**: The migration includes basic RLS policies. You should customize these based on your specific security requirements.

2. **Schema**: All tables are created in the `procurements` schema. Make sure your Supabase client is configured to use this schema (which it already is based on your configuration).

3. **User Type Column**: The migration adds a `type` column to the `procurements.sms_users` table if it doesn't exist. Make sure your existing `sms_users` table structure is compatible.

4. **Permissions**: After running the migration, verify that your application users have the necessary permissions to access these tables.

5. **Indexes**: All indexes are created to optimize common query patterns. Monitor query performance and add additional indexes if needed.

## Post-Migration Steps

1. Verify all tables were created successfully
2. Test inserting sample data
3. Review and customize RLS policies based on your needs
4. Set up any additional database functions or triggers you may need
5. Create initial admin user accounts

## Troubleshooting

If you encounter errors:

1. **Table already exists**: The migration uses `CREATE TABLE IF NOT EXISTS`, so it should be safe to run multiple times. However, if you need to modify existing tables, create a new migration file.

2. **Foreign key errors**: Make sure the `procurements.sms_users` table exists before running this migration. If your `sms_users` table is in a different schema, you may need to adjust the foreign key references.

3. **Schema errors**: If you get errors about the `procurements` schema not existing, you may need to create it first:

   ```sql
   CREATE SCHEMA IF NOT EXISTS procurements;
   ```

4. **RLS policy errors**: If you get RLS policy errors, you may need to temporarily disable RLS, run the migration, then re-enable it.

5. **Permission errors**: Ensure you're running the migration with a user that has sufficient privileges (typically the `postgres` superuser or a user with `CREATEDB` privileges).

## Next Steps

After running the migration:

1. Create test data for development
2. Set up proper RLS policies based on your user roles
3. Configure any additional database functions
4. Set up database backups
5. Monitor performance and optimize queries as needed
