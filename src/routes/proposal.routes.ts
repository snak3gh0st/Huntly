import type { FastifyInstance } from 'fastify';
import formbody from '@fastify/formbody';
import { proposalRepo, leadRepo } from '../db/index.js';
import {
  renderProposalView,
  renderLiveSite,
} from '../services/proposal-renderer.service.js';
import { sendInternalAcceptedNotification } from '../services/proposal-email.service.js';
import type { SiteContent } from '../services/proposal-generator.service.js';
import { escapeHtml } from '../lib/escape-html.js';

const VIEWABLE_STATUSES = new Set(['approved', 'accepted', 'paid']);

/** Only render a payment-link button when the URL is plainly http(s) — blocks `javascript:` etc. */
function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

interface AcceptBody {
  name?: string;
  email?: string;
  phone?: string;
  agreement?: string;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default async function proposalRoutes(app: FastifyInstance) {
  // Register form-body parser scoped to this plugin
  await app.register(formbody);

  /* GET /proposal/:token */
  app.get<{ Params: { token: string } }>('/proposal/:token', async (request, reply) => {
    const proposal = await proposalRepo.findByToken(request.params.token);
    if (!proposal || !VIEWABLE_STATUSES.has(proposal.status)) {
      return reply.status(404).type('text/html').send('<h1>Not found</h1>');
    }

    const html = await renderProposalView({
      lead: {
        businessName:      proposal.lead.businessName,
        phone:             proposal.lead.phone ?? null,
        email:             proposal.lead.email ?? null,
        googleRating:      (proposal.lead as unknown as { googleRating?: number | null }).googleRating ?? null,
        googleReviewCount: (proposal.lead as unknown as { googleReviewCount?: number | null }).googleReviewCount ?? null,
        category:          (proposal.lead as unknown as { category?: string | null }).category ?? null,
      },
      proposal: {
        token: proposal.token,
        finalTier: (proposal.finalTier ?? null) as 'Starter' | 'Pro' | 'Premium' | null,
        priceCents: proposal.priceCents,
        paymentLinkUrl: proposal.paymentLinkUrl,
      },
      content: proposal.content as unknown as SiteContent,
    });

    return reply.type('text/html').send(html);
  });

  /* POST /proposal/:token/accept */
  app.post<{ Params: { token: string }; Body: AcceptBody }>(
    '/proposal/:token/accept',
    async (request, reply) => {
      const proposal = await proposalRepo.findByToken(request.params.token);
      if (!proposal) return reply.status(404).type('text/html').send('<h1>Not found</h1>');

      const { name, email, phone, agreement } = request.body;
      const errors: string[] = [];
      if (!name || name.trim() === '') errors.push('Name is required');
      if (!email || !isValidEmail(email.trim())) errors.push('Valid email is required');
      if (!phone || phone.trim() === '') errors.push('Phone is required');
      if (agreement !== 'on') errors.push('You must agree to proceed');

      if (errors.length > 0) {
        return reply.status(400).type('text/html').send(
          `<h1>Couldn't submit</h1><ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul><p><a href="/proposal/${proposal.token}">Back</a></p>`,
        );
      }

      const updated = await proposalRepo.updateIfStatusIn(
        proposal.id,
        ['approved'],
        {
          status: 'accepted',
          acceptedName: name!.trim(),
          acceptedEmail: email!.trim(),
          acceptedPhone: phone!.trim(),
          acceptedAt: new Date(),
        },
      );

      if (!updated) {
        return reply.status(410).type('text/html').send(
          '<h1>This proposal is no longer available</h1><p>Please contact us directly.</p>',
        );
      }

      // Pause the existing SigmaAI drip
      await leadRepo.markReplied(proposal.leadId);

      // best-effort, do not fail the form submit if email send errors
      try {
        const refreshed = await proposalRepo.findById(proposal.id);
        if (refreshed) {
          await sendInternalAcceptedNotification(refreshed as any);
        }
      } catch (err) {
        console.error('[proposal] internal-accepted notification failed:', err);
      }

      const payHref = isSafeHttpUrl(proposal.paymentLinkUrl)
        ? `<p><a href="${escapeHtml(proposal.paymentLinkUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#10b981;color:white;text-decoration:none;font-weight:600;">Continue to secure payment →</a></p>`
        : '';

      return reply.type('text/html').send(
        `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Thanks</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-neutral-50 p-12"><main class="max-w-xl mx-auto text-center space-y-4"><h1 class="text-2xl font-semibold">Thanks, ${escapeHtml(name!.trim())}.</h1><p class="text-neutral-600">We'll reach out within 1 business day.</p>${payHref}</main></body></html>`,
      );
    },
  );

  /* GET /sites/:slug */
  app.get<{ Params: { slug: string } }>('/sites/:slug', async (request, reply) => {
    const proposal = await proposalRepo.findBySlug(request.params.slug);
    if (!proposal || proposal.status !== 'deployed') {
      return reply.status(404).type('text/html').send('<h1>Not found</h1>');
    }

    const html = await renderLiveSite({
      lead: {
        businessName:      proposal.lead.businessName,
        phone:             proposal.lead.phone ?? null,
        email:             proposal.lead.email ?? null,
        googleRating:      (proposal.lead as unknown as { googleRating?: number | null }).googleRating ?? null,
        googleReviewCount: (proposal.lead as unknown as { googleReviewCount?: number | null }).googleReviewCount ?? null,
        category:          (proposal.lead as unknown as { category?: string | null }).category ?? null,
      },
      content: proposal.content as unknown as SiteContent,
    });

    return reply.type('text/html').send(html);
  });
}
