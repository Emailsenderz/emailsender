/*
  # Add User Authentication Support

  1. Schema Changes
    - Add `user_id` column to `campaigns` table
    - Add `user_id` column to `prospects` table
    - Add `user_id` column to `emails` table

  2. Security Updates
    - Drop existing permissive RLS policies
    - Create restrictive policies that check auth.uid()
    - Users can only access their own data
    - Unauthenticated users have no access

  3. Important Notes
    - Existing data will have NULL user_id initially
    - New records will automatically get user_id from auth.uid()
*/

-- Add user_id columns to all main tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prospects' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE prospects ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_prospects_user_id ON prospects(user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'emails' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE emails ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
  END IF;
END $$;

-- Drop old permissive policies
DROP POLICY IF EXISTS "Allow all operations on prospects" ON prospects;
DROP POLICY IF EXISTS "Allow all operations on campaigns" ON campaigns;
DROP POLICY IF EXISTS "Allow all operations on emails" ON emails;
DROP POLICY IF EXISTS "Allow all operations on campaign_prospects" ON campaign_prospects;
DROP POLICY IF EXISTS "Allow all operations on campaign_followups" ON campaign_followups;
DROP POLICY IF EXISTS "Allow all operations on followup_emails" ON followup_emails;

-- Campaigns policies
CREATE POLICY "Users can view own campaigns"
  ON campaigns FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own campaigns"
  ON campaigns FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own campaigns"
  ON campaigns FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own campaigns"
  ON campaigns FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Prospects policies
CREATE POLICY "Users can view own prospects"
  ON prospects FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prospects"
  ON prospects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prospects"
  ON prospects FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own prospects"
  ON prospects FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Emails policies
CREATE POLICY "Users can view own emails"
  ON emails FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own emails"
  ON emails FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own emails"
  ON emails FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own emails"
  ON emails FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Campaign prospects policies (junction table)
CREATE POLICY "Users can view own campaign_prospects"
  ON campaign_prospects FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_prospects.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own campaign_prospects"
  ON campaign_prospects FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_prospects.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own campaign_prospects"
  ON campaign_prospects FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_prospects.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_prospects.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own campaign_prospects"
  ON campaign_prospects FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_prospects.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Campaign followups policies
CREATE POLICY "Users can view own campaign_followups"
  ON campaign_followups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_followups.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own campaign_followups"
  ON campaign_followups FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_followups.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own campaign_followups"
  ON campaign_followups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_followups.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_followups.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own campaign_followups"
  ON campaign_followups FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_followups.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Followup emails policies
CREATE POLICY "Users can view own followup_emails"
  ON followup_emails FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_followups
      JOIN campaigns ON campaigns.id = campaign_followups.campaign_id
      WHERE campaign_followups.id = followup_emails.followup_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own followup_emails"
  ON followup_emails FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_followups
      JOIN campaigns ON campaigns.id = campaign_followups.campaign_id
      WHERE campaign_followups.id = followup_emails.followup_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own followup_emails"
  ON followup_emails FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_followups
      JOIN campaigns ON campaigns.id = campaign_followups.campaign_id
      WHERE campaign_followups.id = followup_emails.followup_id
      AND campaigns.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_followups
      JOIN campaigns ON campaigns.id = campaign_followups.campaign_id
      WHERE campaign_followups.id = followup_emails.followup_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own followup_emails"
  ON followup_emails FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_followups
      JOIN campaigns ON campaigns.id = campaign_followups.campaign_id
      WHERE campaign_followups.id = followup_emails.followup_id
      AND campaigns.user_id = auth.uid()
    )
  );
