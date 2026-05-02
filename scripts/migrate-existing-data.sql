-- scripts/migrate-existing-data.sql
-- Assigns all existing data (user_id IS NULL) to the first registered user.
--
-- How to use:
-- 1. Register via /register page
-- 2. Get your user UUID from Supabase Dashboard → Authentication → Users
-- 3. Replace 'ВСТАВИТЬ-UUID-ПОЛЬЗОВАТЕЛЯ-СЮДА' with your UUID
-- 4. Run in Supabase Dashboard → SQL Editor

DO $$
DECLARE
  first_user_id uuid := 'ВСТАВИТЬ-UUID-ПОЛЬЗОВАТЕЛЯ-СЮДА';
BEGIN
  UPDATE applications SET user_id = first_user_id WHERE user_id IS NULL;
  UPDATE projects      SET user_id = first_user_id WHERE user_id IS NULL;
  UPDATE settings      SET user_id = first_user_id WHERE user_id IS NULL;
END $$;

-- After running this, make user_id NOT NULL (run 004b_user_id_not_null.sql)
