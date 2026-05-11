import type { Proposal } from '../../types/proposal';
export function DraftStateView({ proposal, leadId }: { proposal: Proposal; leadId: string }) {
  return <div className="text-sm text-gray-400">Draft view — implemented in Task 23 ({leadId} {proposal.id})</div>;
}
