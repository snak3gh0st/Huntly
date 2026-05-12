import type { FastifyInstance } from 'fastify';
import { apiKeyAuth } from '../middleware/api-key-auth.js';
import { proposalRepo, leadRepo } from '../db/index.js';
import { proposalQueue } from '../workers/proposal.worker.js';
import { makeToken, makeSlug } from '../lib/slug.js';
import { priceForTier, type Tier } from '../lib/pricing-tiers.js';
import {
  sendProposalOfferEmail,
  sendSiteDeliveredEmail,
} from '../services/proposal-email.service.js';
import {
  renderProposalView,
  renderLiveSite,
} from '../services/proposal-renderer.service.js';
import type { SiteContent } from '../services/proposal-generator.service.js';

const US_VARIANTS = new Set(['us', 'usa', 'united states', 'united states of america']);

function isUsLead(country: string | null | undefined): boolean {
  if (!country) return false;
  return US_VARIANTS.has(country.trim().toLowerCase());
}

interface GenerateBody {
  notes?: string;
}

export default async function proposalAdminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', apiKeyAuth);

  /* POST /api/leads/:id/proposals — generate */
  app.post<{ Params: { id: string }; Body: GenerateBody }>(
    '/leads/:id/proposals',
    async (request, reply) => {
      const lead = await leadRepo.findById(request.params.id);
      if (!lead) return reply.status(404).send({ error: 'Lead not found' });

      if (!isUsLead(lead.country)) {
        return reply.status(400).send({
          error: 'Proposal generation is currently limited to US leads',
          code: 'NOT_US_LEAD',
        });
      }

      const proposal = await proposalRepo.create({
        leadId: lead.id,
        status: 'generating',
        token: makeToken(),
      });

      await proposalQueue.add('generate', {
        proposalId: proposal.id,
        operatorNotes: request.body?.notes,
      });

      return reply.status(201).send({ id: proposal.id, status: proposal.status, token: proposal.token });
    },
  );

  /* GET /api/leads/:id/proposals — list */
  app.get<{ Params: { id: string } }>(
    '/leads/:id/proposals',
    async (request) => {
      return proposalRepo.listForLead(request.params.id);
    },
  );

  /* GET /api/proposals/:id — fetch */
  app.get<{ Params: { id: string } }>(
    '/proposals/:id',
    async (request, reply) => {
      const proposal = await proposalRepo.findById(request.params.id);
      if (!proposal) return reply.status(404).send({ error: 'Not found' });
      return proposal;
    },
  );

  /* GET /api/proposals/:id/preview — operator-only HTML preview (any status, gated by API key) */
  app.get<{ Params: { id: string } }>(
    '/proposals/:id/preview',
    async (request, reply) => {
      const proposal = await proposalRepo.findById(request.params.id);
      if (!proposal) {
        return reply.status(404).type('text/html').send('<h1>Not found</h1>');
      }

      if (proposal.status === 'generating') {
        return reply.type('text/html').send(
          '<!DOCTYPE html><html><body style="font-family:system-ui;padding:32px;text-align:center;color:#525252"><p>Claude is still drafting&hellip;</p><p style="font-size:12px">This preview will populate when generation completes.</p></body></html>',
        );
      }

      if (proposal.status === 'failed') {
        return reply.type('text/html').send(
          '<!DOCTYPE html><html><body style="font-family:system-ui;padding:32px;text-align:center;color:#dc2626"><p>Generation failed.</p></body></html>',
        );
      }

      // For deployed proposals, show the live site (no sales chrome).
      // For all other reviewable statuses (draft/approved/accepted/paid), show the proposal view.
      const html = proposal.status === 'deployed'
        ? renderLiveSite({
            lead: { businessName: proposal.lead.businessName },
            content: proposal.content as unknown as SiteContent,
          })
        : renderProposalView({
            lead: { businessName: proposal.lead.businessName },
            proposal: {
              token: proposal.token,
              finalTier: (proposal.finalTier ?? null) as Tier | null,
              priceCents: proposal.priceCents,
              paymentLinkUrl: proposal.paymentLinkUrl,
            },
            content: proposal.content as unknown as SiteContent,
          });

      return reply.type('text/html').send(html);
    },
  );

  /* PATCH /api/proposals/:id */
  const VALID_TIERS = new Set<Tier>(['Starter', 'Pro', 'Premium']);

  interface PatchBody {
    finalTier?: string;
    paymentLinkUrl?: string | null;
    content?: unknown;
  }

  app.patch<{ Params: { id: string }; Body: PatchBody }>(
    '/proposals/:id',
    async (request, reply) => {
      const proposal = await proposalRepo.findById(request.params.id);
      if (!proposal) return reply.status(404).send({ error: 'Not found' });

      const data: Record<string, unknown> = {};
      if (request.body.finalTier !== undefined) {
        if (!VALID_TIERS.has(request.body.finalTier as Tier)) {
          return reply.status(400).send({ error: 'Invalid tier', valid: [...VALID_TIERS] });
        }
        data.finalTier = request.body.finalTier;
      }
      if (request.body.paymentLinkUrl !== undefined) {
        data.paymentLinkUrl = request.body.paymentLinkUrl;
      }
      if (request.body.content !== undefined) {
        data.content = request.body.content;
      }

      const updated = await proposalRepo.update(request.params.id, data);
      return updated;
    },
  );

  /* POST /api/proposals/:id/regenerate */
  app.post<{ Params: { id: string }; Body: { notes?: string } }>(
    '/proposals/:id/regenerate',
    async (request, reply) => {
      const updated = await proposalRepo.updateIfStatusIn(
        request.params.id,
        ['draft', 'failed'],
        { status: 'generating', generationError: null },
      );
      if (!updated) {
        return reply.status(409).send({
          error: 'Regenerate only allowed from draft or failed',
          code: 'INVALID_STATUS_FOR_REGENERATE',
        });
      }
      await proposalQueue.add('generate', {
        proposalId: request.params.id,
        operatorNotes: request.body?.notes,
      });
      return updated;
    },
  );

  /* POST /api/proposals/:id/approve */
  app.post<{ Params: { id: string } }>(
    '/proposals/:id/approve',
    async (request, reply) => {
      const proposal = await proposalRepo.findById(request.params.id);
      if (!proposal) return reply.status(404).send({ error: 'Not found' });

      const missing: string[] = [];
      if (!proposal.finalTier)      missing.push('finalTier');
      if (!proposal.paymentLinkUrl) missing.push('paymentLinkUrl');
      if (missing.length > 0) {
        return reply.status(400).send({ error: 'Missing required fields', missing });
      }

      const priceCents = priceForTier(proposal.finalTier as Tier);
      const updated = await proposalRepo.updateIfStatusIn(
        request.params.id,
        ['draft'],
        { status: 'approved', priceCents },
      );
      if (!updated) return reply.status(409).send({ error: 'Status is not draft' });

      return updated;
    },
  );

  /* POST /api/proposals/:id/send-email */
  app.post<{ Params: { id: string } }>(
    '/proposals/:id/send-email',
    async (request, reply) => {
      const proposal = await proposalRepo.findById(request.params.id);
      if (!proposal) return reply.status(404).send({ error: 'Not found' });
      if (proposal.status === 'generating' || proposal.status === 'draft' || proposal.status === 'failed') {
        return reply.status(409).send({ error: 'Proposal not approved yet' });
      }
      if (!proposal.lead.email) {
        return reply.status(400).send({ error: 'Lead has no email on file' });
      }
      if (proposal.lead.status === 'unsubscribed') {
        return reply.status(400).send({ error: 'Lead is unsubscribed' });
      }

      const result = await sendProposalOfferEmail(proposal);
      return { sent: true, messageId: result.messageId };
    },
  );

  /* POST /api/proposals/:id/mark-paid */
  app.post<{ Params: { id: string } }>(
    '/proposals/:id/mark-paid',
    async (request, reply) => {
      const updated = await proposalRepo.updateIfStatusIn(
        request.params.id,
        ['approved', 'accepted'],
        { status: 'paid', paidAt: new Date() },
      );
      if (!updated) return reply.status(409).send({ error: 'Status must be approved or accepted' });
      return updated;
    },
  );

  /* POST /api/proposals/:id/deploy */
  app.post<{ Params: { id: string } }>(
    '/proposals/:id/deploy',
    async (request, reply) => {
      const proposal = await proposalRepo.findById(request.params.id);
      if (!proposal) return reply.status(404).send({ error: 'Not found' });

      // One retry on Prisma unique-constraint violation (P2002 on deployed_slug).
      for (let attempt = 0; attempt < 2; attempt++) {
        const deployedSlug = makeSlug(proposal.lead.businessName);
        try {
          const updated = await proposalRepo.updateIfStatusIn(
            request.params.id,
            ['paid'],
            { status: 'deployed', deployedSlug, deployedAt: new Date() },
          );
          if (!updated) return reply.status(409).send({ error: 'Status must be paid' });
          return updated;
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === 'P2002' && attempt === 0) continue;  // collision; try again with fresh suffix
          throw err;
        }
      }
      return reply.status(500).send({ error: 'Slug collision retry exhausted' });
    },
  );

  /* POST /api/proposals/:id/send-delivery */
  app.post<{ Params: { id: string } }>(
    '/proposals/:id/send-delivery',
    async (request, reply) => {
      const proposal = await proposalRepo.findById(request.params.id);
      if (!proposal) return reply.status(404).send({ error: 'Not found' });
      if (proposal.status !== 'deployed') {
        return reply.status(409).send({ error: 'Proposal not deployed yet' });
      }
      if (!proposal.lead.email) {
        return reply.status(400).send({ error: 'Lead has no email on file' });
      }
      if (proposal.lead.status === 'unsubscribed') {
        return reply.status(400).send({ error: 'Lead is unsubscribed' });
      }

      const result = await sendSiteDeliveredEmail(proposal);
      return { sent: true, messageId: result.messageId };
    },
  );

  /* DELETE /api/proposals/:id */
  app.delete<{ Params: { id: string } }>(
    '/proposals/:id',
    async (request, reply) => {
      await proposalRepo.delete(request.params.id);
      return reply.status(204).send();
    },
  );
}
