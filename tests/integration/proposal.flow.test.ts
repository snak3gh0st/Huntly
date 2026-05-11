import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// vi.hoisted lets us share state between hoisted vi.mock factories and test bodies.
const { proposalStore, leadStore, queueJobs, mockProposalRepo, mockLeadRepo } = vi.hoisted(() => {
  const proposalStore = new Map<string, any>();
  const leadStore = new Map<string, any>();
  const queueJobs: any[] = [];

  function withLead(p: any) {
    if (!p) return p;
    return { ...p, lead: leadStore.get(p.leadId) ?? null };
  }

  const mockProposalRepo = {
    create: vi.fn(async (data: any) => {
      const p = { id: `prop-${proposalStore.size + 1}`, status: 'generating', ...data, createdAt: new Date() };
      proposalStore.set(p.id, p);
      return p;
    }),
    findById: vi.fn(async (id: string) => withLead(proposalStore.get(id) ?? null)),
    findByToken: vi.fn(async (tok: string) => withLead([...proposalStore.values()].find((p) => p.token === tok) ?? null)),
    findBySlug: vi.fn(async (slug: string) => withLead([...proposalStore.values()].find((p) => p.deployedSlug === slug) ?? null)),
    update: vi.fn(async (id: string, data: any) => {
      const cur = proposalStore.get(id);
      const next = { ...cur, ...data };
      proposalStore.set(id, next);
      return next;
    }),
    updateIfStatusIn: vi.fn(async (id: string, from: string[], data: any) => {
      const cur = proposalStore.get(id);
      if (!cur || !from.includes(cur.status)) return null;
      const next = { ...cur, ...data };
      proposalStore.set(id, next);
      return next;
    }),
    listForLead: vi.fn(async (lid: string) => [...proposalStore.values()].filter((p) => p.leadId === lid)),
    delete: vi.fn(async (id: string) => { proposalStore.delete(id); return { id }; }),
  };

  const mockLeadRepo = {
    findById: vi.fn(async (id: string) => leadStore.get(id) ?? null),
    updateStatus: vi.fn(),
    markReplied: vi.fn(),
  };

  return { proposalStore, leadStore, queueJobs, mockProposalRepo, mockLeadRepo };
});

vi.mock('../../src/db/index.js', () => ({
  proposalRepo: mockProposalRepo,
  leadRepo: mockLeadRepo,
  outreachRepo: { create: vi.fn() },
}));

vi.mock('../../src/workers/proposal.worker.js', () => ({
  proposalQueue: { add: async (name: string, data: any) => { queueJobs.push({ name, data }); } },
  runProposalJob: async () => {},
  proposalWorker: { close: vi.fn() },
}));

vi.mock('../../src/services/proposal-renderer.service.js', () => ({
  renderProposalView: () => '<html>PROPOSAL</html>',
  renderLiveSite: () => '<html>LIVE</html>',
}));

vi.mock('../../src/services/proposal-email.service.js', () => ({
  sendProposalOfferEmail: vi.fn(async () => ({ messageId: 'msg-offer' })),
  sendSiteDeliveredEmail: vi.fn(async () => ({ messageId: 'msg-delivered' })),
  sendInternalAcceptedNotification: vi.fn(async () => {}),
}));

vi.mock('../../src/config.js', () => ({
  env: { ADMIN_API_KEY: 'test', BASE_URL: 'http://test', SITES_BASE_URL: '', SENDER_EMAIL: 'h@h' },
  getSitesBaseUrl: () => 'http://test',
}));

import proposalRoutes from '../../src/routes/proposal.routes.js';
import proposalAdminRoutes from '../../src/routes/proposal.admin.routes.js';

let app: FastifyInstance;

beforeEach(async () => {
  proposalStore.clear();
  leadStore.clear();
  queueJobs.length = 0;
  leadStore.set('l1', {
    id: 'l1',
    country: 'United States',
    businessName: 'Smile Dental',
    googleReviewCount: 120,
    email: 'owner@biz.com',
    unsubscribedAt: null,
    unsubscribeToken: 'unsub',
  });

  app = Fastify();
  await app.register(proposalRoutes);
  await app.register(proposalAdminRoutes, { prefix: '/api' });
});

const AUTH = { 'x-api-key': 'test' };

describe('proposal flow — happy path', () => {
  it('walks from generate to deployed', async () => {
    // 1. Generate
    let res = await app.inject({
      method: 'POST', url: '/api/leads/l1/proposals', headers: AUTH, payload: { notes: 'go' },
    });
    expect(res.statusCode).toBe(201);
    const created = JSON.parse(res.body);
    expect(created.status).toBe('generating');
    expect(queueJobs).toHaveLength(1);

    // Simulate worker finishing
    proposalStore.get(created.id).status = 'draft';
    proposalStore.get(created.id).content = { proposalIntro: { salutation: 'Hi', pitch: 'p' } };
    proposalStore.get(created.id).suggestedTier = 'Pro';

    // 2. Patch with tier + payment link
    res = await app.inject({
      method: 'PATCH', url: `/api/proposals/${created.id}`, headers: AUTH,
      payload: { finalTier: 'Pro', paymentLinkUrl: 'https://buy.stripe.com/x' },
    });
    expect(res.statusCode).toBe(200);

    // 3. Approve
    res = await app.inject({
      method: 'POST', url: `/api/proposals/${created.id}/approve`, headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(proposalStore.get(created.id).status).toBe('approved');
    expect(proposalStore.get(created.id).priceCents).toBe(59700);

    // 4. Lead submits accept-form
    res = await app.inject({
      method: 'POST', url: `/proposal/${created.token}/accept`,
      payload: 'name=Jane&email=jane%40example.com&phone=5551234567&agreement=on',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(res.statusCode).toBe(200);
    expect(proposalStore.get(created.id).status).toBe('accepted');

    // 5. Mark paid
    res = await app.inject({
      method: 'POST', url: `/api/proposals/${created.id}/mark-paid`, headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(proposalStore.get(created.id).status).toBe('paid');

    // 6. Deploy
    res = await app.inject({
      method: 'POST', url: `/api/proposals/${created.id}/deploy`, headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(proposalStore.get(created.id).status).toBe('deployed');
    expect(proposalStore.get(created.id).deployedSlug).toMatch(/^smile-dental-[a-z0-9]{6}$/);

    // 7. GET /sites/:slug renders
    const slug = proposalStore.get(created.id).deployedSlug;
    res = await app.inject({ method: 'GET', url: `/sites/${slug}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('LIVE');
  });

  it('blocks proposal generation for non-US leads', async () => {
    leadStore.get('l1').country = 'Brazil';
    const res = await app.inject({
      method: 'POST', url: '/api/leads/l1/proposals', headers: AUTH, payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('NOT_US_LEAD');
  });
});
