import { prisma } from '../../lib/prisma.js';
import type { Prisma, ProposalDraft, ProposalStatus } from '@prisma/client';

export const proposalRepo = {
  create(data: Prisma.ProposalDraftUncheckedCreateInput): Promise<ProposalDraft> {
    return prisma.proposalDraft.create({ data });
  },

  findById(id: string) {
    return prisma.proposalDraft.findUnique({
      where: { id },
      include: { lead: { include: { enrichment: true, qualification: true, campaign: true } } },
    });
  },

  findByToken(token: string) {
    return prisma.proposalDraft.findUnique({
      where: { token },
      include: { lead: { include: { enrichment: true, qualification: true, campaign: true } } },
    });
  },

  findBySlug(slug: string) {
    return prisma.proposalDraft.findUnique({
      where: { deployedSlug: slug },
      include: { lead: true },
    });
  },

  listForLead(leadId: string) {
    return prisma.proposalDraft.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
  },

  update(id: string, data: Prisma.ProposalDraftUpdateInput): Promise<ProposalDraft> {
    return prisma.proposalDraft.update({ where: { id }, data });
  },

  /**
   * Conditional update: only proceeds if current status matches one of `from`.
   * Returns null when the status guard fails (caller decides whether to 409).
   */
  async updateIfStatusIn(
    id: string,
    from: ProposalStatus[],
    data: Prisma.ProposalDraftUpdateInput,
  ): Promise<ProposalDraft | null> {
    const result = await prisma.proposalDraft.updateMany({
      where: { id, status: { in: from } },
      data,
    });
    if (result.count === 0) return null;
    return prisma.proposalDraft.findUnique({ where: { id } });
  },

  delete(id: string) {
    return prisma.proposalDraft.delete({ where: { id } });
  },
};
