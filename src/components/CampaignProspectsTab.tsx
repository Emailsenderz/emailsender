import { Trash2, AlertTriangle } from 'lucide-react'
import type { Prospect, CampaignProspect } from '../types/campaign'

interface Props {
  campaign: { scheduled_status: string }
  campaignProspects: CampaignProspect[]
  allProspects: Prospect[]
  pasteEmails: string
  setPasteEmails: (val: string) => void
  uploading: boolean
  onFileUpload: (file: File) => void
  onPasteEmails: () => void
  onAddFromGlobal: (prospect: Prospect) => void
  onRemoveProspect: (prospectId: string) => void
}

export default function CampaignProspectsTab({
  campaign,
  campaignProspects,
  allProspects,
  pasteEmails,
  setPasteEmails,
  uploading,
  onFileUpload,
  onPasteEmails,
  onAddFromGlobal,
  onRemoveProspect,
}: Props) {
  const prospectsNotInCampaign = allProspects.filter(
    (p) => !campaignProspects.some((cp) => cp.id === p.id)
  )

  const isCompleted = campaign.scheduled_status === 'completed'
  const excludedCount = campaignProspects.filter((p) => p.excluded_from_followup).length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">Upload CSV/Excel</h3>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFileUpload(file)
            }}
            disabled={uploading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {uploading && (
            <p className="mt-2 text-sm text-gray-600">Processing...</p>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold text-lg mb-4">Paste Emails</h3>
          <textarea
            value={pasteEmails}
            onChange={(e) => setPasteEmails(e.target.value)}
            placeholder="Paste emails (one per line or comma separated)"
            rows={3}
            className="input-field mb-2"
          />
          <button onClick={onPasteEmails} className="btn-primary w-full">
            Add Emails
          </button>
        </div>
      </div>

      {prospectsNotInCampaign.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">
            Add from Global Contacts ({prospectsNotInCampaign.length})
          </h3>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {prospectsNotInCampaign.slice(0, 20).map((prospect) => (
              <div
                key={prospect.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <div className="font-medium">{prospect.email}</div>
                  {prospect.business_name && (
                    <div className="text-sm text-gray-600">
                      {prospect.business_name}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onAddFromGlobal(prospect)}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  + Add
                </button>
              </div>
            ))}
            {prospectsNotInCampaign.length > 20 && (
              <p className="text-sm text-gray-500 text-center pt-2">
                ...and {prospectsNotInCampaign.length - 20} more
              </p>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">
            Campaign Prospects ({campaignProspects.length})
          </h3>
          {isCompleted && excludedCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              <AlertTriangle className="w-4 h-4" />
              {excludedCount} excluded from follow-ups
            </div>
          )}
        </div>

        {campaignProspects.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No prospects yet. Upload CSV or paste emails above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Business Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    City
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    State
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Score
                  </th>
                  {isCompleted && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      Follow-Up
                    </th>
                  )}
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {campaignProspects.map((prospect) => (
                  <tr
                    key={prospect.id}
                    className={
                      prospect.excluded_from_followup
                        ? 'opacity-60 bg-gray-50'
                        : 'hover:bg-gray-50'
                    }
                  >
                    <td className="px-4 py-3 text-sm">{prospect.email}</td>
                    <td className="px-4 py-3 text-sm">
                      {prospect.business_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">{prospect.city || '-'}</td>
                    <td className="px-4 py-3 text-sm">{prospect.state || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      {prospect.overall_score || '-'}
                    </td>
                    {isCompleted && (
                      <td className="px-4 py-3 text-sm">
                        {prospect.excluded_from_followup ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Excluded
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-600 font-medium">
                            Eligible
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onRemoveProspect(prospect.id)}
                        className="text-red-600 hover:text-red-700"
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
