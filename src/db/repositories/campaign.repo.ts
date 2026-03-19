import { prisma } from '../../lib/prisma.js';
import { CampaignStatus, Prisma } from '@prisma/client';

export const campaignRepo = {
  async create(data: Prisma.CampaignCreateInput) {
    return prisma.campaign.create({ data });
  },

  async findById(id: string) {
    return prisma.campaign.findUnique({
      where: { id },
      include: { emailTemplateSet: { include: { templates: true } } },
    });
  },

  async updateStatus(id: string, status: CampaignStatus) {
    return prisma.campaign.update({
      where: { id },
      data: { status },
    });
  },

  async findActive() {
    return prisma.campaign.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findAll() {
    return prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },
};
