import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leadRepo, outreachRepo } from '../db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Template loading                                                    */
/* ------------------------------------------------------------------ */

let templateCache: string | null = null;

function loadTemplate(): string {
  if (templateCache) return templateCache;
  templateCache = readFileSync(
    resolve(__dirname, '../templates/unsubscribe/unsubscribe.html'),
    'utf-8',
  );
  return templateCache;
}

function render(fields: Record<string, string>): string {
  let html = loadTemplate();
  for (const [key, value] of Object.entries(fields)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

/* ------------------------------------------------------------------ */
/*  Plugin                                                              */
/* ------------------------------------------------------------------ */

export default async function unsubscribeRoutes(app: FastifyInstance) {
  /* GET — render confirmation page */
  app.get<{ Params: { token: string } }>(
    '/unsubscribe/:token',
    async (request, reply) => {
      const { token } = request.params;

      const lead = await leadRepo.findByUnsubscribeToken(token);
      if (!lead) {
        return reply.status(404).type('text/html').send(
          render({
            status_message: 'This unsubscribe link is invalid or has expired.',
            form_html: '',
          }),
        );
      }

      if (lead.status === 'unsubscribed') {
        return reply.type('text/html').send(
          render({
            status_message: "You've already been unsubscribed. You won't receive any more messages from us.",
            form_html: '',
          }),
        );
      }

      const formHtml = [
        `<form method="POST" action="/unsubscribe/${token}">`,
        '  <button type="submit" class="confirm-btn">Confirm Unsubscribe</button>',
        '</form>',
      ].join('\n');

      return reply.type('text/html').send(
        render({
          status_message: 'Click the button below to unsubscribe from our emails.',
          form_html: formHtml,
        }),
      );
    },
  );

  /* POST — process unsubscribe */
  app.post<{ Params: { token: string } }>(
    '/unsubscribe/:token',
    async (request, reply) => {
      const { token } = request.params;

      const lead = await leadRepo.findByUnsubscribeToken(token);
      if (!lead) {
        return reply.status(404).type('text/html').send(
          render({
            status_message: 'This unsubscribe link is invalid or has expired.',
            form_html: '',
          }),
        );
      }

      if (lead.status === 'unsubscribed') {
        return reply.type('text/html').send(
          render({
            status_message: "You've already been unsubscribed. You won't receive any more messages from us.",
            form_html: '',
          }),
        );
      }

      await leadRepo.unsubscribe(lead.id);
      await outreachRepo.pauseDripForLead(lead.id);

      return reply.type('text/html').send(
        render({
          status_message: "You've been successfully unsubscribed. You won't receive any more messages from us.",
          form_html: '',
        }),
      );
    },
  );
}
