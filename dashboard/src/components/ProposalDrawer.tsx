import { useState } from 'react';
import {
  useLeadProposals,
  useProposal,
  useGenerateProposal,
  useDeleteProposal,
} from '../hooks/useProposals';
import type { Proposal } from '../types/proposal';
import { DraftStateView } from './proposal/DraftStateView';
import { LiveStateView } from './proposal/LiveStateView';

interface Props {
  open: boolean;
  onClose: () => void;
  lead: {
    id: string;
    businessName: string;
    country: string | null;
  };
}

function isUsLead(country: string | null): boolean {
  if (!country) return false;
  return /^(us|usa|united states(?: of america)?)$/i.test(country.trim());
}

export function ProposalDrawer({ open, onClose, lead }: Props) {
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const { data: proposals } = useLeadProposals(lead.id, { enabled: open });
  const active: Proposal | undefined = proposals?.find((p) => p.id === activeProposalId)
    ?? proposals?.[0];

  // Poll while generating
  const polling = active?.status === 'generating';
  const { data: live } = useProposal(active?.id ?? null, { pollingMs: polling ? 2000 : undefined });
  const proposal = live ?? active;

  const generateMut = useGenerateProposal();
  const deleteMut = useDeleteProposal();

  if (!open) return null;

  const us = isUsLead(lead.country);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-3xl h-full overflow-y-auto bg-gray-950 border-l border-gray-800 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">{lead.businessName}</h2>
            <p className="text-sm text-gray-400 mt-1">Website proposal</p>
          </div>
          <button className="text-gray-400 hover:text-gray-100 text-xl" onClick={onClose}>×</button>
        </div>

        {!proposal && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
            <p className="text-sm text-gray-300">
              No proposal yet. Generate a Claude-drafted website for {lead.businessName}.
            </p>
            {!us && (
              <p className="text-sm text-amber-400">
                Proposal generation is currently US-only. This lead's country is{' '}
                <code className="text-amber-300">{lead.country ?? 'unknown'}</code>.
              </p>
            )}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for the AI (e.g. 'owner mentioned hiring associate dentist')"
              className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm"
              rows={3}
            />
            <button
              disabled={!us || generateMut.isPending}
              onClick={async () => {
                const created = await generateMut.mutateAsync({ leadId: lead.id, notes });
                setActiveProposalId(created.id);
              }}
              className="w-full rounded-lg bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-400 px-4 py-2 text-sm font-medium"
            >
              {generateMut.isPending ? 'Starting…' : 'Generate proposal'}
            </button>
          </div>
        )}

        {proposal?.status === 'generating' && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 text-center">
            <p className="text-sm text-gray-300">Claude is drafting the proposal…</p>
            <p className="text-xs text-gray-500 mt-2">Typically 10–20 seconds</p>
          </div>
        )}

        {proposal?.status === 'failed' && (
          <div className="rounded-xl border border-red-900 bg-red-950 p-5 space-y-3">
            <p className="text-sm text-red-300">Generation failed</p>
            <p className="text-xs text-red-400 font-mono">{proposal.generationError ?? 'Unknown error'}</p>
            <div className="flex gap-2">
              <button
                onClick={() => deleteMut.mutate({ id: proposal.id, leadId: lead.id })}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {proposal?.status === 'draft' && <DraftStateView proposal={proposal} leadId={lead.id} />}

        {(proposal?.status === 'approved'
          || proposal?.status === 'accepted'
          || proposal?.status === 'paid'
          || proposal?.status === 'deployed') && (
          <LiveStateView proposal={proposal} leadId={lead.id} />
        )}
      </div>
    </div>
  );
}
