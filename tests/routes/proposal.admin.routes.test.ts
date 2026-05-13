import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockLeadFindById = vi.fn();
const mockProposalCreate = vi.fn();
const mockProposalListForLead = vi.fn();
const mockProposalFindById = vi.fn();
const mockProposalUpdate = vi.fn();
const mockProposalUpdateIfStatusIn = vi.fn();
const mockProposalDelete = vi.fn();
const mockQueueAdd = vi.fn();

vi.mock('../../src/db/index.js', () => ({
  proposalRepo: {
    create: (...a: unknown[]) => mockProposalCreate(...a),
    listForLead: (...a: unknown[]) => mockProposalListForLead(...a),
    findById: (...a: unknown[]) => mockProposalFindById(...a),
    update: (...a: unknown[]) => mockProposalUpdate(...a),
    updateIfStatusIn: (...a: unknown[]) => mockProposalUpdateIfStatusIn(...a),
    delete: (...a: unknown[]) => mockProposalDelete(...a),
  },
  leadRepo: {
    findById: (...a: unknown[]) => mockLeadFindById(...a),
  },
}));

vi.mock('../../src/workers/proposal.worker.js', () => ({
  proposalQueue: { add: (...a: unknown[]) => mockQueueAdd(...a) },
}));

vi.mock('../../src/config.js', () => ({
  env: { ADMIN_API_KEY: 'test-key' },
}));

const mockSendProposalOffer = vi.fn();
const mockSendSiteDelivered = vi.fn();

vi.mock('../../src/services/proposal-email.service.js', () => ({
  sendProposalOfferEmail: (...a: unknown[]) => mockSendProposalOffer(...a),
  sendSiteDeliveredEmail: (...a: unknown[]) => mockSendSiteDelivered(...a),
  sendInternalAcceptedNotification: vi.fn(),
}));

import adminRoutes from '../../src/routes/proposal.admin.routes.js';

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  app = Fastify();
  await app.register(adminRoutes, { prefix: '/api' });
});

const AUTH = { 'x-api-key': 'test-key' };

const LEAD_US = {
  id: 'l1',
  country: 'United States',
  businessName: 'Smile Dental',
  googleReviewCount: 120,
};

