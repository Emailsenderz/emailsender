/*
  # Email Campaign System Database Schema

  1. New Tables
    - `prospects`
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `first_name` (text, nullable)
      - `business_name` (text, nullable)
      - `company` (text, nullable)
      - `city` (text, nullable)
      - `state` (text, nullable)
      - `phone` (text, nullable)
      - `overall_score` (text, nullable)
      - `is_safe_to_send` (text, nullable)
      - `created_at` (timestamptz)

    - `campaigns`
      - `id` (uuid, primary key)
      - `name` (text)
      - `is_active` (boolean)
      - `daily_start` (time, nullable)
      - `daily_end` (time, nullable)
      - `interval_minutes` (integer, nullable)
      - `created_at` (timestamptz)

    - `emails`
      - `id` (uuid, primary key)
      - `to_email` (text)
      - `subject` (text)
      - `body` (text)
      - `send_at` (timestamptz)
      - `status` (text)
      - `campaign_id` (uuid, nullable, foreign key)
      - `variant` (text, nullable)
      - `created_at` (timestamptz)

    - `campaign_prospects`
      - `id` (uuid, primary key)
      - `campaign_id` (uuid, foreign key)
      - `prospect_id` (uuid, foreign key)
      - `created_at` (timestamptz)
      - Unique constraint on (campaign_id, prospect_id)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their data
*/

-- Create prospects table
CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  first_name text,
  business_name text,
  company text,
  city text,
  state text,
  phone text,
  overall_score text,
  is_safe_to_send text,
  created_at timestamptz DEFAULT now()
);

-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean DEFAULT false,
  daily_start time,
  daily_end time,
  interval_minutes integer,
  created_at timestamptz DEFAULT now()
);

-- Create emails table (queue + delivery log)
CREATE TABLE IF NOT EXISTS emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  variant text,
  created_at timestamptz DEFAULT now()
);

-- Create campaign_prospects join table
CREATE TABLE IF NOT EXISTS campaign_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, prospect_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_send_at ON emails(send_at);
CREATE INDEX IF NOT EXISTS idx_emails_campaign_id ON emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_prospects_campaign_id ON campaign_prospects(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_prospects_prospect_id ON campaign_prospects(prospect_id);

-- Enable Row Level Security
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_prospects ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust based on your auth needs)
-- For now, allowing all operations - you can restrict this later with auth

CREATE POLICY "Allow all operations on prospects"
  ON prospects
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on campaigns"
  ON campaigns
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on emails"
  ON emails
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on campaign_prospects"
  ON campaign_prospects
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
