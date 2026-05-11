import type { Proposal } from '../../types/proposal';
export function LiveStateView({ proposal, leadId }: { proposal: Proposal; leadId: string }) {
  return <div className="text-sm text-gray-400">Live view — implemented in Task 24 ({leadId} {proposal.id})</div>;
}
