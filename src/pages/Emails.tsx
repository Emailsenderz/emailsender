import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  RefreshCw,
  Filter,
  X,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  Trash2,
} from 'lucide-react'

interface Email {
  id: string
  to_email: string
  subject: string
  body: string
  send_at: string
  status: 'pending' | 'sent' | 'failed'
  campaign_id: string | null
  variant: string | null
  created_at: string
}

interface Campaign {
  id: string
  name: string
}

type StatusFilter = 'all' | 'pending' | 'sent' | 'failed'

function StatusBadge({ status }: { status: Email['status'] }) {
  if (status === 'sent')
    return (
      <span className="badge badge-sent flex items-center gap-1">
        <CheckCircle className="w-3 h-3" />
        Sent
      </span>
    )
  if (status === 'failed')
    return (
      <span className="badge badge-failed flex items-center gap-1">
        <XCircle className="w-3 h-3" />
        Failed
      </span>
    )
  return (
    <span className="badge badge-pending flex items-center gap-1">
      <Clock className="w-3 h-3" />
      Pending
    </span>
  )
}

export default function Emails() {
  const [emails, setEmails] = useState<Email[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [campaignFilter, setCampaignFilter] = useState<string>('all')
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<'selected' | 'all-filtered' | null>(null)

  useEffect(() => {
    loadEmails()
    loadCampaigns()

    const subscription = supabase
      .channel('emails_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emails' }, () => {
        loadEmails()
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function loadEmails() {
    try {
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .order('send_at', { ascending: false })
        .limit(500)

      if (error) throw error
      setEmails(data || [])
    } catch (error) {
      console.error('Error loading emails:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function loadCampaigns() {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name')
        .order('name', { ascending: true })

      if (error) throw error
      setCampaigns(data || [])
    } catch (error) {
      console.error('Error loading campaigns:', error)
    }
  }

  function handleRefresh() {
    setRefreshing(true)
    loadEmails()
  }

  const filteredEmails = emails.filter((email) => {
    if (statusFilter !== 'all' && email.status !== statusFilter) return false
    if (campaignFilter !== 'all' && (email.campaign_id || 'null') !== campaignFilter) return false
    return true
  })

  const stats = {
    total: emails.length,
    pending: emails.filter((e) => e.status === 'pending').length,
    sent: emails.filter((e) => e.status === 'sent').length,
    failed: emails.filter((e) => e.status === 'failed').length,
  }

  function getCampaignName(campaignId: string | null): string {
    if (!campaignId) return 'Quick Test'
    const campaign = campaigns.find((c) => c.id === campaignId)
    return campaign?.name || 'Unknown Campaign'
  }

  function formatDateTime(dateString: string): string {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const hasFilters = statusFilter !== 'all' || campaignFilter !== 'all'

  const allFilteredSelected =
    filteredEmails.length > 0 && filteredEmails.every((e) => selectedIds.has(e.id))

  function toggleAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredEmails.map((e) => e.id)))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteSelected() {
    setDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      const { error } = await supabase.from('emails').delete().in('id', ids)
      if (error) throw error
      setEmails((prev) => prev.filter((e) => !selectedIds.has(e.id)))
      setSelectedIds(new Set())
    } catch (error) {
      console.error('Error deleting emails:', error)
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(null)
    }
  }

  async function deleteAllFiltered() {
    setDeleting(true)
    try {
      const ids = filteredEmails.map((e) => e.id)
      const { error } = await supabase.from('emails').delete().in('id', ids)
      if (error) throw error
      setEmails((prev) => prev.filter((e) => !ids.includes(e.id)))
      setSelectedIds(new Set())
    } catch (error) {
      console.error('Error deleting emails:', error)
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Email Queue</h1>
          <p className="mt-2 text-gray-600">Monitor scheduled and sent emails</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setStatusFilter('all')}
          className={`stat-card text-left transition-all ${statusFilter === 'all' ? 'ring-2 ring-blue-500' : ''}`}
        >
          <div className="text-sm font-medium text-gray-500 mb-1">Total</div>
          <div className="text-3xl font-bold text-gray-900">{stats.total.toLocaleString()}</div>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
          className={`stat-card text-left transition-all ${statusFilter === 'pending' ? 'ring-2 ring-yellow-400' : ''}`}
        >
          <div className="text-sm font-medium text-yellow-700 mb-1">Pending</div>
          <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'sent' ? 'all' : 'sent')}
          className={`stat-card text-left transition-all ${statusFilter === 'sent' ? 'ring-2 ring-green-400' : ''}`}
        >
          <div className="text-sm font-medium text-green-700 mb-1">Sent</div>
          <div className="text-3xl font-bold text-green-600">{stats.sent.toLocaleString()}</div>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'failed' ? 'all' : 'failed')}
          className={`stat-card text-left transition-all ${statusFilter === 'failed' ? 'ring-2 ring-red-400' : ''}`}
        >
          <div className="text-sm font-medium text-red-700 mb-1">Failed</div>
          <div className="text-3xl font-bold text-red-600">{stats.failed}</div>
        </button>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Filter className="w-4 h-4 text-gray-500" />
            Filter:
          </div>

          <div className="relative">
            <select
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
            >
              <option value="all">All Campaigns</option>
              <option value="null">Quick Tests</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {hasFilters && (
            <button
              onClick={() => { setStatusFilter('all'); setCampaignFilter('all') }}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <X className="w-3.5 h-3.5" />
              Clear filters
            </button>
          )}

          <span className="ml-auto text-sm text-gray-500">
            {filteredEmails.length} of {emails.length} emails
          </span>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-sm font-medium text-blue-700">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => setShowDeleteConfirm('selected')}
              className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 ml-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete selected
            </button>
            {filteredEmails.length > selectedIds.size && (
              <button
                onClick={() => setShowDeleteConfirm('all-filtered')}
                className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
              >
                Delete all {filteredEmails.length} shown
              </button>
            )}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-sm text-gray-500 hover:text-gray-700"
            >
              Clear selection
            </button>
          </div>
        )}

        {filteredEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Mail className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No emails match the current filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="pl-4 pr-2 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">
                    Recipient
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">
                    Subject
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">
                    Campaign
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">
                    Variant
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">
                    Scheduled For
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wide">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredEmails.map((email) => (
                  <tr key={email.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(email.id) ? 'bg-blue-50' : ''}`}>
                    <td className="pl-4 pr-2 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(email.id)}
                        onChange={() => toggleOne(email.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {email.to_email}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                      {email.subject}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {getCampaignName(email.campaign_id)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {email.variant ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {email.variant}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDateTime(email.send_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={email.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedEmail(email)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full shadow-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Confirm Delete</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {showDeleteConfirm === 'selected'
                ? `Permanently delete ${selectedIds.size} email${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`
                : `Permanently delete all ${filteredEmails.length} shown emails? This cannot be undone.`}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={showDeleteConfirm === 'selected' ? deleteSelected : deleteAllFiltered}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedEmail && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedEmail(null)}
        >
          <div
            className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Email Details</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {getCampaignName(selectedEmail.campaign_id)}
                  {selectedEmail.variant && ` — Variant ${selectedEmail.variant}`}
                </p>
              </div>
              <button
                onClick={() => setSelectedEmail(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedEmail.status} />
                <span className="text-sm text-gray-500">
                  {new Date(selectedEmail.send_at).toLocaleString()}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Recipient
                </label>
                <div className="text-sm text-gray-900 font-medium">{selectedEmail.to_email}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Subject
                </label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900">
                  {selectedEmail.subject}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Body
                </label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-sm text-gray-900 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                  {selectedEmail.body}
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 flex justify-end">
              <button
                onClick={() => setSelectedEmail(null)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
