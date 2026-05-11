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
