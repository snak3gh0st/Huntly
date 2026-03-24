import { prisma } from '../../lib/prisma.js';
import { LeadStatus, Prisma } from '@prisma/client';
import { generateToken } from '../../lib/tokens.js';

export const leadRepo = {
  async createFromSource(data: {
    campaignId: string;
    businessName: string;
    category?: string;
    address?: string;
    region?: string;
    country?: string;
    phone?: string;
    websiteUrl?: string;
    email?: string;
    googleMapsPlaceId?: string;
    googleRating?: number;
    googleReviewCount?: number;
    sourceData?: Prisma.InputJsonValue;
  }) {
    return prisma.lead.create({
      data: {
        ...data,
        demoToken: generateToken(),
        unsubscribeToken: generateToken(),
      },
    });
  },

  async existsByPlaceId(placeId: string): Promise<boolean> {
    const count = await prisma.lead.count({
      where: { googleMapsPlaceId: placeId },
    });
    return count > 0;
  },

  async updateStatus(id: string, status: LeadStatus, error?: string) {
    return prisma.lead.update({
      where: { id },
      data: { status, lastError: error ?? null },
    });
  },

  async findByDemoToken(token: string) {
    return prisma.lead.findUnique({
      where: { demoToken: token },
      include: { qualification: true, campaign: true },
    });
  },

  async findByUnsubscribeToken(token: string) {
    return prisma.lead.findUnique({
      where: { unsubscribeToken: token },
    });
  },

  async unsubscribe(id: string) {
    return prisma.lead.update({
      where: { id },
      data: { status: 'unsubscribed' },
    });
  },

  async markReplied(id: string) {
    return prisma.lead.update({
      where: { id },
      data: { hasReplied: true, status: 'replied' },
    });
  },

  async findByCampaignAndStatus(campaignId: string, status: LeadStatus, limit = 50) {
    return prisma.lead.findMany({
      where: { campaignId, status },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });
  },

  async setDemoExpiry(id: string, expiresAt: Date) {
    return prisma.lead.update({
      where: { id },
      data: { demoExpiresAt: expiresAt },
    });
  },

  async setEmail(id: string, email: string) {
    return prisma.lead.update({
      where: { id },
      data: { email },
    });
  },

  async findByEmail(email: string) {
    return prisma.lead.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findById(id: string) {
    return prisma.lead.findUnique({
      where: { id },
      include: { enrichment: true, qualification: true, outreachEmails: true, campaign: true },
    });
  },
};
