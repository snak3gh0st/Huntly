import { prisma } from '../../lib/prisma.js';

function extractDomain(input: string): string {
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return input.replace(/^www\./, '');
  }
}

export const excludedClientRepo = {
  async isExcluded(phone?: string, domain?: string): Promise<boolean> {
    const conditions: object[] = [];

    if (phone) {
      conditions.push({ phone });
    }
    if (domain) {
      const normalised = extractDomain(domain);
      conditions.push({ domain: normalised });
    }

    if (conditions.length === 0) return false;

    const count = await prisma.excludedClient.count({
      where: { OR: conditions },
    });
    return count > 0;
  },

  async create(data: { phone?: string; domain?: string; reason: string }) {
    return prisma.excludedClient.create({
      data: {
        ...data,
        domain: data.domain ? extractDomain(data.domain) : undefined,
      },
    });
  },
};
