/*
  # Add Campaign Scheduling Fields and Fix Cron Job

  1. Modified Tables
    - `campaigns`
      - `scheduled_status` (text) - Tracks scheduling state: 'draft', 'scheduled', 'completed', 'cancelled'
      - `scheduled_count` (integer) - Number of emails queued for this campaign
      - `timezone` (text) - Timezone for the send window, defaults to 'Asia/Kolkata'

  2. Cron Job Fix
    - The existing cron job uses `current_setting('app.settings.supabase_url')` which returns NULL on Supabase
    - Replacing with the actual project URL for reliable execution

  3. Important Notes
    - The daily_start, daily_end, and interval_minutes columns already exist
    - This migration only adds the missing scheduling tracking columns
    - The cron job is recreated with hardcoded URL for reliability
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'scheduled_status'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN scheduled_status text NOT NULL DEFAULT 'draft';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'scheduled_count'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN scheduled_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Kolkata';
  END IF;
END $$;

SELECT cron.unschedule('process-pending-emails');

SELECT cron.schedule(
  'process-pending-emails',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fbfuhnrnjupcextxndob.supabase.co/functions/v1/send-emails',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiZnVobnJuanVwY2V4dHhuZG9iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjExMDg2NywiZXhwIjoyMDg3Njg2ODY3fQ.3P62sqlBR_MemPUl9tpMl6LfVXCXIe8FWbibfaYI7Ak"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);