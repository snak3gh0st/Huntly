import { useEffect, useMemo, useState } from 'react';
import type { Proposal, SizeBand, Tier, PriceRange } from '../../types/proposal';
import {
  usePatchProposal,
  useProposalAction,
  useDeleteProposal,
  usePricingMatrix,
} from '../../hooks/useProposals';

const TIER_TO_SIZE: Record<Tier, SizeBand> = { Starter: 'S', Pro: 'M', Premium: 'L' };

const SIZE_LABELS: Record<SizeBand, string> = {
  S: 'Small (< 50 reviews)',
  M: 'Mid (50–299 reviews)',
  L: 'Large (300+ reviews)',
};

function apiKey(): string {
  return localStorage.getItem('huntly_api_key') ?? '';
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function priceForRange(range: PriceRange | undefined, difficulty: number): number {
  if (!range) return 0;
  const d = Math.max(0, Math.min(1, difficulty));
  return Math.round(range.minCents + d * (range.maxCents - range.minCents));
}

export function DraftStateView({ proposal, leadId }: { proposal: Proposal; leadId: string }) {
  const { data: pricing } = usePricingMatrix();
  const industries = pricing?.industries ?? ['other'];
  const matrix = pricing?.matrix;

  // Initialise segment fields from persisted values, falling back to derived
  // defaults so an operator opening an older draft (pre-segment-migration)
  // sees something sensible without having to re-pick everything.
  const initialSize: SizeBand =
    proposal.segmentSize ?? (proposal.suggestedTier ? TIER_TO_SIZE[proposal.suggestedTier] : 'S');
  const initialIndustry = proposal.segmentIndustry ?? 'other';
  const initialDifficulty = proposal.difficulty ?? 0.5;

  const [industry, setIndustry] = useState(initialIndustry);
  const [size, setSize] = useState<SizeBand>(initialSize);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState(proposal.paymentLinkUrl ?? '');
  const [previewHtml, setPreviewHtml] = useState<string>('');

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

  const range = useMemo<PriceRange | undefined>(() => {
    const row = matrix?.[industry] ?? matrix?.['other'];
    return row?.[size];
  }, [matrix, industry, size]);

  const computedCents = useMemo(() => priceForRange(range, difficulty), [range, difficulty]);
  const degenerate = range !== undefined && range.minCents === range.maxCents;

  const save = () =>
    patchMut.mutate({
      id: proposal.id,
      body: {
        segmentIndustry: industry,
        segmentSize: size,
        difficulty,
        paymentLinkUrl: paymentLinkUrl.trim() || null,
      },
    });

  const approve = async () => {
    await patchMut.mutateAsync({
      id: proposal.id,
      body: {
        segmentIndustry: industry,
        segmentSize: size,
        difficulty,
        paymentLinkUrl: paymentLinkUrl.trim() || null,
      },
    });
    await approveMut.mutateAsync({ id: proposal.id });
  };

  const canApprove = paymentLinkUrl.trim() !== '' && !!industry && !!size && range !== undefined;

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

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-5">
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wide" htmlFor="industry">
            Industry
          </label>
          <select
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm"
          >
            {industries.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          {industries.length === 1 && (
            <p className="mt-1 text-xs text-gray-500">
              Industry matrix is being calibrated — all leads currently use <code className="text-gray-300">other</code>.
            </p>
          )}
        </div>

        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wide">Business size</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(['S', 'M', 'L'] as SizeBand[]).map((s) => {
              const cellRange = matrix?.[industry]?.[s] ?? matrix?.['other']?.[s];
              const rangeLabel = cellRange
                ? cellRange.minCents === cellRange.maxCents
                  ? formatUsd(cellRange.minCents)
                  : `${formatUsd(cellRange.minCents)}–${formatUsd(cellRange.maxCents)}`
                : '—';
              return (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`rounded-lg border px-3 py-2 text-sm text-left ${
                    size === s
                      ? 'border-emerald-500 bg-emerald-950 text-emerald-200'
                      : 'border-gray-800 bg-gray-950 hover:border-gray-700'
                  }`}
                >
                  <div className="font-medium">{SIZE_LABELS[s]}</div>
                  <div className="text-xs text-gray-400">{rangeLabel}</div>
                </button>
              );
            })}
          </div>
          {proposal.suggestedTier && (
            <p className="mt-2 text-xs text-gray-500">
              Suggested from review count: <span className="text-gray-300">{TIER_TO_SIZE[proposal.suggestedTier]}</span>
            </p>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="text-xs text-gray-400 uppercase tracking-wide" htmlFor="difficulty">
              Difficulty
            </label>
            <span className="text-xs text-gray-300 tabular-nums">{Math.round(difficulty * 100)}%</span>
          </div>
          <input
            id="difficulty"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            className="mt-2 w-full accent-emerald-500"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>Easy</span><span>Medium</span><span>Hard</span>
          </div>
          {degenerate && (
            <p className="mt-2 text-xs text-amber-400">
              This cell has a degenerate range (min = max) — difficulty has no effect on price until the matrix is calibrated.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Computed price</p>
          <p className="text-2xl font-semibold text-emerald-400 tabular-nums">{formatUsd(computedCents)}</p>
          {range && (
            <p className="mt-1 text-xs text-gray-500">
              Range for {industry} × {size}: {formatUsd(range.minCents)}
              {range.minCents !== range.maxCents && <> – {formatUsd(range.maxCents)}</>}
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
            Create a Payment Link in Stripe for <strong>{formatUsd(computedCents)}</strong> and paste it here.
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
