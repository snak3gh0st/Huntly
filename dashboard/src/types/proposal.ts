export type ProposalStatus =
  | 'generating'
  | 'draft'
  | 'approved'
  | 'accepted'
  | 'paid'
  | 'deployed'
  | 'failed';

export type Tier = 'Starter' | 'Pro' | 'Premium';

export interface Proposal {
  id: string;
  leadId: string;
  status: ProposalStatus;
  token: string;
  content: Record<string, unknown>;
  suggestedTier: Tier | null;
  finalTier: Tier | null;
  priceCents: number | null;
  paymentLinkUrl: string | null;
  acceptedName: string | null;
  acceptedEmail: string | null;
  acceptedPhone: string | null;
  acceptedAt: string | null;
  paidAt: string | null;
  deployedSlug: string | null;
  deployedAt: string | null;
  generationError: string | null;
  createdAt: string;
  updatedAt: string;
}
