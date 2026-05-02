-- 004b_user_id_not_null.sql
-- Run AFTER data migration (scripts/migrate-existing-data.sql)

-- Make user_id NOT NULL
ALTER TABLE applications ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE projects      ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE settings      ALTER COLUMN user_id SET NOT NULL;

-- Fix settings table: composite PK (user_id, key) instead of single-column PK (key)
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings ADD PRIMARY KEY (user_id, key);
