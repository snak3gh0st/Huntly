import type { FastifyInstance } from 'fastify';
import { outreachRepo } from '../db/index.js';
import { apiKeyAuth } from '../middleware/api-key-auth.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { Queue } from 'bullmq';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CampaignEmailsParams {
  campaignId: string;
}

interface CampaignEmailsQuery {
  status?: string;
}

interface LeadIdParams {
  id: string;
}

interface BlacklistBody {
  phone?: string;
  domain?: string;
  reason: string;
}

interface BlacklistIdParams {
  id: string;
}

/* ------------------------------------------------------------------ */
/*  Plugin                                                             */
/* ------------------------------------------------------------------ */

export default async function outreachRoutes(app: FastifyInstance) {
  app.addHook('onRequest', apiKeyAuth);

  /* GET /campaigns/:campaignId/emails — list outreach emails */
  app.get<{ Params: CampaignEmailsParams; Querystring: CampaignEmailsQuery }>(
    '/campaigns/:campaignId/emails',
    async (request, reply) => {
      const { campaignId } = request.params;
      const { status } = request.query;

      const where: Record<string, unknown> = { campaignId };
      if (status) {
        where.status = status;
      }

      const emails = await prisma.outreachEmail.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { lead: { select: { id: true, businessName: true, email: true } } },
      });

      return reply.send(emails);
    },
  );

  /* POST /leads/:id/pause-drip — pause drip for a lead */
  app.post<{ Params: LeadIdParams }>(
    '/leads/:id/pause-drip',
    async (request, reply) => {
      const result = await outreachRepo.pauseDripForLead(request.params.id);
      return reply.send({
        status: 'paused',
        leadId: request.params.id,
        cancelledCount: result.count,
      });
    },
  );

  /* GET /stats — sending stats */
  app.get('/stats', async (_request, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [sentToday, totalOpens, totalClicks, totalBounces, totalReplies] =
      await Promise.all([
        prisma.outreachEmail.count({
          where: { sentAt: { gte: today } },
        }),
        prisma.outreachEmail.count({
          where: { status: 'opened' },
        }),
        prisma.outreachEmail.count({
          where: { status: 'clicked' },
        }),
        prisma.outreachEmail.count({
          where: { status: 'bounced' },
        }),
        prisma.lead.count({
          where: { hasReplied: true },
        }),
      ]);

    return reply.send({
      sentToday,
      totalOpens,
      totalClicks,
      totalBounces,
      totalReplies,
    });
  });

  /* GET /scoring-insights — conversion rates grouped by score range */
  app.get('/scoring-insights', async (_request, reply) => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        range: string;
        total: bigint;
        contacted: bigint;
        replied: bigint;
        converted: bigint;
      }>
    >(`
      SELECT
        CASE
          WHEN lq.fit_score >= 80 THEN '80-100'
          WHEN lq.fit_score >= 70 THEN '70-79'
          WHEN lq.fit_score >= 40 THEN '40-69'
          ELSE '0-39'
        END AS range,
        count(*) AS total,
        count(*) FILTER (WHERE l.status IN ('contacted','replied','converted')) AS contacted,
        count(*) FILTER (WHERE l.status IN ('replied','converted')) AS replied,
        count(*) FILTER (WHERE l.status = 'converted') AS converted
      FROM lead_qualifications lq
      JOIN leads l ON l.id = lq.lead_id
      GROUP BY 1
      ORDER BY min(lq.fit_score) DESC
    `);

    const ranges = rows.map((r) => {
      const total = Number(r.total);
      const contacted = Number(r.contacted);
      const replied = Number(r.replied);
      const converted = Number(r.converted);
      return {
        range: r.range,
        total,
        contacted,
        replied,
        converted,
        replyRate: contacted > 0 ? Math.round((replied / contacted) * 1000) / 10 : 0,
        conversionRate: contacted > 0 ? Math.round((converted / contacted) * 1000) / 10 : 0,
      };
    });

    return reply.send({ ranges });
  });

  /* GET /pipeline — pipeline status: queue depths + lead stats */
  app.get('/pipeline', async (_request, reply) => {
    const connection = redis as any;
    const queueNames = ['source', 'enrich', 'qualify', 'outreach'] as const;

    const queues: Record<string, Record<string, number>> = {};
    for (const name of queueNames) {
      const q = new Queue(name, { connection });
      queues[name] = await q.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed');
    }

    // Lead stats with email/website counts
    const leadStats = await prisma.$queryRawUnsafe<Array<{
      status: string;
      count: bigint;
      with_email: bigint;
      with_website: bigint;
    }>>(`
      SELECT
        status,
        count(*) as count,
        count(*) FILTER (WHERE email IS NOT NULL) as with_email,
        count(*) FILTER (WHERE website_url IS NOT NULL) as with_website
      FROM leads
      GROUP BY status
      ORDER BY count DESC
    `);

    // Recent errors
    const recentErrors = await prisma.lead.findMany({
      where: { lastError: { not: null } },
      select: { id: true, businessName: true, status: true, lastError: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    // Recent leads (last 20 processed)
    const recentActivity = await prisma.lead.findMany({
      select: {
        id: true,
        businessName: true,
        status: true,
        email: true,
        googleRating: true,
        googleReviewCount: true,
        updatedAt: true,
        qualification: { select: { fitScore: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return reply.send({
      queues,
      leadStats: leadStats.map(r => ({
        status: r.status,
        count: Number(r.count),
        withEmail: Number(r.with_email),
        withWebsite: Number(r.with_website),
      })),
      recentErrors,
      recentActivity,
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Blacklist (excluded_clients) CRUD                                  */
  /* ------------------------------------------------------------------ */

  /* GET /blacklist — list all excluded clients */
  app.get('/blacklist', async (_request, reply) => {
    const items = await prisma.excludedClient.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return reply.send(items);
  });

  /* POST /blacklist — add an exclusion */
  app.post<{ Body: BlacklistBody }>('/blacklist', async (request, reply) => {
    const { phone, domain, reason } = request.body;

    if (!phone && !domain) {
      return reply.status(400).send({ error: 'Either phone or domain is required' });
    }

    const item = await prisma.excludedClient.create({
      data: { phone: phone || null, domain: domain || null, reason },
    });

    return reply.status(201).send(item);
  });

  /* DELETE /blacklist/:id — remove an exclusion */
  app.delete<{ Params: BlacklistIdParams }>('/blacklist/:id', async (request, reply) => {
    const existing = await prisma.excludedClient.findUnique({
      where: { id: request.params.id },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Exclusion not found' });
    }

    await prisma.excludedClient.delete({ where: { id: request.params.id } });
    return reply.send({ status: 'deleted', id: request.params.id });
  });
}