describe('POST /api/leads/:id/proposals', () => {
  it('creates a draft proposal and enqueues a generation job', async () => {
    mockLeadFindById.mockResolvedValue(LEAD_US);
    mockProposalCreate.mockResolvedValue({ id: 'p1', token: 'tok-x', status: 'generating' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/leads/l1/proposals',
      headers: AUTH,
      payload: { notes: 'owner mentioned hiring' },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toMatchObject({ id: 'p1', status: 'generating' });
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'generate',
      { proposalId: 'p1', operatorNotes: 'owner mentioned hiring' },
    );
  });

  it('rejects non-US leads with 400 NOT_US_LEAD', async () => {
    mockLeadFindById.mockResolvedValue({ ...LEAD_US, country: 'Brazil' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/leads/l1/proposals',
      headers: AUTH,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('NOT_US_LEAD');
    expect(mockProposalCreate).not.toHaveBeenCalled();
  });

  it('accepts US, USA, United States, US country variants', async () => {
    mockProposalCreate.mockResolvedValue({ id: 'p1', token: 't', status: 'generating' });

    for (const country of ['US', 'USA', 'United States', 'us', '  united states  ']) {
      vi.clearAllMocks();
      mockLeadFindById.mockResolvedValue({ ...LEAD_US, country });
      mockProposalCreate.mockResolvedValue({ id: 'p1', token: 't', status: 'generating' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/leads/l1/proposals',
        headers: AUTH,
        payload: {},
      });
      expect(res.statusCode).toBe(201);
    }
  });

  it('returns 404 when lead not found', async () => {
    mockLeadFindById.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/leads/missing/proposals',
      headers: AUTH,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects requests without x-api-key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/leads/l1/proposals',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/leads/:id/proposals + GET /api/proposals/:id', () => {
  it('lists proposals for a lead', async () => {
    mockProposalListForLead.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    const res = await app.inject({
      method: 'GET',
      url: '/api/leads/l1/proposals',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(2);
  });

  it('fetches a single proposal by id', async () => {
    mockProposalFindById.mockResolvedValue({ id: 'p1', status: 'draft' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/proposals/p1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe('p1');
  });

  it('returns 404 for unknown proposal id', async () => {
    mockProposalFindById.mockResolvedValue(null);
    const res = await app.inject({
      method: 'GET',
      url: '/api/proposals/missing',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/proposals/:id', () => {
  it('updates final tier and payment link', async () => {
    mockProposalFindById.mockResolvedValue({ id: 'p1', status: 'draft' });
    mockProposalUpdate.mockResolvedValue({ id: 'p1', finalTier: 'Pro', paymentLinkUrl: 'https://x' });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/proposals/p1',
      headers: AUTH,
      payload: { finalTier: 'Pro', paymentLinkUrl: 'https://x' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockProposalUpdate).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ finalTier: 'Pro', paymentLinkUrl: 'https://x' }),
    );
  });

  it('rejects unknown tier values', async () => {
    mockProposalFindById.mockResolvedValue({ id: 'p1', status: 'draft' });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/proposals/p1',
      headers: AUTH,
      payload: { finalTier: 'Platinum' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for missing proposal', async () => {
    mockProposalFindById.mockResolvedValue(null);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/proposals/gone',
      headers: AUTH,
      payload: { finalTier: 'Pro' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/proposals/:id/regenerate', () => {
  it('flips status to generating and enqueues a new job, only from draft or failed', async () => {
    mockProposalUpdateIfStatusIn.mockResolvedValue({ id: 'p1', status: 'generating' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/proposals/p1/regenerate',
      headers: AUTH,
      payload: { notes: 're-do' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockProposalUpdateIfStatusIn).toHaveBeenCalledWith(
      'p1',
      ['draft', 'failed'],
      expect.objectContaining({ status: 'generating', generationError: null }),
    );
    expect(mockQueueAdd).toHaveBeenCalledWith('generate', { proposalId: 'p1', operatorNotes: 're-do' });
  });

  it('returns 409 when status not draft/failed', async () => {
    mockProposalUpdateIfStatusIn.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/proposals/p1/regenerate',
      headers: AUTH,
      payload: {},
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /api/proposals/:id/approve', () => {
  const READY = {
    id: 'p1', status: 'draft',
    finalTier: 'Pro', paymentLinkUrl: 'https://x',
    content: {}, leadId: 'l1', token: 'tok',
  };

  it('locks priceCents and flips status to approved', async () => {
    mockProposalFindById.mockResolvedValue(READY);
    mockProposalUpdateIfStatusIn.mockResolvedValue({ ...READY, status: 'approved', priceCents: 59700 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/proposals/p1/approve',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(mockProposalUpdateIfStatusIn).toHaveBeenCalledWith(
      'p1',
      ['draft'],
      expect.objectContaining({ status: 'approved', priceCents: 59700 }),
    );
  });

  it('returns 400 with missing-field list when tier/segment or paymentLinkUrl unset', async () => {
    mockProposalFindById.mockResolvedValue({
      ...READY,
      finalTier: null,
      segmentIndustry: null,
      segmentSize: null,
      difficulty: null,
      paymentLinkUrl: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/proposals/p1/approve',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.missing).toEqual(expect.arrayContaining([
      'finalTier or (segmentIndustry, segmentSize, difficulty)',
      'paymentLinkUrl',
    ]));
  });

  it('locks priceCents via segment × difficulty when those fields are set', async () => {
    mockProposalFindById.mockResolvedValue({
      ...READY,
      finalTier: null,
      segmentIndustry: 'other',
      segmentSize: 'M',
      difficulty: 0.5,
    });
    mockProposalUpdateIfStatusIn.mockResolvedValue({
      ...READY,
      status: 'approved',
      priceCents: 59700,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/proposals/p1/approve',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(mockProposalUpdateIfStatusIn).toHaveBeenCalledWith(
      'p1',
      ['draft'],
      // Degenerate range for other/M (min === max === 59700), so any difficulty
      // value lands on the same number — verifies the segment path is taken.
      expect.objectContaining({ status: 'approved', priceCents: 59700 }),
    );
  });

  it('returns 409 when status not draft', async () => {
    mockProposalFindById.mockResolvedValue({ ...READY, status: 'approved' });
    mockProposalUpdateIfStatusIn.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/proposals/p1/approve',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /api/proposals/:id/send-email', () => {
  it('sends the proposal-offer email', async () => {
    mockProposalFindById.mockResolvedValue({
      id: 'p1', status: 'approved', token: 'tok',
      lead: { id: 'l1', email: 'owner@biz.com', businessName: 'B', unsubscribedAt: null, unsubscribeToken: 'unsub' },
    });
    mockSendProposalOffer.mockResolvedValue({ messageId: 'msg-1' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/proposals/p1/send-email',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(mockSendProposalOffer).toHaveBeenCalled();
  });

  it('returns 400 when lead has no email', async () => {
    mockProposalFindById.mockResolvedValue({
      id: 'p1', status: 'approved',
      lead: { id: 'l1', email: null, unsubscribedAt: null },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/proposals/p1/send-email',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when lead unsubscribed', async () => {
    mockProposalFindById.mockResolvedValue({
      id: 'p1', status: 'approved',
      lead: { id: 'l1', email: 'owner@biz.com', status: 'unsubscribed' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/proposals/p1/send-email',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 when proposal not approved', async () => {
    mockProposalFindById.mockResolvedValue({
      id: 'p1', status: 'draft',
      lead: { id: 'l1', email: 'owner@biz.com', unsubscribedAt: null },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/proposals/p1/send-email',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /api/proposals/:id/mark-paid', () => {
  it('flips approved or accepted to paid', async () => {
    mockProposalUpdateIfStatusIn.mockResolvedValue({ id: 'p1', status: 'paid' });
    const res = await app.inject({
      method: 'POST', url: '/api/proposals/p1/mark-paid', headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(mockProposalUpdateIfStatusIn).toHaveBeenCalledWith(
      'p1',
      ['approved', 'accepted'],
      expect.objectContaining({ status: 'paid', paidAt: expect.any(Date) }),
    );
  });

  it('returns 409 when status not approved/accepted', async () => {
    mockProposalUpdateIfStatusIn.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST', url: '/api/proposals/p1/mark-paid', headers: AUTH,
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /api/proposals/:id/deploy', () => {
  it('generates slug and flips paid to deployed', async () => {
    mockProposalFindById.mockResolvedValue({
      id: 'p1', status: 'paid', lead: { businessName: 'Test Co' },
    });
    mockProposalUpdateIfStatusIn.mockResolvedValue({
      id: 'p1', status: 'deployed', deployedSlug: 'test-co-abc123',
    });

    const res = await app.inject({
      method: 'POST', url: '/api/proposals/p1/deploy', headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(mockProposalUpdateIfStatusIn).toHaveBeenCalledWith(
      'p1',
      ['paid'],
      expect.objectContaining({
        status: 'deployed',
        deployedSlug: expect.stringMatching(/^test-co-[a-z0-9]{6}$/),
        deployedAt: expect.any(Date),
      }),
    );
  });

  it('returns 409 when status not paid', async () => {
    mockProposalFindById.mockResolvedValue({
      id: 'p1', status: 'approved', lead: { businessName: 'X' },
    });
    mockProposalUpdateIfStatusIn.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST', url: '/api/proposals/p1/deploy', headers: AUTH,
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /api/proposals/:id/send-delivery', () => {
  it('sends the site-delivered email when status is deployed', async () => {
    mockProposalFindById.mockResolvedValue({
      id: 'p1', status: 'deployed',
      lead: { email: 'owner@biz.com', businessName: 'B', status: 'paid', unsubscribeToken: 'unsub' },
    });
    mockSendSiteDelivered.mockResolvedValue({ messageId: 'msg-2' });

    const res = await app.inject({
      method: 'POST', url: '/api/proposals/p1/send-delivery', headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(mockSendSiteDelivered).toHaveBeenCalled();
  });

  it('returns 409 when status not deployed', async () => {
    mockProposalFindById.mockResolvedValue({
      id: 'p1', status: 'paid',
      lead: { email: 'owner@biz.com', status: 'paid' },
    });
    const res = await app.inject({
      method: 'POST', url: '/api/proposals/p1/send-delivery', headers: AUTH,
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('DELETE /api/proposals/:id', () => {
  it('hard-deletes the proposal', async () => {
    mockProposalDelete.mockResolvedValue({ id: 'p1' });
    const res = await app.inject({
      method: 'DELETE', url: '/api/proposals/p1', headers: AUTH,
    });
    expect(res.statusCode).toBe(204);
    expect(mockProposalDelete).toHaveBeenCalledWith('p1');
  });
});
