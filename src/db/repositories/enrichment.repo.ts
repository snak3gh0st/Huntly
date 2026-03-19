import { prisma } from '../../lib/prisma.js';
import { Prisma } from '@prisma/client';

export const enrichmentRepo = {
  async upsert(leadId: string, data: Omit<Prisma.LeadEnrichmentCreateInput, 'lead'>) {
    return prisma.leadEnrichment.upsert({
      where: { leadId },
      create: { ...data, lead: { connect: { id: leadId } } },
      update: data,
    });
  },
};
