import { prisma } from '../../lib/prisma.js';
import { Prisma } from '@prisma/client';

export const qualificationRepo = {
  async upsert(leadId: string, data: Omit<Prisma.LeadQualificationCreateInput, 'lead'>) {
    return prisma.leadQualification.upsert({
      where: { leadId },
      create: { ...data, lead: { connect: { id: leadId } } },
      update: data,
    });
  },
};
