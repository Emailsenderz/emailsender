import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import {
  Send,
  Users,
  Layers,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  BarChart2,
} from 'lucide-react'

export default function Dashboard() {
  const [stats, setStats] = useState({
    prospects: 0,
    campaigns: 0,
    activeCampaigns: 0,
    pending: 0,
    sent: 0,
    failed: 0,
  })
  const [loading, setLoading] = useState(true)
  const [testEmail, setTestEmail] = useState({ to: '', subject: '', body: '' })
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null)
  const [sendDetails, setSendDetails] = useState<{ processed: number; sent: number; failed: number } | null>(null)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      const [prospectsRes, campaignsRes, emailsRes] = await Promise.all([
        supabase.from('prospects').select('id', { count: 'exact', head: true }),
        supabase.from('campaigns').select('id, scheduled_status'),
        supabase.from('emails').select('status'),
      ])

      const emailData = emailsRes.data || []
      const campaignData = campaignsRes.data || []
      setStats({
        prospects: prospectsRes.count || 0,
        campaigns: campaignData.length,
        activeCampaigns: campaignData.filter((c) => c.scheduled_status === 'scheduled').length,
        pending: emailData.filter((e) => e.status === 'pending').length,
        sent: emailData.filter((e) => e.status === 'sent').length,
        failed: emailData.filter((e) => e.status === 'failed').length,
      })
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
  }

  async function sendTestEmail() {
    if (!testEmail.to || !testEmail.subject || !testEmail.body) {
      alert('Please fill all fields')
      return
    }

    setSending(true)
    setSendResult(null)
    setSendDetails(null)
    try {
      const { error } = await supabase.from('emails').insert({
        to_email: testEmail.to,
        subject: testEmail.subject,
        body: testEmail.body,
        send_at: new Date().toISOString(),
        status: 'pending',
      })

      if (error) throw error

      const res = await fetch('/api/send-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const json = await res.json()
      setSendDetails({
        processed: json.processed ?? 0,
        sent: json.sent ?? 0,
        failed: json.failed ?? 0,
      })

      setTestEmail({ to: '', subject: '', body: '' })
      setSendResult('success')
      loadStats()
    } catch (error: any) {
      console.error('Error sending test email:', error)
      setSendResult('error')
    } finally {
      setSending(false)
    }
  }

  const deliveryRate =
    stats.sent + stats.failed > 0
      ? Math.round((stats.sent / (stats.sent + stats.failed)) * 100)
      : null

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Auto email campaign system overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="stat-card flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-500">Total Prospects</div>
            <div className="text-3xl font-bold text-gray-900 mt-0.5">{stats.prospects.toLocaleString()}</div>
          </div>
          <Link to="/prospects" className="text-blue-600 hover:text-blue-700 flex-shrink-0">
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        <div className="stat-card flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Layers className="w-6 h-6 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-500">Campaigns</div>
            <div className="text-3xl font-bold text-gray-900 mt-0.5">{stats.campaigns}</div>
            {stats.activeCampaigns > 0 && (
              <div className="text-xs text-green-600 font-medium mt-0.5">
                {stats.activeCampaigns} currently sending
              </div>
            )}
          </div>
          <Link to="/campaigns" className="text-blue-600 hover:text-blue-700 flex-shrink-0">
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        <div className="stat-card flex items-center gap-4 sm:col-span-2 lg:col-span-1">
          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <BarChart2 className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-500">Delivery Rate</div>
            <div className="text-3xl font-bold text-gray-900 mt-0.5">
              {deliveryRate !== null ? `${deliveryRate}%` : '—'}
            </div>
            {stats.sent > 0 && (
              <div className="text-xs text-gray-500 mt-0.5">
                {stats.sent.toLocaleString()} sent / {stats.failed} failed
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="stat-card border-l-4 border-l-yellow-400">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-yellow-500" />
            <span className="text-sm font-medium text-yellow-700">Pending</span>
          </div>
          <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
        </div>

        <div className="stat-card border-l-4 border-l-green-400">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium text-green-700">Sent</span>
          </div>
          <div className="text-3xl font-bold text-green-600">{stats.sent.toLocaleString()}</div>
        </div>

        <div className="stat-card border-l-4 border-l-red-400">
          <div className="flex items-center gap-3 mb-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm font-medium text-red-700">Failed</span>
          </div>
          <div className="text-3xl font-bold text-red-600">{stats.failed}</div>
        </div>
      </div>

      <div className="card max-w-2xl">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Send Quick Test Email</h2>
        <p className="text-sm text-gray-500 mb-6">Send a test email immediately without scheduling</p>

        {sendResult === 'success' && (
          <div className="mb-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              Emails processed successfully.
              {sendDetails && (
                <> Processed: {sendDetails.processed} &middot; Sent: {sendDetails.sent} &middot; Failed: {sendDetails.failed}</>
              )}
            </span>
          </div>
        )}
        {sendResult === 'error' && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            Failed to send. Check your SMTP settings.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Email</label>
            <input
              type="email"
              value={testEmail.to}
              onChange={(e) => setTestEmail({ ...testEmail, to: e.target.value })}
              placeholder="recipient@example.com"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={testEmail.subject}
              onChange={(e) => setTestEmail({ ...testEmail, subject: e.target.value })}
              placeholder="Email subject"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
            <textarea
              value={testEmail.body}
              onChange={(e) => setTestEmail({ ...testEmail, body: e.target.value })}
              placeholder="Email body content"
              rows={6}
              className="input-field"
            />
          </div>

          <button
            onClick={sendTestEmail}
            disabled={sending}
            className="btn-primary flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Sending...' : 'Send Test Email'}
          </button>
        </div>
      </div>
    </div>
  )
}
