export interface Campaign {
  id: string
  name: string
  is_active: boolean
  daily_start: string | null
  daily_end: string | null
  interval_minutes: number | null
  scheduled_status: string
  scheduled_count: number
  created_at: string
}

export interface Prospect {
  id: string
  email: string
  first_name: string | null
  business_name: string | null
  company: string | null
  city: string | null
  state: string | null
  phone: string | null
  overall_score: string | null
  is_safe_to_send: string | null
}

export interface CampaignProspect extends Prospect {
  campaign_id: string
  excluded_from_followup: boolean
}

export interface Variant {
  id: string
  subject: string
  body: string
}

export interface CampaignFollowup {
  id: string
  campaign_id: string
  round: 1 | 2
  name: string
  scheduled_status: 'draft' | 'scheduled' | 'completed' | 'cancelled'
  daily_start: string | null
  daily_end: string | null
  interval_minutes: number | null
  scheduled_count: number
  created_at: string
}

export interface FollowupEmail {
  id: string
  followup_id: string
  to_email: string
  subject: string
  status: string
  send_at: string
}
