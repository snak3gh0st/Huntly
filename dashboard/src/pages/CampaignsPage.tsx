import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Rocket, Pause, Trash2, Play, Copy } from 'lucide-react';
import { useCampaigns, useCreateCampaign, useLaunchCampaign, useStopCampaign, useDeleteCampaign, useCloneCampaign } from '../hooks/useCampaigns';

const statusColor: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  paused: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  completed: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

export default function CampaignsPage() {
  const { data: campaigns, isLoading } = useCampaigns();
  const navigate = useNavigate();
  const createMutation = useCreateCampaign();
  const launchMutation = useLaunchCampaign();
  const stopMutation = useStopCampaign();
  const deleteMutation = useDeleteCampaign();
  const cloneMutation = useCloneCampaign();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [vertical, setVertical] = useState('');
  const [regions, setRegions] = useState('');

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate(
      { name, vertical, regions: regions.split(',').map((r) => r.trim()).filter(Boolean) },
      {
        onSuccess: () => {
          setShowForm(false);
          setName('');
          setVertical('');
          setRegions('');
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-cyan-400 transition-colors"
        >
          <Plus size={16} />
          New Campaign
        </button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4"
        >
          {/* How it works */}
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
            <p className="text-xs text-cyan-300 font-medium mb-1">How search works</p>
            <p className="text-xs text-gray-400">
              Huntly searches Google Maps using: <code className="text-cyan-400 bg-gray-800 px-1.5 py-0.5 rounded">"{vertical} in {regions.split(',')[0]?.trim() || 'region'}"</code>
              {' '}— so write the vertical exactly as you'd type it into Google Maps.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Campaign Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q1 Dental Clinics"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                required
              />
              <p className="text-[10px] text-gray-500 mt-1">Internal label — only you see this</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Business Type</label>
              <input
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                placeholder="dental clinic"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                required
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Type it like a Google Maps search. Examples: <span className="text-gray-400">dental clinic</span>, <span className="text-gray-400">hair salon</span>, <span className="text-gray-400">real estate agent</span>, <span className="text-gray-400">restaurant</span>, <span className="text-gray-400">law firm</span>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Regions</label>
              <input
                value={regions}
                onChange={(e) => setRegions(e.target.value)}
                placeholder="London UK, Dubai UAE, São Paulo Brazil"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                required
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Comma-separated. Use <span className="text-gray-400">City Country</span> format: <span className="text-gray-400">Miami US</span>, <span className="text-gray-400">London UK</span>, <span className="text-gray-400">Dubai UAE</span>
              </p>
            </div>
          </div>

          {/* Live preview */}
          {vertical && regions && (
            <div className="rounded-lg bg-gray-800 px-4 py-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Search preview</p>
              <div className="flex flex-wrap gap-2">
                {regions.split(',').map((r) => r.trim()).filter(Boolean).map((r, i) => (
                  <code key={i} className="text-xs text-gray-300 bg-gray-700 px-2 py-1 rounded">
                    {vertical} in {r}
                  </code>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Campaign list */}
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : campaigns && campaigns.length > 0 ? (
        <div className="space-y-2">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-5 py-4"
            >
              <Link to={`/campaigns/${c.id}`} className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.vertical} - {c.regions.join(', ')}
                </p>
              </Link>
              <div className="flex items-center gap-3 ml-4">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor[c.status] ?? statusColor.draft}`}
                >
                  {c.status}
                </span>
                {c.status === 'draft' && (
                  <button
                    onClick={() => launchMutation.mutate(c.id)}
                    disabled={launchMutation.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
                  >
                    <Rocket size={14} />
                    Launch
                  </button>
                )}
                {c.status === 'active' && (
                  <button
                    onClick={() => { if (confirm(`Stop campaign "${c.name}"? Pipeline will pause.`)) stopMutation.mutate(c.id); }}
                    className="flex items-center gap-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 text-xs font-medium text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                  >
                    <Pause size={14} />
                    Stop
                  </button>
                )}
                {c.status === 'paused' && (
                  <button
                    onClick={() => launchMutation.mutate(c.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors"
                  >
                    <Play size={14} />
                    Resume
                  </button>
                )}
                <button
                  onClick={() => cloneMutation.mutate(c.id, { onSuccess: (data) => navigate(`/campaigns/${data.id}`) })}
                  disabled={cloneMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:border-gray-600 hover:text-gray-300 disabled:opacity-50 transition-colors"
                  title="Clone campaign"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => { if (confirm(`Delete campaign "${c.name}" and ALL its leads? This cannot be undone.`)) deleteMutation.mutate(c.id); }}
                  className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                  title="Delete campaign"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No campaigns yet. Create one to get started.</p>
      )}
    </div>
  );
}
