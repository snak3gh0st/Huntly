import type { ProposalDraft } from '@prisma/client';

// Stubbed in this commit — full implementation in Task 20.
export async function sendProposalOfferEmail(_proposal: ProposalDraft & { lead: { email: string | null; businessName: string; unsubscribeToken: string | null } }): Promise<{ messageId: string }> {
  throw new Error('sendProposalOfferEmail not implemented yet');
}

export async function sendSiteDeliveredEmail(_proposal: unknown): Promise<{ messageId: string }> {
  throw new Error('sendSiteDeliveredEmail not implemented yet');
}

export async function sendInternalAcceptedNotification(_proposal: unknown): Promise<void> {
  throw new Error('sendInternalAcceptedNotification not implemented yet');
}
