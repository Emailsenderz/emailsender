import { useState } from 'react'
import {
  Send,
  Clock,
  XCircle,
  CheckCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Campaign, CampaignProspect, Variant, Prospect } from '../types/campaign'

interface Props {
  campaign: Campaign
  campaignProspects: CampaignProspect[]
  onCampaignUpdate: (campaign: Campaign) => void
}

function replaceVariables(text: string, prospect: Prospect): string {
  return text
    .replace(/\{\{first_name\}\}/g, prospect.first_name || '')
    .replace(/\{\{business_name\}\}/g, prospect.business_name || '')
    .replace(/\{\{company\}\}/g, prospect.company || '')
    .replace(/\{\{city\}\}/g, prospect.city || '')
    .replace(/\{\{state\}\}/g, prospect.state || '')
    .replace(/\{\{email\}\}/g, prospect.email || '')
}

function computeScheduleSummary(
  totalEmails: number,
  startTime: string,
  endTime: string,
  intervalMinutes: number
) {
  const [startH, startM] = startTime.split(':').map(Number)
  const [endH, endM] = endTime.split(':').map(Number)

  let windowMinutes: number
  if (endH < startH || (endH === startH && endM <= startM)) {
    windowMinutes = (24 * 60 - (startH * 60 + startM)) + (endH * 60 + endM)
  } else {
    windowMinutes = (endH * 60 + endM) - (startH * 60 + startM)
  }

  const emailsPerDay = Math.floor(windowMinutes / intervalMinutes)
  const daysNeeded = Math.ceil(totalEmails / emailsPerDay)

  return { emailsPerDay, daysNeeded, windowMinutes }
}

