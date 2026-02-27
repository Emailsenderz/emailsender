import { useState, useEffect } from 'react'
import {
  Send,
  Clock,
  XCircle,
  CheckCircle,
  RefreshCw,
  Lock,
  AlertTriangle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type {
  Campaign,
  CampaignProspect,
  CampaignFollowup,
  Variant,
  Prospect,
} from '../types/campaign'

interface Props {
  campaign: Campaign
  campaignProspects: CampaignProspect[]
  onProspectsChange: () => void
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
    windowMinutes = 24 * 60 - (startH * 60 + startM) + (endH * 60 + endM)
  } else {
    windowMinutes = endH * 60 + endM - (startH * 60 + startM)
  }
  const emailsPerDay = Math.floor(windowMinutes / intervalMinutes)
  const daysNeeded = Math.ceil(totalEmails / Math.max(emailsPerDay, 1))
  return { emailsPerDay, daysNeeded, windowMinutes }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    scheduled: 'bg-amber-100 text-amber-800',
    completed: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-red-100 text-red-700',
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        map[status] || map.draft
      }`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

interface RoundStats {
  pending: number
  sent: number
  failed: number
  total: number
}

interface RoundPanelProps {
  round: 1 | 2
  followup: CampaignFollowup | null
  locked: boolean
  eligibleCount: number
  campaign: Campaign
  onFollowupChange: (f: CampaignFollowup) => void
}

function RoundPanel({
  round,
  followup,
  locked,
  eligibleCount,
  campaign,
  onFollowupChange,
}: RoundPanelProps) {
  const [variants, setVariants] = useState<Variant[]>([
    { id: 'A', subject: '', body: '' },
  ])
  const [activeVariant, setActiveVariant] = useState('A')
  const [dailyStart, setDailyStart] = useState(campaign.daily_start || '20:00')
  const [dailyEnd, setDailyEnd] = useState(campaign.daily_end || '01:00')
  const [intervalMinutes, setIntervalMinutes] = useState(
    campaign.interval_minutes || 5
  )
  const [scheduling, setScheduling] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [stats, setStats] = useState<RoundStats | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [recentEmails, setRecentEmails] = useState<
    Array<{ id: string; to_email: string; subject: string; status: string; send_at: string }>
  >([])
  const [statsLoading, setStatsLoading] = useState(false)

  const activeVar = variants.find((v) => v.id === activeVariant)
  const summary = computeScheduleSummary(
    eligibleCount,
    dailyStart,
    dailyEnd,
    intervalMinutes
  )

  useEffect(() => {
    if (followup && followup.scheduled_status !== 'draft') {
      loadStats()
    }
  }, [followup?.id])

  useEffect(() => {
    if (!autoRefresh || !followup) return
    const interval = setInterval(loadStats, 15000)
    return () => clearInterval(interval)
  }, [autoRefresh, followup?.id])

  useEffect(() => {
    setAutoRefresh(followup?.scheduled_status === 'scheduled')
  }, [followup?.scheduled_status])

  async function loadStats() {
    if (!followup) return
    setStatsLoading(true)
    try {
      const { data } = await supabase
        .from('followup_emails')
        .select('id, to_email, subject, status, send_at')
        .eq('followup_id', followup.id)
        .order('send_at', { ascending: false })

      const list = data || []
      setStats({
        pending: list.filter((e) => e.status === 'pending').length,
        sent: list.filter((e) => e.status === 'sent').length,
        failed: list.filter((e) => e.status === 'failed').length,
        total: list.length,
      })
      setRecentEmails(list.slice(0, 20))
    } catch (err) {
      console.error('Error loading followup stats:', err)
    } finally {
      setStatsLoading(false)
    }
  }

  function addVariant() {
    if (variants.length >= 3) return
    const nextLetter = String.fromCharCode(65 + variants.length)
    setVariants([...variants, { id: nextLetter, subject: '', body: '' }])
    setActiveVariant(nextLetter)
  }

  function removeVariant(variantId: string) {
    if (variants.length === 1) return
    const newVariants = variants.filter((v) => v.id !== variantId)
    setVariants(newVariants)
    if (activeVariant === variantId) setActiveVariant(newVariants[0].id)
  }

  function updateVariant(variantId: string, field: 'subject' | 'body', value: string) {
    setVariants(variants.map((v) => (v.id === variantId ? { ...v, [field]: value } : v)))
  }

  function insertTag(tag: string) {
    if (!activeVar) return
    updateVariant(activeVariant, 'body', activeVar.body + tag)
  }

  async function getOrCreateFollowup(): Promise<CampaignFollowup> {
    if (followup) return followup

    const { data, error } = await supabase
      .from('campaign_followups')
      .insert({
        campaign_id: campaign.id,
        round,
        name: `Follow-Up ${round}`,
        scheduled_status: 'draft',
      })
      .select()
      .single()

    if (error) throw error
    onFollowupChange(data as CampaignFollowup)
    return data as CampaignFollowup
  }

  async function scheduleFollowup() {
    if (eligibleCount === 0) {
      alert('No eligible prospects (all are excluded from follow-ups)')
      return
    }

    const allComplete = variants.every((v) => v.subject.trim() && v.body.trim())
    if (!allComplete) {
      alert('All variants must have subject and body filled')
      return
    }

    const confirmed = confirm(
      `Schedule Follow-Up ${round} for ${eligibleCount} eligible prospects?\n\n` +
        `Send window: ${dailyStart} - ${dailyEnd} IST\n` +
        `Interval: every ${intervalMinutes} minutes\n` +
        `~${summary.emailsPerDay} emails per day\n` +
        `Estimated ${summary.daysNeeded} day(s) to complete`
    )
    if (!confirmed) return

    setScheduling(true)
    try {
      const fu = await getOrCreateFollowup()

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/queue-followup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            followup_id: fu.id,
            campaign_id: campaign.id,
            variants,
            daily_start: dailyStart,
            daily_end: dailyEnd,
            interval_minutes: intervalMinutes,
          }),
        }
      )

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.error || 'Failed to queue follow-up emails')
      }

      const result = await response.json()

      const updated: CampaignFollowup = {
        ...fu,
        scheduled_status: 'scheduled',
        scheduled_count: result.scheduled,
        daily_start: dailyStart,
        daily_end: dailyEnd,
        interval_minutes: intervalMinutes,
      }
      onFollowupChange(updated)
      await loadStats()

      const firstDate = new Date(result.first_send_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
      })
      const lastDate = new Date(result.last_send_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
      })

      alert(
        `Follow-Up ${round} scheduled!\n` +
          `${result.scheduled} emails queued.\n\n` +
          `First: ${firstDate} IST\n` +
          `Last: ${lastDate} IST`
      )
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setScheduling(false)
    }
  }

  async function cancelFollowup() {
    if (!followup) return
    if (!confirm(`Cancel all pending emails for Follow-Up ${round}?`)) return

    setCancelling(true)
    try {
      await supabase
        .from('followup_emails')
        .delete()
        .eq('followup_id', followup.id)
        .eq('status', 'pending')

      const { data } = await supabase
        .from('campaign_followups')
        .update({ scheduled_status: 'cancelled' })
        .eq('id', followup.id)
        .select()
        .single()

      if (data) onFollowupChange(data as CampaignFollowup)
      await loadStats()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setCancelling(false)
    }
  }

  async function resetToDraft() {
    if (!followup) return
    if (
      !confirm(
        `Reset Follow-Up ${round} to draft? This will let you re-compose and reschedule.`
      )
    )
      return

    try {
      const { data } = await supabase
        .from('campaign_followups')
        .update({ scheduled_status: 'draft', scheduled_count: 0 })
        .eq('id', followup.id)
        .select()
        .single()

      if (data) onFollowupChange(data as CampaignFollowup)
      setStats(null)
      setRecentEmails([])
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
  }

  if (locked) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 flex flex-col items-center justify-center text-center gap-3">
        <Lock className="w-8 h-8 text-gray-300" />
        <p className="text-gray-500 font-medium">Follow-Up 2 is locked</p>
        <p className="text-sm text-gray-400">
          Complete Follow-Up 1 before scheduling this round.
        </p>
      </div>
    )
  }

  const status = followup?.scheduled_status || 'draft'
  const isScheduled = status === 'scheduled'
  const isCompleted = status === 'completed'
  const isCancelled = status === 'cancelled'
  const showCompose = status === 'draft' || status === 'cancelled'

  const sentPercent =
    stats && stats.total > 0
      ? Math.round((stats.sent / stats.total) * 100)
      : 0
  const failedPercent =
    stats && stats.total > 0
      ? Math.round((stats.failed / stats.total) * 100)
      : 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          Follow-Up {round}
        </h3>
        <StatusBadge status={status} />
      </div>

      {(isScheduled || isCompleted) && stats && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900">Performance</h4>
            <div className="flex items-center gap-3">
              {isScheduled && (
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  Auto-refresh
                </label>
              )}
              <button
                onClick={loadStats}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                <RefreshCw className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500">Progress</span>
              <span className="text-xs font-medium text-gray-700">
                {stats.sent + stats.failed} / {stats.total}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div className="h-full flex">
                {sentPercent > 0 && (
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${sentPercent}%` }}
                  />
                )}
                {failedPercent > 0 && (
                  <div
                    className="bg-red-400 transition-all duration-500"
                    style={{ width: `${failedPercent}%` }}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100 text-center">
              <div className="text-2xl font-bold text-emerald-700">{stats.sent}</div>
              <div className="text-xs text-emerald-600 mt-0.5">Sent</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-100 text-center">
              <div className="text-2xl font-bold text-amber-700">{stats.pending}</div>
              <div className="text-xs text-amber-600 mt-0.5">Pending</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-100 text-center">
              <div className="text-2xl font-bold text-red-700">{stats.failed}</div>
              <div className="text-xs text-red-600 mt-0.5">Failed</div>
            </div>
          </div>

          {isScheduled && (
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>
                {followup?.daily_start} – {followup?.daily_end} IST &middot; every{' '}
                {followup?.interval_minutes} min
              </span>
            </div>
          )}

          {recentEmails.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Recipient
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Subject
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Scheduled
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentEmails.map((email) => (
                    <tr key={email.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-900">{email.to_email}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-xs truncate">
                        {email.subject}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                        {new Date(email.send_at).toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`badge ${
                            email.status === 'sent'
                              ? 'badge-sent'
                              : email.status === 'failed'
                              ? 'badge-failed'
                              : 'badge-pending'
                          }`}
                        >
                          {email.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {isScheduled && (
              <button
                onClick={cancelFollowup}
                disabled={cancelling}
                className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium border border-red-200"
              >
                <XCircle className="w-4 h-4" />
                {cancelling ? 'Cancelling...' : 'Cancel'}
              </button>
            )}
            {(isCompleted || isCancelled) && (
              <button
                onClick={resetToDraft}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Edit &amp; Reschedule
              </button>
            )}
          </div>
        </div>
      )}

      {showCompose && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-5">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">
                  Message Variants (A/B Testing)
                </h4>
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
                <p className="text-sm text-gray-600 mb-3">
                  ~{Math.floor(100 / variants.length)}% each /{' '}
                  {Math.ceil(eligibleCount / variants.length)} prospects per variant
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
                      placeholder="Follow-up subject (can use {{business_name}} etc)"
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
                      placeholder="Follow-up message body with {{variables}}"
                      rows={10}
                      className="input-field font-mono text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-500" />
                Schedule Settings
              </h4>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Daily Start (IST)
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
                      Daily End (IST)
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

                {eligibleCount > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h5 className="text-sm font-semibold text-blue-900 mb-2">
                      Schedule Summary
                    </h5>
                    <div className="text-sm text-blue-800 space-y-1">
                      <div>
                        {eligibleCount} eligible prospects, every {intervalMinutes} min
                      </div>
                      <div>
                        ~{summary.emailsPerDay} emails per day ({summary.windowMinutes} min
                        window)
                      </div>
                      <div>Estimated {summary.daysNeeded} day(s) to complete</div>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={scheduleFollowup}
                disabled={scheduling || eligibleCount === 0}
                className="btn-primary w-full mt-5 flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {scheduling
                  ? 'Scheduling...'
                  : `Schedule Follow-Up ${round} (${eligibleCount} prospects)`}
              </button>
            </div>
          </div>

          <div className="card h-fit">
            <h4 className="font-semibold mb-4">Live Preview</h4>
            {eligibleCount > 0 && activeVar ? (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-xs text-gray-400 mb-1">Subject:</div>
                  <div className="font-semibold text-sm mb-3">
                    {activeVar.subject || (
                      <span className="text-gray-400 italic">No subject yet</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mb-1">Body:</div>
                  <div className="whitespace-pre-wrap text-sm text-gray-700">
                    {activeVar.body || (
                      <span className="text-gray-400 italic">No body yet</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Variables will be replaced with real prospect data when sent.
                </p>
              </div>
            ) : (
              <p className="text-gray-400 text-center py-10 text-sm">
                {eligibleCount === 0
                  ? 'All prospects are excluded from follow-ups'
                  : 'Compose a message to see preview'}
              </p>
            )}
          </div>
        </div>
      )}

      {isScheduled && !stats && (
        <div className="card border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">
                Follow-Up {round} is Scheduled
              </p>
              <p className="text-sm text-amber-700 mt-1">
                {followup?.scheduled_count} emails queued and will be sent automatically.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FollowUpTab({
  campaign,
  campaignProspects,
  onProspectsChange,
}: Props) {
  const [followups, setFollowups] = useState<CampaignFollowup[]>([])
  const [loading, setLoading] = useState(true)
  const [excludingId, setExcludingId] = useState<string | null>(null)

  const eligible = campaignProspects.filter((p) => !p.excluded_from_followup)
  const excluded = campaignProspects.filter((p) => p.excluded_from_followup)

  const fu1 = followups.find((f) => f.round === 1) || null
  const fu2 = followups.find((f) => f.round === 2) || null
  const fu2Locked = !fu1 || fu1.scheduled_status !== 'completed'

  useEffect(() => {
    loadFollowups()
  }, [campaign.id])

  async function loadFollowups() {
    try {
      const { data } = await supabase
        .from('campaign_followups')
        .select('*')
        .eq('campaign_id', campaign.id)
        .order('round', { ascending: true })

      setFollowups((data as CampaignFollowup[]) || [])
    } catch (err) {
      console.error('Error loading followups:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleFollowupChange(updated: CampaignFollowup) {
    setFollowups((prev) => {
      const exists = prev.find((f) => f.id === updated.id)
      if (exists) return prev.map((f) => (f.id === updated.id ? updated : f))
      return [...prev, updated]
    })
  }

  async function excludeProspect(prospectId: string, email: string) {
    if (
      !confirm(
        `Permanently exclude ${email} from ALL follow-up rounds?\n\nThis cannot be undone.`
      )
    )
      return

    setExcludingId(prospectId)
    try {
      const { error } = await supabase
        .from('campaign_prospects')
        .update({ excluded_from_followup: true })
        .eq('campaign_id', campaign.id)
        .eq('prospect_id', prospectId)

      if (error) throw error
      onProspectsChange()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setExcludingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        Loading follow-ups...
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">
            Prospect Eligibility
          </h3>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-emerald-700 font-medium">
              {eligible.length} eligible
            </span>
            {excluded.length > 0 && (
              <span className="text-gray-400">{excluded.length} excluded</span>
            )}
          </div>
        </div>

        {campaignProspects.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No prospects in this campaign.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Email
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Business
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {campaignProspects.map((p) => (
                  <tr
                    key={p.id}
                    className={p.excluded_from_followup ? 'opacity-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-3 py-2 text-gray-900">
                      <span
                        className={
                          p.excluded_from_followup ? 'line-through text-gray-400' : ''
                        }
                      >
                        {p.email}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {p.business_name || '-'}
                    </td>
                    <td className="px-3 py-2">
                      {p.excluded_from_followup ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Excluded
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Eligible
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!p.excluded_from_followup && (
                        <button
                          onClick={() => excludeProspect(p.id, p.email)}
                          disabled={excludingId === p.id}
                          className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                        >
                          {excludingId === p.id ? 'Excluding...' : 'Exclude'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
              1
            </div>
            <h2 className="text-base font-semibold text-gray-900">Round 1</h2>
          </div>
          <RoundPanel
            round={1}
            followup={fu1}
            locked={false}
            eligibleCount={eligible.length}
            campaign={campaign}
            onFollowupChange={handleFollowupChange}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                fu2Locked
                  ? 'bg-gray-200 text-gray-400'
                  : 'bg-blue-600 text-white'
              }`}
            >
              2
            </div>
            <h2
              className={`text-base font-semibold ${
                fu2Locked ? 'text-gray-400' : 'text-gray-900'
              }`}
            >
              Round 2
            </h2>
            {fu2Locked && (
              <Lock className="w-4 h-4 text-gray-400" />
            )}
          </div>
          <RoundPanel
            round={2}
            followup={fu2}
            locked={fu2Locked}
            eligibleCount={eligible.length}
            campaign={campaign}
            onFollowupChange={handleFollowupChange}
          />
        </div>
      </div>
    </div>
  )
}
