import type { ProposalDraft, Lead } from '@prisma/client';
import { sendEmail } from './email.service.js';
import { outreachRepo } from '../db/index.js';
import { env, getSitesBaseUrl } from '../config.js';
import { priceForTier, type Tier } from '../lib/pricing-tiers.js';

type ProposalWithLead = ProposalDraft & {
  lead: Pick<Lead, 'id' | 'email' | 'businessName' | 'unsubscribeToken' | 'campaignId'>;
};

function formatUsd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function proposalUrl(token: string): string {
  return `${env.BASE_URL}/proposal/${token}`;
}

function unsubUrl(token: string | null): string {
  return token ? `${env.BASE_URL}/unsubscribe/${token}` : `${env.BASE_URL}/unsubscribe`;
}

export async function sendProposalOfferEmail(
  proposal: ProposalWithLead,
): Promise<{ messageId: string }> {
  if (!proposal.lead.email) throw new Error('Lead has no email');

  const content = (proposal.content as any) ?? {};
  const intro = content.proposalIntro?.pitch ?? "Here's a draft website we put together for you.";

  const messageId = await sendEmail({
    to: proposal.lead.email,
    subject: `We drafted a website for ${proposal.lead.businessName} — take a look`,
    templateName: 'proposal-offer',
    mergeFields: {
      owner_or_business: proposal.lead.businessName,
      business_name: proposal.lead.businessName,
      intro_line: intro,
      proposal_url: proposalUrl(proposal.token),
      subject: `We drafted a website for ${proposal.lead.businessName}`,
    },
    unsubscribeUrl: unsubUrl(proposal.lead.unsubscribeToken),
  });

  await outreachRepo.create({
    leadId: proposal.leadId,
    campaignId: proposal.lead.campaignId,
    sequenceNumber: 0,
    resendMessageId: messageId,
    subject: `We drafted a website for ${proposal.lead.businessName}`,
    bodyHtml: '',
    status: 'sending',
    scheduledFor: new Date(),
  });

  return { messageId };
}

export async function sendSiteDeliveredEmail(
  proposal: ProposalWithLead,
): Promise<{ messageId: string }> {
  if (!proposal.lead.email) throw new Error('Lead has no email');
  if (!proposal.deployedSlug) throw new Error('Proposal has no deployed slug');

  const siteUrl = `${getSitesBaseUrl()}/sites/${proposal.deployedSlug}`;

  const messageId = await sendEmail({
    to: proposal.lead.email,
    subject: 'Your new website is live',
    templateName: 'site-delivered',
    mergeFields: {
      owner_or_business: proposal.lead.businessName,
      business_name: proposal.lead.businessName,
      site_url: siteUrl,
      subject: 'Your new website is live',
    },
    unsubscribeUrl: unsubUrl(proposal.lead.unsubscribeToken),
  });

  await outreachRepo.create({
    leadId: proposal.leadId,
    campaignId: proposal.lead.campaignId,
    sequenceNumber: -1,
    resendMessageId: messageId,
    subject: 'Your new website is live',
    bodyHtml: '',
    status: 'sending',
    scheduledFor: new Date(),
  });

  return { messageId };
}

export async function sendInternalAcceptedNotification(
  proposal: ProposalWithLead,
): Promise<void> {
  const tier = (proposal.finalTier ?? 'Starter') as Tier;
  const cents = proposal.priceCents ?? priceForTier(tier);
  const acceptedAt = proposal.acceptedAt ? proposal.acceptedAt.toISOString() : '';

  await sendEmail({
    to: env.SENDER_EMAIL,
    subject: `Proposal accepted by ${proposal.lead.businessName} — ${formatUsd(cents)}`,
    templateName: 'proposal-accepted-internal',
    mergeFields: {
      business_name: proposal.lead.businessName,
      tier,
      price_display: formatUsd(cents),
      accepted_name: proposal.acceptedName ?? '',
      accepted_email: proposal.acceptedEmail ?? '',
      accepted_phone: proposal.acceptedPhone ?? '',
      accepted_at: acceptedAt,
      dashboard_url: `${env.BASE_URL}/?lead=${proposal.leadId}&proposal=${proposal.id}`,
      subject: `Proposal accepted by ${proposal.lead.businessName}`,
    },
    unsubscribeUrl: `${env.BASE_URL}/unsubscribe`,
  });
}
