import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Papa from 'papaparse'
import {
  Trash2,
  Upload,
  Search,
  X,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'

interface Prospect {
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
  created_at: string
}

export default function Prospects() {
  const { user } = useAuth()
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadResult, setUploadResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    loadProspects()
  }, [])

  async function loadProspects() {
    try {
      const { data, error } = await supabase
        .from('prospects')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setProspects(data || [])
    } catch (error) {
      console.error('Error loading prospects:', error)
    } finally {
      setLoading(false)
    }
  }

  function detectEmailColumn(headers: string[]): string | null {
    const emailPatterns = ['email', 'e-mail', 'mail', 'contact']
    return (
      headers.find((h) => emailPatterns.some((p) => h.toLowerCase().includes(p))) || null
    )
  }

  function fuzzyMatchColumn(headers: string[], target: string): string | null {
    const normalized = target.toLowerCase().replace(/[_\s-]/g, '')
    return (
      headers.find((h) => h.toLowerCase().replace(/[_\s-]/g, '').includes(normalized)) || null
    )
  }

  async function handleFileUpload(file: File) {
    setUploading(true)
    setUploadResult(null)
    try {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const headers = results.meta.fields || []
            const emailCol = detectEmailColumn(headers)

            if (!emailCol) {
              setUploadResult({ type: 'error', message: 'Could not detect email column in CSV' })
              setUploading(false)
              return
            }

            const existingEmails = new Set(prospects.map((p) => p.email.toLowerCase()))
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
                user_id: user?.id,
                first_name: row[fuzzyMatchColumn(headers, 'first_name') || ''] || null,
                business_name: row[fuzzyMatchColumn(headers, 'business_name') || ''] || null,
                company: row[fuzzyMatchColumn(headers, 'company') || ''] || null,
                city: row[fuzzyMatchColumn(headers, 'city') || ''] || null,
                state: row[fuzzyMatchColumn(headers, 'state') || ''] || null,
                phone: row[fuzzyMatchColumn(headers, 'phone') || ''] || null,
                overall_score: row[fuzzyMatchColumn(headers, 'overall_score') || ''] || null,
                is_safe_to_send: row[fuzzyMatchColumn(headers, 'is_safe_to_send') || ''] || null,
              }))

            if (newProspects.length === 0) {
              setUploadResult({
                type: 'error',
                message: skipped > 0
                  ? `All ${skipped} emails already exist`
                  : 'No valid prospects found in file',
              })
              setUploading(false)
              return
            }

            const { error } = await supabase.from('prospects').insert(newProspects)
            if (error) throw error

            setUploadResult({
              type: 'success',
              message: `Added ${newProspects.length} prospects` + (skipped > 0 ? `, skipped ${skipped} duplicates` : ''),
            })
            loadProspects()
          } catch (error: any) {
            console.error('Error processing CSV:', error)
            setUploadResult({ type: 'error', message: error.message })
          } finally {
            setUploading(false)
          }
        },
        error: (error: any) => {
          setUploadResult({ type: 'error', message: 'Error parsing CSV: ' + error.message })
          setUploading(false)
        },
      })
    } catch (error: any) {
      setUploadResult({ type: 'error', message: error.message })
      setUploading(false)
    }
  }

  async function deleteProspect(id: string) {
    if (!confirm('Delete this prospect? This will also remove them from all campaigns.')) {
      return
    }

    try {
      const { error } = await supabase.from('prospects').delete().eq('id', id)
      if (error) throw error
      setProspects(prospects.filter((p) => p.id !== id))
    } catch (error: any) {
      console.error('Error deleting prospect:', error)
      alert('Error: ' + error.message)
    }
  }

  const filteredProspects = prospects.filter(
    (p) =>
      p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.city?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Global Prospects</h1>
        <p className="mt-2 text-gray-600">
          {prospects.length.toLocaleString()} contacts — reusable across campaigns
        </p>
      </div>

      <div className="card">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
            <Upload className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Upload Prospects</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              CSV with email (required), business_name, first_name, city, state, phone, overall_score
            </p>
          </div>
        </div>

        <label className={`flex items-center justify-center gap-3 px-4 py-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          uploading
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
        }`}>
          <Upload className="w-5 h-5 text-gray-400" />
          <span className="text-sm text-gray-600 font-medium">
            {uploading ? 'Processing...' : 'Click to upload CSV file'}
          </span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={uploading}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileUpload(file)
              e.target.value = ''
            }}
          />
        </label>

        {uploadResult && (
          <div className={`mt-3 flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-sm ${
            uploadResult.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <div className="flex items-center gap-2">
              {uploadResult.type === 'success'
                ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {uploadResult.message}
            </div>
            <button onClick={() => setUploadResult(null)} className="opacity-60 hover:opacity-100 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <h2 className="text-base font-semibold text-gray-900">
            All Prospects
            {searchQuery && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                — {filteredProspects.length} of {prospects.length} shown
              </span>
            )}
          </h2>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by email, name, or city..."
              className="input-field pl-9 pr-8 max-w-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {filteredProspects.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {searchQuery ? (
              <p>No prospects match your search</p>
            ) : (
              <div>
                <Upload className="w-14 h-14 mx-auto mb-4 text-gray-300" />
                <p className="font-medium">No prospects yet</p>
                <p className="text-sm mt-1">Upload a CSV file above to get started</p>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">First Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Business</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">City</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">State</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">Score</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredProspects.map((prospect) => (
                  <tr key={prospect.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{prospect.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{prospect.first_name || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{prospect.business_name || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{prospect.city || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{prospect.state || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{prospect.phone || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{prospect.overall_score || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteProspect(prospect.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete prospect"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
