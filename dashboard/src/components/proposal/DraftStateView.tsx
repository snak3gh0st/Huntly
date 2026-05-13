import { useEffect, useState } from 'react';
import type { Proposal, Tier } from '../../types/proposal';
import { usePatchProposal, useProposalAction, useDeleteProposal } from '../../hooks/useProposals';

const TIER_PRICES: Record<Tier, number> = { Starter: 297, Pro: 597, Premium: 997 };

function apiKey(): string {
  return localStorage.getItem('huntly_api_key') ?? '';
}

export function DraftStateView({ proposal, leadId }: { proposal: Proposal; leadId: string }) {
  const [finalTier, setFinalTier] = useState<Tier>(proposal.finalTier ?? proposal.suggestedTier ?? 'Starter');
  const [paymentLinkUrl, setPaymentLinkUrl] = useState(proposal.paymentLinkUrl ?? '');
  const [previewHtml, setPreviewHtml] = useState<string>('');

  // Drafts return 404 from the public /proposal/:token route. Fetch via the
  // admin preview endpoint (gated by x-api-key) and inject as srcDoc.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/proposals/${proposal.id}/preview`, {
      headers: { 'x-api-key': apiKey() },
    })
      .then((r) => r.text())
      .then((html) => { if (!cancelled) setPreviewHtml(html); })
      .catch(() => { if (!cancelled) setPreviewHtml('<p style="padding:32px;font-family:system-ui">Preview unavailable.</p>'); });
    return () => { cancelled = true; };
  }, [proposal.id, proposal.updatedAt]);

  const patchMut = usePatchProposal();
  const regenMut = useProposalAction('regenerate');
  const approveMut = useProposalAction('approve');
  const deleteMut = useDeleteProposal();

  // Drafts can't be opened via /proposal/:token (public route rejects draft status).
  // Fetch the auth-gated admin preview, then open as a blob URL in a new tab so
  // the operator can scroll/inspect the full site outside the cramped iframe.
  const openFullPreview = async () => {
    try {
      const r = await fetch(`/api/proposals/${proposal.id}/preview`, {
        headers: { 'x-api-key': apiKey() },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      window.alert('Could not load preview. Check your API key.');
    }
  };

  const save = () =>
    patchMut.mutate({
      id: proposal.id,
      body: { finalTier, paymentLinkUrl: paymentLinkUrl.trim() || null },
    });

  const approve = async () => {
    await patchMut.mutateAsync({
      id: proposal.id,
      body: { finalTier, paymentLinkUrl: paymentLinkUrl.trim() || null },
    });
    await approveMut.mutateAsync({ id: proposal.id });
  };

  const canApprove = paymentLinkUrl.trim() !== '' && !!finalTier;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 text-xs text-gray-400">
          <div className="flex items-center gap-3">
            <span>Preview</span>
            <button
              onClick={openFullPreview}
              className="text-cyan-400 hover:text-cyan-300 underline-offset-2 hover:underline"
            >
              Open full preview ↗
            </button>
          </div>
          <span className="text-gray-500">Draft — only visible to operators</span>
        </div>
        <iframe srcDoc={previewHtml} className="w-full h-[480px] bg-white" title="Proposal preview" />
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wide">Tier</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(Object.keys(TIER_PRICES) as Tier[]).map((t) => (
              <button
                key={t}
                onClick={() => setFinalTier(t)}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  finalTier === t
                    ? 'border-emerald-500 bg-emerald-950 text-emerald-200'
                    : 'border-gray-800 bg-gray-950 hover:border-gray-700'
                }`}
              >
                <div className="font-medium">{t}</div>
                <div className="text-xs text-gray-400">${TIER_PRICES[t]}</div>
              </button>
            ))}
          </div>
          {proposal.suggestedTier && (
            <p className="mt-2 text-xs text-gray-500">
              Claude suggested: <span className="text-gray-300">{proposal.suggestedTier}</span>
            </p>
          )}
        </div>

        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wide" htmlFor="pl">
            Stripe Payment Link
          </label>
          <input
            id="pl"
            value={paymentLinkUrl}
            onChange={(e) => setPaymentLinkUrl(e.target.value)}
            placeholder="https://buy.stripe.com/..."
            className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Create a Payment Link in Stripe for <strong>${TIER_PRICES[finalTier]}</strong> and paste it here.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={() => regenMut.mutate({ id: proposal.id })}
            disabled={regenMut.isPending}
            className="rounded-lg border border-gray-700 px-3 py-2 text-sm hover:border-gray-600"
          >
            {regenMut.isPending ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button
            onClick={save}
            disabled={patchMut.isPending}
            className="rounded-lg border border-gray-700 px-3 py-2 text-sm hover:border-gray-600"
          >
            {patchMut.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={approve}
            disabled={!canApprove || approveMut.isPending || patchMut.isPending}
            className="rounded-lg bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-400 px-4 py-2 text-sm font-medium"
          >
            {approveMut.isPending ? 'Approving…' : 'Approve & Publish'}
          </button>
          <button
            onClick={() => deleteMut.mutate({ id: proposal.id, leadId })}
            className="rounded-lg border border-red-900 text-red-400 px-3 py-2 text-sm hover:bg-red-950"
          >
            Delete
          </button>
        </div>
        {!canApprove && (
          <p className="text-xs text-amber-400">Add a Stripe Payment Link to approve.</p>
        )}
      </div>
    </div>
  );
}
