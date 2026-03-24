import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import { Prisma } from '@prisma/client';
import { redis } from '../lib/redis.js';
import { crawlWebsite, type CrawlResult } from '../services/crawler.service.js';
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

      // Task 2: Extract reviews from Apify source data → analyze
      (async () => {
        try {
          const raw = lead.sourceData as Record<string, unknown> | null;
          const rawReviews = Array.isArray(raw?.reviews) ? raw.reviews as Record<string, unknown>[] : [];
          if (rawReviews.length === 0) return null;
          const reviews = rawReviews
            .map((r) => (r.text ?? r.reviewText ?? r.snippet ?? '') as string)
            .filter((t) => typeof t === 'string' && t.length > 10);
          const rating = (raw?.totalScore as number) ?? 0;
          const analysis = await analyzeReviews(reviews);
          return { reviews, rating, analysis };
        } catch (err) {
          errors.push(`reviews: ${(err as Error).message}`);
          return null;
        }
      })(),
    ];

    const [crawlResult, reviewResult] = await Promise.allSettled(tasks).then(
      (results) =>
        results.map((r) => (r.status === 'fulfilled' ? r.value : null)) as [
          CrawlResult | null,
          { reviews: string[]; rating: number; analysis: ReviewAnalysis } | null,
        ],
    );

    // Merge emails: crawl + Apify source data
    const sourceContacts = (lead.sourceData as any)?._contacts ?? {};
    const apifyEmails: string[] = Array.isArray(sourceContacts.emails) ? sourceContacts.emails : [];
    const allEmails = [...(crawlResult?.emails ?? []), ...apifyEmails];
    const bestEmail = allEmails.length > 0 ? pickBestEmail(allEmails) : null;

    // Use WhatsApp from Apify if crawl didn't detect it
    const apifyWhatsapps: string[] = Array.isArray(sourceContacts.whatsapps) ? sourceContacts.whatsapps : [];
    const hasWhatsapp = crawlResult?.hasWhatsapp ?? (apifyWhatsapps.length > 0 ? true : null);

    const ownerName = (lead.sourceData as any)?.owner_title ?? null;

    // Save enrichment data
    await enrichmentRepo.upsert(leadId, {
      hasWhatsapp: hasWhatsapp,
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
      ownerName,
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
