import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const { mockFindByUnsubscribeToken, mockUnsubscribe, mockPauseDripForLead } =
  vi.hoisted(() => {
    const mockFindByUnsubscribeToken = vi.fn();
    const mockUnsubscribe = vi.fn();
    const mockPauseDripForLead = vi.fn();
    return { mockFindByUnsubscribeToken, mockUnsubscribe, mockPauseDripForLead };
  });

vi.mock('../../src/db/index.js', () => ({
  leadRepo: {
    findByUnsubscribeToken: mockFindByUnsubscribeToken,
    unsubscribe: mockUnsubscribe,
  },
  outreachRepo: {
    pauseDripForLead: mockPauseDripForLead,
  },
}));

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

import unsubscribeRoutes from '../../src/routes/unsubscribe.routes.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildApp() {
  const app = Fastify();
  app.register(unsubscribeRoutes);
  return app;
}

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-001',
    businessName: 'Acme Dental',
    status: 'contacted',
    unsubscribeToken: 'unsub-token-abc',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  GET /unsubscribe/:token                                            */
/* ------------------------------------------------------------------ */

describe('GET /unsubscribe/:token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders confirmation page for valid token', async () => {
    mockFindByUnsubscribeToken.mockResolvedValue(makeLead());
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/unsubscribe/unsub-token-abc',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Confirm Unsubscribe');
    expect(res.body).toContain('form');
  });

  it('returns 404 for invalid token', async () => {
    mockFindByUnsubscribeToken.mockResolvedValue(null);
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/unsubscribe/bad-token',
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('invalid or has expired');
  });

  it('shows "already unsubscribed" for unsubscribed lead', async () => {
    mockFindByUnsubscribeToken.mockResolvedValue(makeLead({ status: 'unsubscribed' }));
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/unsubscribe/unsub-token-abc',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('already been unsubscribed');
    expect(res.body).not.toContain('Confirm Unsubscribe');
  });

  it('response is text/html', async () => {
    mockFindByUnsubscribeToken.mockResolvedValue(makeLead());
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/unsubscribe/unsub-token-abc',
    });

    expect(res.headers['content-type']).toContain('text/html');
  });

  it('passes the correct token to leadRepo', async () => {
    mockFindByUnsubscribeToken.mockResolvedValue(null);
    const app = buildApp();

    await app.inject({
      method: 'GET',
      url: '/unsubscribe/my-special-token',
    });

    expect(mockFindByUnsubscribeToken).toHaveBeenCalledWith('my-special-token');
  });
});

/* ------------------------------------------------------------------ */
/*  POST /unsubscribe/:token                                           */
/* ------------------------------------------------------------------ */

describe('POST /unsubscribe/:token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks lead as unsubscribed', async () => {
    mockFindByUnsubscribeToken.mockResolvedValue(makeLead());
    mockUnsubscribe.mockResolvedValue(makeLead({ status: 'unsubscribed' }));
    mockPauseDripForLead.mockResolvedValue({ count: 2 });
    const app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/unsubscribe/unsub-token-abc',
    });

    expect(res.statusCode).toBe(200);
    expect(mockUnsubscribe).toHaveBeenCalledWith('lead-001');
    expect(res.body).toContain('successfully unsubscribed');
  });

  it('pauses all pending outreach', async () => {
    mockFindByUnsubscribeToken.mockResolvedValue(makeLead());
    mockUnsubscribe.mockResolvedValue(makeLead({ status: 'unsubscribed' }));
    mockPauseDripForLead.mockResolvedValue({ count: 3 });
    const app = buildApp();

    await app.inject({
      method: 'POST',
      url: '/unsubscribe/unsub-token-abc',
    });

    expect(mockPauseDripForLead).toHaveBeenCalledWith('lead-001');
  });

  it('returns 404 for invalid token', async () => {
    mockFindByUnsubscribeToken.mockResolvedValue(null);
    const app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/unsubscribe/bad-token',
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('invalid or has expired');
  });

  it('shows confirmation for already unsubscribed lead', async () => {
    mockFindByUnsubscribeToken.mockResolvedValue(makeLead({ status: 'unsubscribed' }));
    const app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/unsubscribe/unsub-token-abc',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('already been unsubscribed');
    expect(mockUnsubscribe).not.toHaveBeenCalled();
    expect(mockPauseDripForLead).not.toHaveBeenCalled();
  });

  it('response is text/html', async () => {
    mockFindByUnsubscribeToken.mockResolvedValue(makeLead());
    mockUnsubscribe.mockResolvedValue(makeLead({ status: 'unsubscribed' }));
    mockPauseDripForLead.mockResolvedValue({ count: 0 });
    const app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/unsubscribe/unsub-token-abc',
    });

    expect(res.headers['content-type']).toContain('text/html');
  });
});
