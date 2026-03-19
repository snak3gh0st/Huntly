import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import { Prisma } from '@prisma/client';
import { redis } from '../lib/redis.js';
import { crawlWebsite, type CrawlResult } from '../services/crawler.service.js';
import { fetchReviews } from '../services/outscraper.service.js';
import { analyzeReviews, type ReviewAnalysis } from '../services/review-analyzer.service.js';
import { leadRepo, enrichmentRepo } from '../db/index.js';

// Cast needed: ioredis root vs bullmq's bundled ioredis have divergent types
const connection = redis as unknown as ConnectionOptions;

export const qualifyQueue = new Queue('qualify', { connection });

interface EnrichJobData {
  leadId: string;
}

/* ------------------------------------------------------------------ */
/*  Email ranking                                                      */
/* ------------------------------------------------------------------ */

const PREFERRED_PREFIXES = ['contact', 'info', 'hello', 'admin', 'office'];

/**
 * Pick the best email from a list.
 * Prefers contact@/info@/hello@/admin@/office@ over generic addresses.
 * Falls back to the first email found.
 */
export function pickBestEmail(emails: string[]): string | null {
  if (emails.length === 0) return null;

  for (const prefix of PREFERRED_PREFIXES) {
    const match = emails.find((e) => e.toLowerCase().startsWith(`${prefix}@`));
    if (match) return match;
  }

  return emails[0]!;
}

/* ------------------------------------------------------------------ */
/*  Worker                                                             */
/* ------------------------------------------------------------------ */

export const enrichWorker = new Worker<EnrichJobData>(
  'enrich',
  async (job) => {
    const { leadId } = job.data;
    const lead = await leadRepo.findById(leadId);
    if (!lead) return;

    const errors: string[] = [];

    // Run crawl + review analysis in parallel
    const tasks: [
      Promise<CrawlResult | null>,
      Promise<{ reviews: string[]; rating: number; analysis: ReviewAnalysis } | null>,
    ] = [
      // Task 1: Website crawl
      lead.websiteUrl
        ? crawlWebsite(lead.websiteUrl).catch((err) => {
            errors.push(`crawl: ${(err as Error).message}`);
            return null;
          })
        : Promise.resolve(null),

      // Task 2: Fetch reviews → analyze
      lead.googleMapsPlaceId
        ? fetchReviews(lead.googleMapsPlaceId)
            .then(async ({ reviews, rating }) => {
              const analysis = await analyzeReviews(reviews);
              return { reviews, rating, analysis };
            })
            .catch((err) => {
              errors.push(`reviews: ${(err as Error).message}`);
              return null;
            })
        : Promise.resolve(null),
    ];

    const [crawlResult, reviewResult] = await Promise.allSettled(tasks).then(
      (results) =>
        results.map((r) => (r.status === 'fulfilled' ? r.value : null)) as [
          CrawlResult | null,
          { reviews: string[]; rating: number; analysis: ReviewAnalysis } | null,
        ],
    );

    // Pick best email from crawl results
    const bestEmail = crawlResult ? pickBestEmail(crawlResult.emails) : null;

    // Save enrichment data
    await enrichmentRepo.upsert(leadId, {
      hasWhatsapp: crawlResult?.hasWhatsapp ?? null,
      hasChatbot: crawlResult?.hasChatbot ?? null,
      hasOnlineBooking: crawlResult?.hasOnlineBooking ?? null,
      emailsFound: crawlResult?.emails ?? [],
      websiteTechSignals: crawlResult
        ? (crawlResult.techSignals as Prisma.InputJsonValue)
        : Prisma.DbNull,
      reviewSentimentSummary: reviewResult?.analysis.sentimentSummary ?? null,
      painSignals: reviewResult
        ? (reviewResult.analysis.painSignals as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    });

    // Set email on lead if found
    if (bestEmail) {
      await leadRepo.setEmail(leadId, bestEmail);
    }

    // Update status — record errors if any
    await leadRepo.updateStatus(
      leadId,
      'enriched',
      errors.length > 0 ? errors.join('; ') : undefined,
    );

    // Enqueue qualification
    await qualifyQueue.add('qualify-lead', { leadId }, {
      jobId: `qualify-${leadId}`,
    });
  },
  {
    connection,
    concurrency: 5,
  },
);
