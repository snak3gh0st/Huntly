import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendEmail = vi.fn();
const mockOutreachCreate = vi.fn();

vi.mock('../../src/services/email.service.js', () => ({
  sendEmail: (...a: unknown[]) => mockSendEmail(...a),
}));

vi.mock('../../src/db/index.js', () => ({
  outreachRepo: {
    create: (...a: unknown[]) => mockOutreachCreate(...a),
  },
}));

vi.mock('../../src/config.js', () => ({
  env: { BASE_URL: 'https://huntly.app', SITES_BASE_URL: 'https://sites.huntlysites.com', SENDER_EMAIL: 'hello@huntly.app' },
  getSitesBaseUrl: () => 'https://sites.huntlysites.com',
}));

import {
  sendProposalOfferEmail,
  sendSiteDeliveredEmail,
  sendInternalAcceptedNotification,
} from '../../src/services/proposal-email.service.js';

const baseProposal = {
  id: 'p1',
  campaignId: 'c1',
  leadId: 'l1',
  token: 'tok-x',
  finalTier: 'Pro',
  priceCents: 59700,
  deployedSlug: null,
  acceptedName: null,
  acceptedEmail: null,
  acceptedPhone: null,
  acceptedAt: null,
  content: { proposalIntro: { salutation: 'Hi Dr. Silva,', pitch: 'Have a look.' } },
  lead: {
    id: 'l1',
    campaignId: 'c1',
    email: 'owner@biz.com',
    businessName: 'Smile Dental',
    unsubscribeToken: 'unsub-token',
  },
};

describe('sendProposalOfferEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls sendEmail with the proposal-offer template and proposal URL', async () => {
    mockSendEmail.mockResolvedValue('msg-1');
    mockOutreachCreate.mockResolvedValue({ id: 'oe-1' });

    const result = await sendProposalOfferEmail(baseProposal as any);

    expect(result.messageId).toBe('msg-1');
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@biz.com',
        templateName: 'proposal-offer',
        mergeFields: expect.objectContaining({
          proposal_url: 'https://huntly.app/proposal/tok-x',
          business_name: 'Smile Dental',
        }),
        unsubscribeUrl: 'https://huntly.app/unsubscribe/unsub-token',
      }),
    );
  });

  it('records an OutreachEmail row with sequenceNumber 0', async () => {
    mockSendEmail.mockResolvedValue('msg-1');

    await sendProposalOfferEmail(baseProposal as any);

    expect(mockOutreachCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'l1',
        campaignId: 'c1',
        sequenceNumber: 0,
        resendMessageId: 'msg-1',
      }),
    );
  });
});

describe('sendSiteDeliveredEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses SITES_BASE_URL for the delivered site URL', async () => {
    mockSendEmail.mockResolvedValue('msg-2');
    const deployed = { ...baseProposal, status: 'deployed', deployedSlug: 'smile-dental-x9k2ab' };

    await sendSiteDeliveredEmail(deployed as any);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'site-delivered',
        mergeFields: expect.objectContaining({
          site_url: 'https://sites.huntlysites.com/sites/smile-dental-x9k2ab',
        }),
      }),
    );
  });

  it('records an OutreachEmail row with sequenceNumber -1', async () => {
    mockSendEmail.mockResolvedValue('msg-2');
    const deployed = { ...baseProposal, deployedSlug: 'smile-dental-x9k2ab' };

    await sendSiteDeliveredEmail(deployed as any);

    expect(mockOutreachCreate).toHaveBeenCalledWith(
      expect.objectContaining({ sequenceNumber: -1 }),
    );
  });
});

describe('sendInternalAcceptedNotification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends to SENDER_EMAIL with the lead contact info', async () => {
    mockSendEmail.mockResolvedValue('msg-3');
    const accepted = {
      ...baseProposal,
      acceptedName: 'Jane',
      acceptedEmail: 'jane@biz.com',
      acceptedPhone: '+15551234567',
      acceptedAt: new Date('2026-05-11T14:30:00Z'),
    };

    await sendInternalAcceptedNotification(accepted as any);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'hello@huntly.app',
        templateName: 'proposal-accepted-internal',
        mergeFields: expect.objectContaining({
          accepted_name: 'Jane',
          accepted_email: 'jane@biz.com',
          business_name: 'Smile Dental',
        }),
      }),
    );
  });
});
