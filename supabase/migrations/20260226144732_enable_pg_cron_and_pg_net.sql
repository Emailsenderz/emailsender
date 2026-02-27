/*
  # Enable pg_cron and pg_net for Automated Email Sending

  1. Extensions
    - `pg_cron` - Job scheduler for PostgreSQL, runs tasks on a schedule
    - `pg_net` - Async HTTP client for PostgreSQL, calls Edge Functions

  2. Cron Job
    - `process-pending-emails` - Runs every 2 minutes
    - Calls the `send-emails` Edge Function via HTTP POST
    - Picks up any pending emails whose send_at time has passed and delivers them via Brevo

  3. Important Notes
    - The cron job uses the service role key to authenticate with the Edge Function
    - pg_net makes async HTTP requests so it won't block the database
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'process-pending-emails',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
