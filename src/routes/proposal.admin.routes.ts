import type { FastifyInstance } from 'fastify';
import { apiKeyAuth } from '../middleware/api-key-auth.js';
import { proposalRepo, leadRepo } from '../db/index.js';
import { proposalQueue } from '../workers/proposal.worker.js';
import { makeToken } from '../lib/slug.js';

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
}
