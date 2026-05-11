import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockFindByToken = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateIfStatusIn = vi.fn();
const mockFindBySlug = vi.fn();

vi.mock('../../src/db/index.js', () => ({
  proposalRepo: {
    findByToken: (...a: unknown[]) => mockFindByToken(...a),
    findBySlug:  (...a: unknown[]) => mockFindBySlug(...a),
    update:      (...a: unknown[]) => mockUpdate(...a),
    updateIfStatusIn: (...a: unknown[]) => mockUpdateIfStatusIn(...a),
  },
  leadRepo: {
    updateStatus: vi.fn(),
    markReplied: vi.fn(),
  },
}));

vi.mock('../../src/services/proposal-renderer.service.js', () => ({
  renderProposalView: vi.fn(() => '<html>RENDERED PROPOSAL</html>'),
  renderLiveSite: vi.fn(() => '<html>RENDERED LIVE SITE</html>'),
}));

import proposalRoutes from '../../src/routes/proposal.routes.js';

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  app = Fastify();
  await app.register(proposalRoutes);
});

const buildProposal = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  token: 'tok-abc',
  status: 'approved',
  content: { brand: { tagline: 't', description: 'd' } },
  finalTier: 'Pro',
  priceCents: 59700,
  paymentLinkUrl: null,
  deployedSlug: null,
  lead: { id: 'l1', businessName: 'Test Co', unsubscribedAt: null },
  ...overrides,
});

describe('GET /proposal/:token', () => {
  it('renders the proposal view when status is approved', async () => {
    mockFindByToken.mockResolvedValue(buildProposal());

    const res = await app.inject({ method: 'GET', url: '/proposal/tok-abc' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('RENDERED PROPOSAL');
  });

  it('also renders when status is accepted or paid', async () => {
    for (const status of ['accepted', 'paid']) {
      mockFindByToken.mockResolvedValue(buildProposal({ status }));
      const res = await app.inject({ method: 'GET', url: '/proposal/tok-abc' });
      expect(res.statusCode).toBe(200);
    }
  });

  it('returns 404 when token not found', async () => {
    mockFindByToken.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/proposal/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for draft/generating/failed status', async () => {
    for (const status of ['draft', 'generating', 'failed']) {
      mockFindByToken.mockResolvedValue(buildProposal({ status }));
      const res = await app.inject({ method: 'GET', url: '/proposal/tok-abc' });
      expect(res.statusCode).toBe(404);
    }
  });
});

describe('POST /proposal/:token/accept', () => {
  it('captures lead contact and flips status to accepted', async () => {
    mockFindByToken.mockResolvedValue(buildProposal({ status: 'approved' }));
    mockUpdateIfStatusIn.mockResolvedValue(buildProposal({ status: 'accepted' }));

    const res = await app.inject({
      method: 'POST',
      url: '/proposal/tok-abc/accept',
      payload: 'name=Jane&email=jane%40example.com&phone=%2B15551234567&agreement=on',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockUpdateIfStatusIn).toHaveBeenCalledWith(
      'p1',
      ['approved'],
      expect.objectContaining({
        status: 'accepted',
        acceptedName: 'Jane',
        acceptedEmail: 'jane@example.com',
        acceptedPhone: '+15551234567',
      }),
    );
  });

  it('rejects missing fields with 400', async () => {
    mockFindByToken.mockResolvedValue(buildProposal({ status: 'approved' }));

    const res = await app.inject({
      method: 'POST',
      url: '/proposal/tok-abc/accept',
      payload: 'name=&email=&phone=&agreement=',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects missing agreement checkbox with 400', async () => {
    mockFindByToken.mockResolvedValue(buildProposal({ status: 'approved' }));

    const res = await app.inject({
      method: 'POST',
      url: '/proposal/tok-abc/accept',
      payload: 'name=Jane&email=jane%40example.com&phone=5551234567',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 410 when status is not approved (e.g. already accepted)', async () => {
    mockFindByToken.mockResolvedValue(buildProposal({ status: 'accepted' }));
    mockUpdateIfStatusIn.mockResolvedValue(null);  // guard fails

    const res = await app.inject({
      method: 'POST',
      url: '/proposal/tok-abc/accept',
      payload: 'name=Jane&email=jane%40example.com&phone=5551234567&agreement=on',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 404 when token not found', async () => {
    mockFindByToken.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/proposal/none/accept',
      payload: 'name=Jane&email=jane%40example.com&phone=5551234567&agreement=on',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /sites/:slug', () => {
  it('renders the live site when status is deployed', async () => {
    mockFindBySlug.mockResolvedValue({
      ...buildProposal({ status: 'deployed', deployedSlug: 'test-co-x9k2ab' }),
      lead: { id: 'l1', businessName: 'Test Co' },
    });
    const res = await app.inject({ method: 'GET', url: '/sites/test-co-x9k2ab' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('RENDERED LIVE SITE');
  });

  it('returns 404 for non-deployed status', async () => {
    mockFindBySlug.mockResolvedValue({
      ...buildProposal({ status: 'paid' }),
      lead: { id: 'l1', businessName: 'Test Co' },
    });
    const res = await app.inject({ method: 'GET', url: '/sites/anything' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when slug not found', async () => {
    mockFindBySlug.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/sites/nope' });
    expect(res.statusCode).toBe(404);
  });
});
