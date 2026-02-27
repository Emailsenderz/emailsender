/*
  # Follow-Up Campaign System

  ## Summary
  Adds full follow-up campaign support with permanent exclusion flags.

  ## Changes

  ### Modified Tables
  - `campaign_prospects`
    - Added `excluded_from_followup` (boolean, default false) — when true, this prospect is
      permanently excluded from ALL follow-up rounds for this campaign

  ### New Tables
  - `campaign_followups`
    - Stores each follow-up round (round 1 or 2) per campaign
    - Tracks status, schedule settings, and prospect counts
    - Columns: id, campaign_id, round, name, scheduled_status, daily_start, daily_end,
      interval_minutes, scheduled_count, created_at

  - `followup_emails`
    - Isolated email queue/log for follow-up rounds (separate from main `emails` table
      so campaign analytics stay clean)
    - Columns: id, followup_id, to_email, subject, body, send_at, status, variant, created_at

  ## Security
  - RLS enabled on both new tables
  - Public access policies (matching existing pattern)

  ## Indexes
  - followup_emails: followup_id, status, send_at for fast cron queries
  - campaign_followups: campaign_id for fast lookup
*/

-- Add exclusion flag to campaign_prospects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_prospects' AND column_name = 'excluded_from_followup'
  ) THEN
    ALTER TABLE campaign_prospects ADD COLUMN excluded_from_followup boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Create campaign_followups table
CREATE TABLE IF NOT EXISTS campaign_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  round integer NOT NULL CHECK (round IN (1, 2)),
  name text NOT NULL DEFAULT '',
  scheduled_status text NOT NULL DEFAULT 'draft',
  daily_start time,
  daily_end time,
  interval_minutes integer,
  scheduled_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, round)
);

-- Create followup_emails table
CREATE TABLE IF NOT EXISTS followup_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id uuid NOT NULL REFERENCES campaign_followups(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  variant text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_followups_campaign_id ON campaign_followups(campaign_id);
CREATE INDEX IF NOT EXISTS idx_followup_emails_followup_id ON followup_emails(followup_id);
CREATE INDEX IF NOT EXISTS idx_followup_emails_status ON followup_emails(status);
CREATE INDEX IF NOT EXISTS idx_followup_emails_send_at ON followup_emails(send_at);

-- Enable RLS
ALTER TABLE campaign_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_emails ENABLE ROW LEVEL SECURITY;

-- Policies (drop first in case of partial previous run)
DROP POLICY IF EXISTS "Allow all operations on campaign_followups" ON campaign_followups;
DROP POLICY IF EXISTS "Allow all operations on followup_emails" ON followup_emails;

CREATE POLICY "Allow all operations on campaign_followups"
  ON campaign_followups
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on followup_emails"
  ON followup_emails
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
