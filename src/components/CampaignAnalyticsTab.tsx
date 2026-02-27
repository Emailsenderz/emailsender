import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  RefreshCw,
  CheckCircle,
  Clock,
  AlertTriangle,
  Mail,
} from 'lucide-react'
import type { Campaign } from '../types/campaign'

interface EmailStats {
  pending: number
  sent: number
  failed: number
  total: number
}

interface RecentEmail {
  id: string
  to_email: string
  subject: string
  status: string
  send_at: string
}

interface Props {
  campaign: Campaign
}

export default function CampaignAnalyticsTab({ campaign }: Props) {
  const [stats, setStats] = useState<EmailStats>({
    pending: 0,
    sent: 0,
    failed: 0,
    total: 0,
  })
  const [recentEmails, setRecentEmails] = useState<RecentEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(
    campaign.scheduled_status === 'scheduled'
  )

  useEffect(() => {
    loadAnalytics()
  }, [campaign.id])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(loadAnalytics, 15000)
    return () => clearInterval(interval)
  }, [autoRefresh, campaign.id])

  async function loadAnalytics() {
    try {
      const { data: emails, error } = await supabase
        .from('emails')
        .select('id, to_email, subject, status, send_at')
        .eq('campaign_id', campaign.id)
        .order('send_at', { ascending: false })

      if (error) throw error

      const emailList = emails || []

      setStats({
        pending: emailList.filter((e) => e.status === 'pending').length,
        sent: emailList.filter((e) => e.status === 'sent').length,
        failed: emailList.filter((e) => e.status === 'failed').length,
        total: emailList.length,
      })

      setRecentEmails(emailList.slice(0, 25))
    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const sentPercent = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0
  const failedPercent = stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0
  const pendingPercent = stats.total > 0 ? Math.round((stats.pending / stats.total) * 100) : 0

  function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading analytics...</div>
      </div>
    )
  }

  if (stats.total === 0) {
    return (
      <div className="card text-center py-12">
        <Mail className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">
          No emails have been scheduled for this campaign yet.
        </p>
        <p className="text-sm text-gray-400 mt-1">
          Go to Compose & Schedule to queue emails.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Campaign Performance
        </h3>
        <div className="flex items-center gap-3">
          {campaign.scheduled_status === 'scheduled' && (
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
            onClick={loadAnalytics}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="card">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Overall Progress
            </span>
            <span className="text-sm font-semibold text-gray-900">
              {stats.sent + stats.failed} / {stats.total}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
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
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Sent {sentPercent}%
            </span>
            {failedPercent > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                Failed {failedPercent}%
              </span>
            )}
            {pendingPercent > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
                Pending {pendingPercent}%
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-800">Sent</span>
            </div>
            <div className="text-3xl font-bold text-emerald-700">
              {stats.sent}
            </div>
          </div>

          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">Pending</span>
            </div>
            <div className="text-3xl font-bold text-amber-700">
              {stats.pending}
            </div>
          </div>

          <div className="bg-red-50 rounded-xl p-4 border border-red-100">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="text-sm font-medium text-red-800">Failed</span>
            </div>
            <div className="text-3xl font-bold text-red-700">
              {stats.failed}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h4 className="font-semibold text-gray-900 mb-4">
          Recent Emails ({recentEmails.length} of {stats.total})
        </h4>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Recipient
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Subject
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Scheduled
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentEmails.map((email) => (
                <tr key={email.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {email.to_email}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                    {email.subject}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatTime(email.send_at)}
                  </td>
                  <td className="px-4 py-3 text-sm">
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
      </div>
    </div>
  )
}
