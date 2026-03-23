import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { env } from './config.js';
import { runtimeConfig } from './lib/ai-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import routes (default exports)
import demoRoutes from './routes/demo.routes.js';
import unsubscribeRoutes from './routes/unsubscribe.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import campaignRoutes from './routes/campaign.routes.js';
import leadRoutes from './routes/lead.routes.js';
import outreachRoutes from './routes/outreach.routes.js';

// Import workers (side-effect: starts listening on queues)
import { sourceWorker } from './workers/source.worker.js';
import { enrichWorker } from './workers/enrich.worker.js';
import { qualifyWorker } from './workers/qualify.worker.js';
import { outreachWorker } from './workers/outreach.worker.js';

const app = Fastify({ logger: true });

await app.register(cors);

// Public config endpoint (tells dashboard what features are enabled)
app.get('/api/config', async () => ({
  emailEnabled: runtimeConfig.emailEnabled,
  aiProvider: runtimeConfig.aiProvider,
  ollamaModel: runtimeConfig.aiProvider === 'ollama' ? runtimeConfig.ollamaModel : undefined,
}));

// AI provider management
app.get('/api/ai/models', async (_req, reply) => {
  try {
    const res = await fetch(`${runtimeConfig.ollamaUrl}/api/tags`);
    if (!res.ok) throw new Error('Ollama not reachable');
    const data = await res.json() as { models: Array<{ name: string; size: number; modified_at: string }> };
    const models = data.models.map(m => ({
      name: m.name,
      sizeGB: +(m.size / 1_073_741_824).toFixed(1),
      modified: m.modified_at,
    }));
    return reply.send({ ollamaOnline: true, models });
  } catch {
    return reply.send({ ollamaOnline: false, models: [] });
  }
});

app.post<{ Body: { provider: string; ollamaModel?: string } }>(
  '/api/ai/provider',
  async (req, reply) => {
    const { provider, ollamaModel } = req.body;
    if (!['ollama', 'groq', 'openai'].includes(provider)) {
      return reply.status(400).send({ error: 'Invalid provider' });
    }
    runtimeConfig.aiProvider = provider as 'ollama' | 'groq' | 'openai';
    if (ollamaModel) runtimeConfig.ollamaModel = ollamaModel;
    console.log(`[ai] Provider switched to ${provider}${ollamaModel ? ` (${ollamaModel})` : ''}`);
    return reply.send({ provider: runtimeConfig.aiProvider, ollamaModel: runtimeConfig.ollamaModel });
  },
);

// Email toggle
app.post<{ Body: { enabled: boolean } }>(
  '/api/config/email',
  async (req, reply) => {
    runtimeConfig.emailEnabled = req.body.enabled;
    console.log(`[config] Email ${runtimeConfig.emailEnabled ? 'enabled' : 'disabled'}`);
    return reply.send({ emailEnabled: runtimeConfig.emailEnabled });
  },
);

// Public routes (no auth)
await app.register(demoRoutes, { prefix: '/demo' });
await app.register(unsubscribeRoutes, { prefix: '/unsubscribe' });
await app.register(webhookRoutes, { prefix: '/webhooks' });

// Admin routes (API key auth applied inside each route file)
await app.register(campaignRoutes, { prefix: '/api' });
await app.register(leadRoutes, { prefix: '/api' });
await app.register(outreachRoutes, { prefix: '/api' });

// Serve dashboard (static build) — only if the build exists
const dashboardPath = resolve(__dirname, 'dashboard');
if (existsSync(dashboardPath)) {
  await app.register(fastifyStatic, {
    root: dashboardPath,
    prefix: '/',
    wildcard: false,
  });

  // SPA fallback — serve index.html for any non-API, non-file route
  app.setNotFoundHandler(async (_req, reply) => {
    return reply.sendFile('index.html', dashboardPath);
  });
}

// Graceful shutdown
const shutdown = async () => {
  console.log('[shutdown] Closing workers...');
  await Promise.all([
    sourceWorker.close(),
    enrichWorker.close(),
    qualifyWorker.close(),
    outreachWorker.close(),
  ]);
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
console.log(`Huntly running on port ${env.PORT} (sendNow=direct)`);
