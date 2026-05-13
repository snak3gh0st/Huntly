import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import { redis } from '../lib/redis.js';
import { proposalRepo } from '../db/index.js';
import {
  generateSiteContent,
  type GeneratorInput,
} from '../services/proposal-generator.service.js';
import { studyLead } from '../services/lead-study.service.js';
import { strategize } from '../services/lead-strategy.service.js';
import { pickVisualSystem } from '../services/visual-system.service.js';
import { designDirection } from '../services/design-direction.service.js';
import { generateHeroImage, buildHeroImagePrompt } from '../lib/dalle.js';
import { critiquePass } from '../services/critique-pass.service.js';
import { suggestTier } from '../lib/pricing-tiers.js';
import type { Prisma } from '@prisma/client';

const connection = redis as unknown as ConnectionOptions;

export interface ProposalJobData {
  proposalId: string;
  operatorNotes?: string;
}

export const proposalQueue = new Queue<ProposalJobData>('proposal-generate', { connection });

/**
 * Pure function exposed for unit-testing. The BullMQ Worker below
 * just calls this with `job.data`.
 */
export async function runProposalJob(data: ProposalJobData): Promise<void> {
  const proposal = await proposalRepo.findById(data.proposalId);
  if (!proposal) return;

  const lead = proposal.lead;
  const enrichment = lead.enrichment;

  const input: GeneratorInput = {
    businessName: lead.businessName,
    category: lead.category ?? '',
    region: lead.region ?? '',
    websiteUrl: lead.websiteUrl ?? undefined,
    googleRating: lead.googleRating ?? undefined,
    googleReviewCount: lead.googleReviewCount ?? undefined,
    hasChatbot: enrichment?.hasChatbot ?? null,
    hasOnlineBooking: enrichment?.hasOnlineBooking ?? null,
    hasWhatsapp: enrichment?.hasWhatsapp ?? null,
    ownerName: enrichment?.ownerName ?? undefined,
    painSignals: Array.isArray(enrichment?.painSignals)
      ? (enrichment.painSignals as Array<{ signal: string; count: number; example: string }>)
      : [],
    reviewSentimentSummary: enrichment?.reviewSentimentSummary ?? undefined,
    personalizedHook: lead.qualification?.personalizedHook ?? undefined,
    operatorNotes: data.operatorNotes,
  };

  try {
    // Layer 1 — Study the lead's website and business context
    const study = await studyLead(input);

    // Layer 2 — Strategize: derive hero angle, conversion opportunities, copy tone
    //           Uses Claude Opus for higher-quality reasoning on hero angle.
    const strategy = await strategize(input, study);

    // Layer 2.5 — Visual system: pick palette + font pairing that fits this lead
    const visualSystem = await pickVisualSystem(study, strategy);

    // Layer 2.6 — DALL-E 3 hero image (best-effort; null = fall back to Unsplash)
    // Prompt is derived from locationContext + copyTone + palette mood.
    // Known limitation: DALL-E 3 URLs expire ~60 min (OpenAI policy).
    // v2 fix: download + re-host on Huntly static assets / Cloudflare R2.
    const heroImagePrompt = buildHeroImagePrompt(
      study.business.locationContext,
      strategy.copyTone,
      visualSystem.paletteKey,
    );
    const heroImage = await generateHeroImage(heroImagePrompt);

    // Layer 2.7 — Design Direction: senior-designer Figma-thinking pass.
    // Decides which sections this lead earns, in what order, with what
    // visual treatment + microcopy voice + signature moves.
    const direction = await designDirection(study, strategy, visualSystem);

    // Layer 3 — Build: generate final site content grounded in study + strategy + direction
    const siteContent = await generateSiteContent(input, study, strategy, direction);

    // Layer 4 — Critique: Claude reviews its own output and applies targeted fixes
    const { critique, appliedContent } = await critiquePass(siteContent, study, strategy);

    await proposalRepo.update(data.proposalId, {
      status: 'draft',
      // Store all layers. Renderer reads SiteContent fields + _study/_strategy/_visualSystem.
      // _critique is stored for operator inspection. heroImageUrl for direct renderer access.
      content: {
        _study: study,
        _strategy: strategy,
        _visualSystem: visualSystem,
        _direction: direction,
        _critique: critique,
        heroImageUrl: heroImage?.url ?? null,
        ...appliedContent,
      } as unknown as Prisma.InputJsonValue,
      suggestedTier: suggestTier(lead.googleReviewCount),
      generationError: null,
    });
  } catch (err) {
    await proposalRepo.update(data.proposalId, {
      status: 'failed',
      generationError: (err as Error).message,
    });
  }
}

export const proposalWorker = new Worker<ProposalJobData>(
  'proposal-generate',
  async (job) => runProposalJob(job.data),
  { connection, concurrency: 2 },
);
