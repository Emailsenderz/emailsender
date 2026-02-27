/*
  # Remove Auth Restrictions - Open Access for All Tables

  1. Changes
    - Drop all restrictive RLS policies that require authenticated users
    - Drop foreign key constraints on user_id columns (they reference auth.users which has no rows)
    - Make user_id columns nullable with no FK constraint
    - Add open policies allowing anon and authenticated roles full access
    - This removes the login requirement entirely

  2. Tables affected
    - campaigns
    - prospects
    - emails
    - campaign_prospects
    - campaign_followups
    - followup_emails

  3. Security
    - RLS remains enabled but policies allow all access (anon + authenticated)
    - This is intentional - single-user/internal tool with no auth requirement
*/

-- Drop all existing restrictive policies on all tables
DROP POLICY IF EXISTS "Users can view own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can insert own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can update own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can delete own campaigns" ON campaigns;

DROP POLICY IF EXISTS "Users can view own prospects" ON prospects;
DROP POLICY IF EXISTS "Users can insert own prospects" ON prospects;
DROP POLICY IF EXISTS "Users can update own prospects" ON prospects;
DROP POLICY IF EXISTS "Users can delete own prospects" ON prospects;

DROP POLICY IF EXISTS "Users can view own emails" ON emails;
DROP POLICY IF EXISTS "Users can insert own emails" ON emails;
DROP POLICY IF EXISTS "Users can update own emails" ON emails;
DROP POLICY IF EXISTS "Users can delete own emails" ON emails;

DROP POLICY IF EXISTS "Users can view own campaign_prospects" ON campaign_prospects;
DROP POLICY IF EXISTS "Users can insert own campaign_prospects" ON campaign_prospects;
DROP POLICY IF EXISTS "Users can update own campaign_prospects" ON campaign_prospects;
DROP POLICY IF EXISTS "Users can delete own campaign_prospects" ON campaign_prospects;

DROP POLICY IF EXISTS "Users can view own campaign_followups" ON campaign_followups;
DROP POLICY IF EXISTS "Users can insert own campaign_followups" ON campaign_followups;
DROP POLICY IF EXISTS "Users can update own campaign_followups" ON campaign_followups;
DROP POLICY IF EXISTS "Users can delete own campaign_followups" ON campaign_followups;

DROP POLICY IF EXISTS "Users can view own followup_emails" ON followup_emails;
DROP POLICY IF EXISTS "Users can insert own followup_emails" ON followup_emails;
DROP POLICY IF EXISTS "Users can update own followup_emails" ON followup_emails;
DROP POLICY IF EXISTS "Users can delete own followup_emails" ON followup_emails;

-- Drop any old permissive policies too (in case they still exist)
DROP POLICY IF EXISTS "Allow all operations on prospects" ON prospects;
DROP POLICY IF EXISTS "Allow all operations on campaigns" ON campaigns;
DROP POLICY IF EXISTS "Allow all operations on emails" ON emails;
DROP POLICY IF EXISTS "Allow all operations on campaign_prospects" ON campaign_prospects;
DROP POLICY IF EXISTS "Allow all operations on campaign_followups" ON campaign_followups;
DROP POLICY IF EXISTS "Allow all operations on followup_emails" ON followup_emails;

-- Drop FK constraints on user_id so dummy UUIDs work without needing a real auth.users row
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.constraint_name, tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'user_id'
      AND tc.table_schema = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
  END LOOP;
END $$;

-- Create open access policies for all tables (anon + authenticated)
CREATE POLICY "Open access for campaigns"
  ON campaigns FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Open access for prospects"
  ON prospects FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Open access for emails"
  ON emails FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Open access for campaign_prospects"
  ON campaign_prospects FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Open access for campaign_followups"
  ON campaign_followups FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Open access for followup_emails"
  ON followup_emails FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
