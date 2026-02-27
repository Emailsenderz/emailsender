import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Papa from 'papaparse'
import {
  Plus,
  Users,
  Pencil,
  Layers,
  Trash2,
  Copy,
  BarChart2,
  Check,
  X,
  MoreVertical,
  CornerDownRight,
} from 'lucide-react'
import type { Campaign, Prospect, CampaignProspect, CampaignFollowup } from '../types/campaign'
import CampaignProspectsTab from '../components/CampaignProspectsTab'
import ComposeScheduleTab from '../components/ComposeScheduleTab'
import CampaignAnalyticsTab from '../components/CampaignAnalyticsTab'
import FollowUpTab from '../components/FollowUpTab'

function getStatusBadge(campaign: Campaign) {
  if (campaign.scheduled_status === 'scheduled') {
    return <span className="badge badge-pending">Sending</span>
  }
  if (campaign.scheduled_status === 'completed') {
    return <span className="badge badge-sent">Completed</span>
  }
  if (campaign.scheduled_status === 'cancelled') {
    return <span className="badge badge-failed">Cancelled</span>
  }
  if (campaign.is_active) {
    return <span className="badge badge-active">Active</span>
  }
  return <span className="badge badge-inactive">Draft</span>
}

function FollowupStatusLine({ followups }: { followups: CampaignFollowup[] }) {
  if (followups.length === 0) return null

  const fu1 = followups.find((f) => f.round === 1)
  const fu2 = followups.find((f) => f.round === 2)

  const colorMap: Record<string, string> = {
    draft: 'text-gray-500',
    scheduled: 'text-amber-600',
    completed: 'text-emerald-600',
    cancelled: 'text-red-500',
  }

  return (
    <div className="flex items-center gap-2 text-xs mt-1">
      <CornerDownRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
      {fu1 && (
        <span className={`font-medium ${colorMap[fu1.scheduled_status] || 'text-gray-500'}`}>
          FU1: {fu1.scheduled_status}
        </span>
      )}
      {fu2 && (
        <>
          <span className="text-gray-300">/</span>
          <span className={`font-medium ${colorMap[fu2.scheduled_status] || 'text-gray-500'}`}>
            FU2: {fu2.scheduled_status}
          </span>
        </>
      )}
    </div>
  )
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'prospects' | 'compose' | 'analytics' | 'followup'>('prospects')

  const [campaignProspects, setCampaignProspects] = useState<CampaignProspect[]>([])
  const [allProspects, setAllProspects] = useState<Prospect[]>([])
  const [pasteEmails, setPasteEmails] = useState('')
  const [uploading, setUploading] = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [renamingCardId, setRenamingCardId] = useState<string | null>(null)
  const [renamingCardValue, setRenamingCardValue] = useState('')

  const [campaignFollowups, setCampaignFollowups] = useState<Record<string, CampaignFollowup[]>>({})

  useEffect(() => {
    loadCampaigns()
  }, [])

  useEffect(() => {
    if (selectedCampaign) {
      loadCampaignProspects()
      loadAllProspects()
      setTab('prospects')
    }
  }, [selectedCampaign?.id])

  useEffect(() => {
    function handleClickOutside() {
      setOpenMenuId(null)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  async function loadCampaigns() {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      const list: Campaign[] = data || []
      setCampaigns(list)

      const completedIds = list
        .filter((c) => c.scheduled_status === 'completed')
        .map((c) => c.id)

      if (completedIds.length > 0) {
        const { data: fuData } = await supabase
          .from('campaign_followups')
          .select('*')
          .in('campaign_id', completedIds)

        if (fuData) {
          const grouped: Record<string, CampaignFollowup[]> = {}
          for (const fu of fuData as CampaignFollowup[]) {
            if (!grouped[fu.campaign_id]) grouped[fu.campaign_id] = []
            grouped[fu.campaign_id].push(fu)
          }
          setCampaignFollowups(grouped)
        }
      }
    } catch (error) {
      console.error('Error loading campaigns:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadCampaignProspects() {
    if (!selectedCampaign) return

    try {
      const { data, error } = await supabase
        .from('campaign_prospects')
        .select(`
          prospect_id,
          excluded_from_followup,
          prospects (*)
        `)
        .eq('campaign_id', selectedCampaign.id)

      if (error) throw error

      const prospects: CampaignProspect[] =
        data?.map((cp: any) => ({
          ...cp.prospects,
          campaign_id: selectedCampaign.id,
          excluded_from_followup: cp.excluded_from_followup ?? false,
        })) || []

      setCampaignProspects(prospects)
    } catch (error) {
      console.error('Error loading campaign prospects:', error)
    }
  }

  async function loadAllProspects() {
    try {
      const { data, error } = await supabase
        .from('prospects')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setAllProspects(data || [])
    } catch (error) {
      console.error('Error loading prospects:', error)
    }
  }

  async function createCampaign() {
  if (!newCampaignName.trim() || !user) return

  try {
    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name: newCampaignName.trim(),
        user_id: undefined,
        is_active: false,
        scheduled_status: 'draft',
        scheduled_count: 0,
        daily_start: null,
        daily_end: null,
        interval_minutes: null,
      })
      .select()
      .single()

    if (error) throw error

    setCampaigns([data, ...campaigns])
    setNewCampaignName('')
  } catch (error: any) {
    console.error('Error creating campaign:', error)
    alert('Error: ' + error.message)
  }
}

  async function renameCampaign(id: string, newName: string) {
    if (!newName.trim()) return

    try {
      const { error } = await supabase
        .from('campaigns')
        .update({ name: newName.trim() })
        .eq('id', id)

      if (error) throw error

      setCampaigns(campaigns.map((c) => (c.id === id ? { ...c, name: newName.trim() } : c)))

      if (selectedCampaign?.id === id) {
        setSelectedCampaign({ ...selectedCampaign, name: newName.trim() })
      }
    } catch (error: any) {
      console.error('Error renaming campaign:', error)
      alert('Error: ' + error.message)
    }
  }

  async function deleteCampaign(campaign: Campaign) {
    const warning =
      campaign.scheduled_status === 'scheduled'
        ? `This campaign has scheduled emails that haven't been sent yet. Deleting will remove everything.\n\nDelete "${campaign.name}"?`
        : `Delete "${campaign.name}" and all its data (prospects links, queued emails)?`

    if (!confirm(warning)) return

    try {
      await supabase
        .from('emails')
        .delete()
        .eq('campaign_id', campaign.id)

      await supabase
        .from('campaign_prospects')
        .delete()
        .eq('campaign_id', campaign.id)

      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaign.id)

      if (error) throw error

      setCampaigns(campaigns.filter((c) => c.id !== campaign.id))

      if (selectedCampaign?.id === campaign.id) {
        setSelectedCampaign(null)
      }
    } catch (error: any) {
      console.error('Error deleting campaign:', error)
      alert('Error: ' + error.message)
    }
  }

  async function duplicateCampaign(campaign: Campaign) {
    if (!user) return

    try {
      const { data: newCampaign, error: createError } = await supabase
        .from('campaigns')
        .insert({
          name: `${campaign.name} (copy)`,
          user_id: undefined,
          is_active: false,
        })
        .select()
        .single()

      if (createError) throw createError

      const { data: existingLinks } = await supabase
        .from('campaign_prospects')
        .select('prospect_id')
        .eq('campaign_id', campaign.id)

      if (existingLinks && existingLinks.length > 0) {
        const newLinks = existingLinks.map((link) => ({
          campaign_id: newCampaign.id,
          prospect_id: link.prospect_id,
        }))

        const { error: linkError } = await supabase
          .from('campaign_prospects')
          .insert(newLinks)

        if (linkError) throw linkError
      }

      setCampaigns([newCampaign, ...campaigns])
      alert(`Duplicated "${campaign.name}" with ${existingLinks?.length || 0} prospects`)
    } catch (error: any) {
      console.error('Error duplicating campaign:', error)
      alert('Error: ' + error.message)
    }
  }

  function detectEmailColumn(headers: string[]): string | null {
    const emailPatterns = ['email', 'e-mail', 'mail', 'contact']
    return (
      headers.find((h) =>
        emailPatterns.some((p) => h.toLowerCase().includes(p))
      ) || null
    )
  }

  function fuzzyMatchColumn(headers: string[], target: string): string | null {
    const normalized = target.toLowerCase().replace(/[_\s-]/g, '')
    return (
      headers.find((h) =>
        h.toLowerCase().replace(/[_\s-]/g, '').includes(normalized)
      ) || null
    )
  }

  async function handleFileUpload(file: File) {
    if (!selectedCampaign) return

    setUploading(true)
    try {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const headers = results.meta.fields || []
            const emailCol = detectEmailColumn(headers)

            if (!emailCol) {
              alert('Could not detect email column in CSV')
              setUploading(false)
              return
            }

            const existingEmails = new Set(
              campaignProspects.map((p) => p.email.toLowerCase())
            )
            let skipped = 0

            const newProspects = results.data
              .filter((row: any) => {
                const email = row[emailCol]?.trim()
                if (!email || existingEmails.has(email.toLowerCase())) {
                  if (email) skipped++
                  return false
                }
                return true
              })
              .map((row: any) => ({
                email: row[emailCol]?.trim(),
                user_id: undefined,
                first_name:
                  row[fuzzyMatchColumn(headers, 'first_name') || ''] || null,
                business_name:
                  row[fuzzyMatchColumn(headers, 'business_name') || ''] || null,
                company:
                  row[fuzzyMatchColumn(headers, 'company') || ''] || null,
                city: row[fuzzyMatchColumn(headers, 'city') || ''] || null,
                state: row[fuzzyMatchColumn(headers, 'state') || ''] || null,
                phone: row[fuzzyMatchColumn(headers, 'phone') || ''] || null,
                overall_score:
                  row[fuzzyMatchColumn(headers, 'overall_score') || ''] || null,
                is_safe_to_send:
                  row[fuzzyMatchColumn(headers, 'is_safe_to_send') || ''] ||
                  null,
              }))

            if (newProspects.length === 0) {
              alert(
                skipped > 0
                  ? `All ${skipped} emails already exist in this campaign`
                  : 'No valid prospects found in file'
              )
              setUploading(false)
              return
            }

            const { data: insertedProspects, error: prospectError } =
              await supabase
                .from('prospects')
                .upsert(newProspects, {
                  onConflict: 'email',
                  ignoreDuplicates: false,
                })
                .select()

            if (prospectError) throw prospectError

            const campaignProspectLinks = insertedProspects.map((p) => ({
              campaign_id: selectedCampaign.id,
              prospect_id: p.id,
            }))

            const { error: linkError } = await supabase
              .from('campaign_prospects')
              .insert(campaignProspectLinks)

            if (linkError) throw linkError

            alert(
              `Added ${newProspects.length} prospects` +
                (skipped > 0 ? `, skipped ${skipped} duplicates` : '')
            )
            loadCampaignProspects()
          } catch (error: any) {
            console.error('Error processing CSV:', error)
            alert('Error: ' + error.message)
          } finally {
            setUploading(false)
          }
        },
        error: (error: any) => {
          console.error('CSV parse error:', error)
          alert('Error parsing CSV: ' + error.message)
          setUploading(false)
        },
      })
    } catch (error: any) {
      console.error('Error uploading file:', error)
      alert('Error: ' + error.message)
      setUploading(false)
    }
  }

  async function handlePasteEmails() {
    if (!selectedCampaign || !pasteEmails.trim()) return

    try {
      const emails = pasteEmails
        .split(/[\n,;]+/)
        .map((e) => e.trim())
        .filter((e) => e && e.includes('@'))

      const existingEmails = new Set(
        campaignProspects.map((p) => p.email.toLowerCase())
      )
      const newEmails = emails.filter(
        (e) => !existingEmails.has(e.toLowerCase())
      )
      const skipped = emails.length - newEmails.length

      if (newEmails.length === 0) {
        alert(
          skipped > 0
            ? `All ${skipped} emails already exist in this campaign`
            : 'No valid emails found'
        )
        return
      }

      const newProspects = newEmails.map((email) => ({ email, user_id: user?.id }))

      const { data: insertedProspects, error: prospectError } = await supabase
        .from('prospects')
        .upsert(newProspects, {
          onConflict: 'email',
          ignoreDuplicates: false,
        })
        .select()

      if (prospectError) throw prospectError

      const campaignProspectLinks = insertedProspects.map((p) => ({
        campaign_id: selectedCampaign.id,
        prospect_id: p.id,
      }))

      const { error: linkError } = await supabase
        .from('campaign_prospects')
        .insert(campaignProspectLinks)

      if (linkError) throw linkError

      alert(
        `Added ${newEmails.length} prospects` +
          (skipped > 0 ? `, skipped ${skipped} duplicates` : '')
      )
      setPasteEmails('')
      loadCampaignProspects()
    } catch (error: any) {
      console.error('Error pasting emails:', error)
      alert('Error: ' + error.message)
    }
  }

  async function addProspectFromGlobal(prospect: Prospect) {
    if (!selectedCampaign) return

    try {
      const { error } = await supabase.from('campaign_prospects').insert({
        campaign_id: selectedCampaign.id,
        prospect_id: prospect.id,
      })

      if (error) throw error

      loadCampaignProspects()
    } catch (error: any) {
      if (error.message.includes('duplicate')) {
        alert('This prospect is already in this campaign')
      } else {
        console.error('Error adding prospect:', error)
        alert('Error: ' + error.message)
      }
    }
  }

  async function removeProspectFromCampaign(prospectId: string) {
    if (!selectedCampaign || !confirm('Remove this prospect from campaign?'))
      return

    try {
      const { error } = await supabase
        .from('campaign_prospects')
        .delete()
        .eq('campaign_id', selectedCampaign.id)
        .eq('prospect_id', prospectId)

      if (error) throw error

      loadCampaignProspects()
    } catch (error: any) {
      console.error('Error removing prospect:', error)
      alert('Error: ' + error.message)
    }
  }

  function handleCampaignUpdate(updated: Campaign) {
    setSelectedCampaign(updated)
    setCampaigns(campaigns.map((c) => (c.id === updated.id ? updated : c)))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (selectedCampaign) {
    const isCompleted = selectedCampaign.scheduled_status === 'completed'

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => {
                setSelectedCampaign(null)
                loadCampaigns()
              }}
              className="text-blue-600 hover:text-blue-700 mb-2 text-sm font-medium"
            >
              &larr; Back to Campaigns
            </button>
            <div className="flex items-center gap-3">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        renameCampaign(selectedCampaign.id, editNameValue)
                        setEditingName(false)
                      }
                      if (e.key === 'Escape') setEditingName(false)
                    }}
                    autoFocus
                    className="text-3xl font-bold text-gray-900 border-b-2 border-blue-500 bg-transparent outline-none py-0"
                  />
                  <button
                    onClick={() => {
                      renameCampaign(selectedCampaign.id, editNameValue)
                      setEditingName(false)
                    }}
                    className="p-1 text-green-600 hover:text-green-700"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <h1
                  className="text-3xl font-bold text-gray-900 cursor-pointer hover:text-gray-700 group"
                  onClick={() => {
                    setEditNameValue(selectedCampaign.name)
                    setEditingName(true)
                  }}
                >
                  {selectedCampaign.name}
                  <Pencil className="w-4 h-4 inline ml-2 opacity-0 group-hover:opacity-50 transition-opacity" />
                </h1>
              )}
            </div>
            <div className="mt-2">{getStatusBadge(selectedCampaign)}</div>
          </div>

          <button
            onClick={() => deleteCampaign(selectedCampaign)}
            className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>

        <div className="border-b border-gray-200">
          <nav className="flex gap-4">
            <button
              onClick={() => setTab('prospects')}
              className={`pb-4 px-2 border-b-2 font-medium ${
                tab === 'prospects'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Prospects ({campaignProspects.length})
            </button>
            <button
              onClick={() => setTab('compose')}
              className={`pb-4 px-2 border-b-2 font-medium ${
                tab === 'compose'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Pencil className="w-4 h-4 inline mr-2" />
              Compose &amp; Schedule
            </button>
            <button
              onClick={() => setTab('analytics')}
              className={`pb-4 px-2 border-b-2 font-medium ${
                tab === 'analytics'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <BarChart2 className="w-4 h-4 inline mr-2" />
              Analytics
            </button>
            {isCompleted && (
              <button
                onClick={() => setTab('followup')}
                className={`pb-4 px-2 border-b-2 font-medium flex items-center gap-1.5 ${
                  tab === 'followup'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <CornerDownRight className="w-4 h-4" />
                Follow-Up
              </button>
            )}
          </nav>
        </div>

        {tab === 'prospects' && (
          <CampaignProspectsTab
            campaign={selectedCampaign}
            campaignProspects={campaignProspects}
            allProspects={allProspects}
            pasteEmails={pasteEmails}
            setPasteEmails={setPasteEmails}
            uploading={uploading}
            onFileUpload={handleFileUpload}
            onPasteEmails={handlePasteEmails}
            onAddFromGlobal={addProspectFromGlobal}
            onRemoveProspect={removeProspectFromCampaign}
          />
        )}

        {tab === 'compose' && (
          <ComposeScheduleTab
            campaign={selectedCampaign}
            campaignProspects={campaignProspects}
            onCampaignUpdate={handleCampaignUpdate}
          />
        )}

        {tab === 'analytics' && (
          <CampaignAnalyticsTab campaign={selectedCampaign} />
        )}

        {tab === 'followup' && isCompleted && (
          <FollowUpTab
            campaign={selectedCampaign}
            campaignProspects={campaignProspects}
            onProspectsChange={loadCampaignProspects}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
          <p className="mt-2 text-gray-600">
            Create and manage email campaigns
          </p>
        </div>
      </div>

      <div className="card max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">Create New Campaign</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newCampaignName}
            onChange={(e) => setNewCampaignName(e.target.value)}
            placeholder="Campaign name (e.g., SEO Outreach Q1)"
            className="input-field flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') createCampaign()
            }}
          />
          <button
            onClick={createCampaign}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {campaigns.map((campaign) => (
          <div
            key={campaign.id}
            className="card hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                {renamingCardId === campaign.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={renamingCardValue}
                      onChange={(e) => setRenamingCardValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          renameCampaign(campaign.id, renamingCardValue)
                          setRenamingCardId(null)
                        }
                        if (e.key === 'Escape') setRenamingCardId(null)
                      }}
                      autoFocus
                      className="text-lg font-semibold text-gray-900 border-b-2 border-blue-500 bg-transparent outline-none w-full"
                    />
                    <button
                      onClick={() => {
                        renameCampaign(campaign.id, renamingCardValue)
                        setRenamingCardId(null)
                      }}
                      className="p-0.5 text-green-600 hover:text-green-700 flex-shrink-0"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <h3 className="text-lg font-semibold text-gray-900 truncate">
                    {campaign.name}
                  </h3>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  Created {new Date(campaign.created_at).toLocaleDateString()}
                </p>
                {campaign.scheduled_status === 'completed' && (
                  <FollowupStatusLine
                    followups={campaignFollowups[campaign.id] || []}
                  />
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {getStatusBadge(campaign)}

                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenMenuId(openMenuId === campaign.id ? null : campaign.id)
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>

                  {openMenuId === campaign.id && (
                    <div
                      className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setRenamingCardId(campaign.id)
                          setRenamingCardValue(campaign.name)
                          setOpenMenuId(null)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Pencil className="w-4 h-4" />
                        Rename
                      </button>
                      <button
                        onClick={() => {
                          duplicateCampaign(campaign)
                          setOpenMenuId(null)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Copy className="w-4 h-4" />
                        Duplicate
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => {
                          deleteCampaign(campaign)
                          setOpenMenuId(null)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {campaign.scheduled_status === 'scheduled' && (
              <div className="mb-4 text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
                <div>
                  {campaign.daily_start} - {campaign.daily_end} IST / every{' '}
                  {campaign.interval_minutes} min
                </div>
                <div>{campaign.scheduled_count} emails queued</div>
              </div>
            )}

            {campaign.scheduled_status === 'completed' && (
              <div className="mb-4 text-xs text-green-700 bg-green-50 rounded-lg p-2">
                {campaign.scheduled_count} emails delivered
              </div>
            )}

            <button
              onClick={() => setSelectedCampaign(campaign)}
              className="btn-primary w-full"
            >
              Open
            </button>
          </div>
        ))}
      </div>

      {campaigns.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Layers className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p>No campaigns yet. Create one above to get started.</p>
        </div>
      )}
    </div>
  )
}
