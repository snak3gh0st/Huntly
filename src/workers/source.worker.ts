import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import { redis } from '../lib/redis.js';
import { searchBusinesses } from '../services/apify.service.js';
import { leadRepo, campaignRepo } from '../db/index.js';
import type { Prisma } from '@prisma/client';

// Cast needed: ioredis root vs bullmq's bundled ioredis have divergent types
const connection = redis as unknown as ConnectionOptions;

export const enrichQueue = new Queue('enrich', { connection });
export const sourceQueue = new Queue('source', { connection });

interface SourceJobData {
  campaignId: string;
}

export const sourceWorker = new Worker<SourceJobData>(
  'source',
  async (job) => {
    const campaign = await campaignRepo.findById(job.data.campaignId);
    if (!campaign || campaign.status !== 'active') return;

    let totalFound = 0;

    for (const region of campaign.regions) {
      const query = `${campaign.vertical} in ${region}`;

      let results;
      try {
        results = await searchBusinesses(query, campaign.maxLeadsPerRegion ?? 50);
      } catch (err) {
        console.error(`[source] Failed to search "${query}":`, (err as Error).message);
        continue;
      }

      if (results.length === 0) {
        console.warn(`[source] 0 results for "${query}" — try a different business type or region`);
        continue;
      }

      console.log(`[source] Found ${results.length} businesses for "${query}"`);

      for (const result of results) {
        // Dedup check
        if (result.googleMapsPlaceId && await leadRepo.existsByPlaceId(result.googleMapsPlaceId)) {
          continue;
        }

        try {
          const lead = await leadRepo.createFromSource({
            campaignId: campaign.id,
            businessName: result.businessName,
            category: result.category,
            address: result.address,
            region,
            phone: result.phone,
            websiteUrl: result.websiteUrl,
            email: result.emails?.[0],
            googleMapsPlaceId: result.googleMapsPlaceId,
            googleRating: result.googleRating,
            googleReviewCount: result.googleReviewCount,
            sourceData: {
              ...result.raw as Prisma.JsonObject,
              _contacts: {
                emails: result.emails,
                whatsapps: result.whatsapps,
                linkedIns: result.linkedIns,
                instagrams: result.instagrams,
                facebooks: result.facebooks,
              },
            } as Prisma.InputJsonValue,
          });

          totalFound++;
          await enrichQueue.add('enrich-lead', { leadId: lead.id }, {
            jobId: `enrich-${lead.id}`, // idempotent
          });
        } catch (err) {
          console.error(`[source] Failed to create lead for ${result.businessName}:`, (err as Error).message);
        }
      }
    }

    console.log(`[source] Campaign "${campaign.name}" finished: ${totalFound} new leads sourced`);
  },
  {
    connection,
    concurrency: 2,
    limiter: { max: 2, duration: 5000 },
  },
);
