import type { Proposal } from '../../types/proposal';
import { useProposalAction } from '../../hooks/useProposals';

function StatusBadge({ status }: { status: Proposal['status'] }) {
  const colors: Record<Proposal['status'], string> = {
    generating: 'bg-amber-950 text-amber-300 border-amber-900',
    draft:      'bg-gray-900 text-gray-300 border-gray-800',
    approved:   'bg-cyan-950 text-cyan-300 border-cyan-900',
    accepted:   'bg-violet-950 text-violet-300 border-violet-900',
    paid:       'bg-emerald-950 text-emerald-300 border-emerald-900',
    deployed:   'bg-green-950 text-green-300 border-green-900',
    failed:     'bg-red-950 text-red-300 border-red-900',
  };
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${colors[status]}`}>{status}</span>;
}

export function LiveStateView({ proposal, leadId: _leadId }: { proposal: Proposal; leadId: string }) {
  const sendEmailMut    = useProposalAction('send-email');
  const markPaidMut     = useProposalAction('mark-paid');
  const deployMut       = useProposalAction('deploy');
  const sendDeliveryMut = useProposalAction('send-delivery');

  const proposalUrl = `${window.location.origin}/proposal/${proposal.token}`;
  const siteUrl = proposal.deployedSlug
    ? `${window.location.origin}/sites/${proposal.deployedSlug}`
    : null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <StatusBadge status={proposal.status} />
          {proposal.finalTier && (
            <span className="text-sm text-gray-300">
              {proposal.finalTier} — ${proposal.priceCents ? Math.round(proposal.priceCents / 100) : '—'}
            </span>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Proposal URL</p>
          <a href={proposalUrl} target="_blank" rel="noopener" className="text-sm text-cyan-400 break-all">{proposalUrl}</a>
        </div>

        {siteUrl && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Deployed site</p>
            <a href={siteUrl} target="_blank" rel="noopener" className="text-sm text-emerald-400 break-all">{siteUrl}</a>
          </div>
        )}

        {proposal.acceptedAt && (
          <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm space-y-1">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Accepted</p>
            <p>{proposal.acceptedName} · {proposal.acceptedEmail} · {proposal.acceptedPhone}</p>
            <p className="text-xs text-gray-500">at {new Date(proposal.acceptedAt).toLocaleString()}</p>
          </div>
        )}

        {proposal.paidAt && (
          <p className="text-xs text-gray-400">Paid at {new Date(proposal.paidAt).toLocaleString()}</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Actions</p>
        <div className="flex flex-wrap gap-2">
          {proposal.status === 'approved' && (
            <button
              onClick={() => sendEmailMut.mutate({ id: proposal.id })}
              disabled={sendEmailMut.isPending}
              className="rounded-lg bg-cyan-600 disabled:bg-gray-700 px-4 py-2 text-sm font-medium"
            >
              {sendEmailMut.isPending ? 'Sending…' : 'Send proposal email'}
            </button>
          )}

          {(proposal.status === 'approved' || proposal.status === 'accepted') && (
            <button
              onClick={() => markPaidMut.mutate({ id: proposal.id })}
              disabled={markPaidMut.isPending}
              className="rounded-lg bg-emerald-600 disabled:bg-gray-700 px-4 py-2 text-sm font-medium"
            >
              {markPaidMut.isPending ? 'Marking…' : 'Mark as paid'}
            </button>
          )}

          {proposal.status === 'paid' && (
            <button
              onClick={() => deployMut.mutate({ id: proposal.id })}
              disabled={deployMut.isPending}
              className="rounded-lg bg-emerald-600 disabled:bg-gray-700 px-4 py-2 text-sm font-medium"
            >
              {deployMut.isPending ? 'Deploying…' : 'Deploy'}
            </button>
          )}

          {proposal.status === 'deployed' && (
            <button
              onClick={() => sendDeliveryMut.mutate({ id: proposal.id })}
              disabled={sendDeliveryMut.isPending}
              className="rounded-lg bg-green-600 disabled:bg-gray-700 px-4 py-2 text-sm font-medium"
            >
              {sendDeliveryMut.isPending ? 'Sending…' : 'Send delivery email'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