export default function ComposeScheduleTab({
  campaign,
  campaignProspects,
  onCampaignUpdate,
}: Props) {
  const [variants, setVariants] = useState<Variant[]>([
    { id: 'A', subject: '', body: '' },
  ])
  const [activeVariant, setActiveVariant] = useState('A')
  const [scheduling, setScheduling] = useState(false)
  const [previewProspectId, setPreviewProspectId] = useState<string | null>(
    campaignProspects.length > 0 ? campaignProspects[0].id : null
  )

  const [dailyStart, setDailyStart] = useState(campaign.daily_start || '20:00')
  const [dailyEnd, setDailyEnd] = useState(campaign.daily_end || '01:00')
  const [intervalMinutes, setIntervalMinutes] = useState(
    campaign.interval_minutes || 5
  )

  const activeVar = variants.find((v) => v.id === activeVariant)

  const previewProspect =
    campaignProspects.find((p) => p.id === previewProspectId) ||
    campaignProspects[0] ||
    null

  const isAlreadyScheduled = campaign.scheduled_status === 'scheduled'

  const summary = computeScheduleSummary(
    campaignProspects.length,
    dailyStart,
    dailyEnd,
    intervalMinutes
  )

  function addVariant() {
    const nextLetter = String.fromCharCode(65 + variants.length)
    setVariants([...variants, { id: nextLetter, subject: '', body: '' }])
    setActiveVariant(nextLetter)
  }

  function removeVariant(variantId: string) {
    if (variants.length === 1) return
    const newVariants = variants.filter((v) => v.id !== variantId)
    setVariants(newVariants)
    if (activeVariant === variantId) {
      setActiveVariant(newVariants[0].id)
    }
  }

  function updateVariant(
    variantId: string,
    field: 'subject' | 'body',
    value: string
  ) {
    setVariants(
      variants.map((v) => (v.id === variantId ? { ...v, [field]: value } : v))
    )
  }

  function insertTag(tag: string) {
    if (!activeVar) return
    updateVariant(activeVariant, 'body', activeVar.body + tag)
  }

  async function cancelSchedule() {
    if (!confirm('Cancel all pending emails for this campaign?')) return

    try {
      const { error } = await supabase
        .from('emails')
        .delete()
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')

      if (error) throw error

      await supabase
        .from('campaigns')
        .update({ scheduled_status: 'cancelled', is_active: false })
        .eq('id', campaign.id)

      onCampaignUpdate({
        ...campaign,
        scheduled_status: 'cancelled',
        is_active: false,
      })

      alert('Campaign cancelled. All pending emails removed.')
    } catch (error: any) {
      alert('Error: ' + error.message)
    }
  }

  // 🔥 FIXED VERSION - NO MANUAL FETCH, USES SUPABASE CLIENT
  async function scheduleEmails() {
    if (campaignProspects.length === 0) {
      alert('No prospects in this campaign')
      return
    }

    const allVariantsComplete = variants.every(
      (v) => v.subject.trim() && v.body.trim()
    )
    if (!allVariantsComplete) {
      alert('All variants must have subject and body filled')
      return
    }

    const confirmed = confirm(
      `Schedule ${campaignProspects.length} emails?\n\n` +
        `Send window: ${dailyStart} - ${dailyEnd} IST\n` +
        `Interval: every ${intervalMinutes} minutes\n` +
        `~${summary.emailsPerDay} emails per day\n` +
        `Estimated ${summary.daysNeeded} day(s) to complete\n\n` +
        `Emails will be sent automatically by the system.`
    )

    if (!confirmed) return

    setScheduling(true)
    try {
      const recipientEmails = campaignProspects.map((p) => p.email)

      const prospectDataMap: Record<string, Record<string, string>> = {}
      campaignProspects.forEach((p) => {
        prospectDataMap[p.email] = {
          first_name: p.first_name || '',
          business_name: p.business_name || '',
          company: p.company || '',
          city: p.city || '',
          state: p.state || '',
          email: p.email || '',
        }
      })

      const { data, error } = await supabase.functions.invoke('queue-builder', {
        body: {
          campaign_id: campaign.id,
          user_id: undefined,
          recipients: recipientEmails,
          variants,
          prospect_data: prospectDataMap,
          daily_start: dailyStart,
          daily_end: dailyEnd,
          interval_minutes: intervalMinutes,
        },
      })

      if (error) throw error

      onCampaignUpdate({
        ...campaign,
        scheduled_status: 'scheduled',
        scheduled_count: data.scheduled,
        is_active: true,
        daily_start: dailyStart,
        daily_end: dailyEnd,
        interval_minutes: intervalMinutes,
      })

      const firstDate = new Date(data.first_send_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
      })
      const lastDate = new Date(data.last_send_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
      })

      alert(
        `Scheduled ${data.scheduled} emails!\n\n` +
          `First email: ${firstDate} IST\n` +
          `Last email: ${lastDate} IST\n\n` +
          `The system will send them automatically.`
      )
    } catch (error: any) {
      console.error('Error scheduling emails:', error)
      alert('Error: ' + error.message)
    } finally {
      setScheduling(false)
    }
  }

  if (isAlreadyScheduled) {
    return (
      <div className="space-y-6">
        <div className="card border-green-200 bg-green-50">
          <div className="flex items-start gap-4">
            <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-green-900">
                Campaign Scheduled
              </h3>
              <p className="mt-1 text-green-800">
                {campaign.scheduled_count} emails are queued and will be sent
                automatically.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <div className="text-xs text-green-700 font-medium">
                    Send Window
                  </div>
                  <div className="text-sm font-semibold text-green-900 mt-1">
                    {campaign.daily_start} - {campaign.daily_end} IST
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <div className="text-xs text-green-700 font-medium">
                    Interval
                  </div>
                  <div className="text-sm font-semibold text-green-900 mt-1">
                    Every {campaign.interval_minutes} min
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <div className="text-xs text-green-700 font-medium">
                    Total Emails
                  </div>
                  <div className="text-sm font-semibold text-green-900 mt-1">
                    {campaign.scheduled_count}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-green-700">
                The cron job checks every 2 minutes and sends emails whose
                scheduled time has arrived. You can close this page -- sending
                continues in the background.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={cancelSchedule}
          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-medium border border-red-200"
        >
          <XCircle className="w-4 h-4" />
          Cancel Scheduled Emails
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">
              Message Variants (A/B Testing)
            </h3>
            {variants.length < 3 && (
              <button
                onClick={addVariant}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Add Variant
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-4">
            {variants.map((v) => (
              <button
                key={v.id}
                onClick={() => setActiveVariant(v.id)}
                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
                  activeVariant === v.id
                    ? 'bg-blue-100 text-blue-700 border-2 border-blue-600'
                    : 'bg-gray-100 text-gray-700 border-2 border-transparent'
                }`}
              >
                Variant {v.id}
                {variants.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeVariant(v.id)
                    }}
                    className="ml-1 hover:text-red-600"
                  >
                    x
                  </button>
                )}
              </button>
            ))}
          </div>

          {variants.length > 1 && (
            <p className="text-sm text-gray-600 mb-4">
              ~{Math.floor(100 / variants.length)}% each /{' '}
              {Math.ceil(campaignProspects.length / variants.length)} prospects
              per variant
            </p>
          )}

          {activeVar && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={activeVar.subject}
                  onChange={(e) =>
                    updateVariant(activeVariant, 'subject', e.target.value)
                  }
                  placeholder="Email subject (can use {{business_name}} etc)"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Personalization Tags
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {[
                    '{{first_name}}',
                    '{{business_name}}',
                    '{{company}}',
                    '{{city}}',
                    '{{state}}',
                    '{{email}}',
                  ].map((tag) => (
                    <button
                      key={tag}
                      onClick={() => insertTag(tag)}
                      className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm font-mono"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Body
                </label>
                <textarea
                  value={activeVar.body}
                  onChange={(e) =>
                    updateVariant(activeVariant, 'body', e.target.value)
                  }
                  placeholder="Email body content with {{variables}}"
                  rows={12}
                  className="input-field font-mono text-sm"
                />
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-600" />
            Schedule Settings
          </h3>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Daily Start Time (IST)
                </label>
                <input
                  type="time"
                  value={dailyStart}
                  onChange={(e) => setDailyStart(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Daily End Time (IST)
                </label>
                <input
                  type="time"
                  value={dailyEnd}
                  onChange={(e) => setDailyEnd(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Interval Between Emails (minutes)
              </label>
              <input
                type="number"
                value={intervalMinutes}
                onChange={(e) =>
                  setIntervalMinutes(Math.max(1, parseInt(e.target.value) || 5))
                }
                min="1"
                max="60"
                className="input-field"
              />
            </div>

            {campaignProspects.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">
                  Schedule Summary
                </h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <div>
                    {campaignProspects.length} emails, every {intervalMinutes}{' '}
                    min
                  </div>
                  <div>
                    ~{summary.emailsPerDay} emails per day ({summary.windowMinutes} min
                    window)
                  </div>
                  <div>
                    Estimated {summary.daysNeeded} day(s) to complete
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={scheduleEmails}
            disabled={scheduling || campaignProspects.length === 0}
            className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {scheduling
              ? 'Scheduling...'
              : `Schedule ${campaignProspects.length} Emails`}
          </button>
        </div>
      </div>

      <div className="card h-fit">
        <h3 className="font-semibold text-lg mb-4">Live Preview</h3>

        {previewProspect ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preview for:
              </label>
              <select
                value={previewProspectId || ''}
                onChange={(e) => setPreviewProspectId(e.target.value)}
                className="input-field"
              >
                {campaignProspects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.business_name || p.email} - {p.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-500 mb-2">Subject:</div>
              <div className="font-semibold mb-4">
                {activeVar
                  ? replaceVariables(activeVar.subject, previewProspect)
                  : ''}
              </div>

              <div className="text-xs text-gray-500 mb-2">Body:</div>
              <div className="whitespace-pre-wrap text-sm">
                {activeVar
                  ? replaceVariables(activeVar.body, previewProspect)
                  : ''}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <div className="font-medium text-blue-900 mb-1">
                Prospect Data:
              </div>
              <div className="text-blue-800 space-y-1">
                {previewProspect.email && (
                  <div>Email: {previewProspect.email}</div>
                )}
                {previewProspect.first_name && (
                  <div>First Name: {previewProspect.first_name}</div>
                )}
                {previewProspect.business_name && (
                  <div>Business: {previewProspect.business_name}</div>
                )}
                {previewProspect.city && (
                  <div>
                    Location: {previewProspect.city}
                    {previewProspect.state && `, ${previewProspect.state}`}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-12">
            Add prospects to see preview
          </p>
        )}
      </div>
    </div>
  )
}