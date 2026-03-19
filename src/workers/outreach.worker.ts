import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import { redis } from '../lib/redis.js';
import { leadRepo, outreachRepo } from '../db/index.js';
import { sendEmail } from '../services/email.service.js';
import { env } from '../config.js';

// Cast needed: ioredis root vs bullmq's bundled ioredis have divergent types
const connection = redis as unknown as ConnectionOptions;

export const outreachQueue = new Queue('outreach', { connection });

/* ------------------------------------------------------------------ */
/*  Drip sequence config                                               */
/* ------------------------------------------------------------------ */

const DRIP_SEQUENCE = [
  { sequenceNumber: 1, templateName: 'mirror', delayDays: 0 },
  { sequenceNumber: 2, templateName: 'social-proof', delayDays: 3 },
  { sequenceNumber: 3, templateName: 'direct-offer', delayDays: 7 },
] as const;

const SUBJECT_TEMPLATES: Record<number, (fields: MergeFields) => string> = {
  1: (f) => `${f.count} of your customers can't reach you, ${f.business_name}`,
  2: (f) => `How ${f.business_name}'s competitors are winning`,
  3: (f) => `Last chance: free demo for ${f.business_name}`,
};

const SUBJECT_VARIANTS: Record<number, (fields: MergeFields) => string> = {
  1: (f) => `${f.business_name}, your customers are waiting for a reply`,
  2: (f) => `What if ${f.business_name} never missed another message?`,
  3: (f) => `Free for 7 days: AI assistant for ${f.business_name}`,
};

const LAST_SEQUENCE = DRIP_SEQUENCE[DRIP_SEQUENCE.length - 1]!.sequenceNumber;
const DEMO_EXPIRY_DAYS = 60;

/* ------------------------------------------------------------------ */
/*  Daily cap + warm-up                                                */
/* ------------------------------------------------------------------ */

const WARMUP_DAYS = 14;
const BASE_CAP = 20;
const RAMP_FACTOR = 1.2;
const MAX_CAP = 50;

/** Reads WARMUP_START_DATE from env, defaults to today if not set. */
export const WARMUP_START_DATE = process.env.WARMUP_START_DATE
  ? new Date(process.env.WARMUP_START_DATE)
  : new Date();

export function getDailyCap(startDate: Date): number {
  const daysSinceStart = Math.floor(
    (Date.now() - startDate.getTime()) / 86_400_000,
  );
  if (daysSinceStart < 0) return 0;
  if (daysSinceStart >= WARMUP_DAYS) return MAX_CAP;
  return Math.min(
    Math.floor(BASE_CAP * Math.pow(RAMP_FACTOR, daysSinceStart)),
    MAX_CAP,
  );
}

export async function canSendToday(): Promise<boolean> {
  const key = `huntly:sends:${new Date().toISOString().slice(0, 10)}`;
  const count = await redis.get(key);
  return parseInt(count ?? '0', 10) < getDailyCap(WARMUP_START_DATE);
}

export async function incrementSendCount(): Promise<void> {
  const key = `huntly:sends:${new Date().toISOString().slice(0, 10)}`;
  await redis.incr(key);
  await redis.expire(key, 172_800); // 48h TTL
}

/* ------------------------------------------------------------------ */
/*  Language detection from region                                     */
/* ------------------------------------------------------------------ */

export function detectLanguage(region: string): string {
  const r = region.toLowerCase();
  if (
    r.includes('brazil') ||
    r.includes('brasil') ||
    r.includes('portugal') ||
    r.includes('angola') ||
    r.includes('moçambique') ||
    r.includes('mocambique')
  )
    return 'pt';
  if (
    r.includes('uae') ||
    r.includes('dubai') ||
    r.includes('saudi') ||
    r.includes('qatar') ||
    r.includes('bahrain') ||
    r.includes('kuwait') ||
    r.includes('oman') ||
    r.includes('egypt') ||
    r.includes('jordan') ||
    r.includes('lebanon')
  )
    return 'ar';
  return 'en';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

interface MergeFields extends Record<string, string> {
  business_name: string;
  personalized_hook: string;
  demo_url: string;
  unsubscribe_url: string;
  physical_address: string;
  count: string;
  owner_greeting: string;
}

type FullLead = NonNullable<Awaited<ReturnType<typeof leadRepo.findById>>>;

function getOwnerGreeting(enrichment: FullLead['enrichment'], lang: string): string {
  const name = enrichment?.ownerName;
  const firstName = name?.split(' ')[0];

  if (!firstName) {
    if (lang === 'pt') return 'Olá,';
    if (lang === 'ar') return '\u0645\u0631\u062D\u0628\u064B\u0627\u060C';
    return 'Hi there,';
  }

  if (lang === 'pt') return `Olá ${firstName},`;
  if (lang === 'ar') return `\u0645\u0631\u062D\u0628\u064B\u0627 ${firstName}\u060C`;
  return `Hi ${firstName},`;
}

function buildMergeFields(lead: FullLead, lang: string): MergeFields {
  const painCount = Array.isArray(lead.enrichment?.painSignals)
    ? (lead.enrichment.painSignals as Array<{ count: number }>).reduce(
        (sum, p) => sum + (p.count ?? 0),
        0,
      )
    : 0;
  const count = Math.max(painCount, 3); // minimum 3 for subject line

  return {
    business_name: lead.businessName,
    personalized_hook: lead.qualification?.personalizedHook ?? '',
    demo_url: `${env.BASE_URL}/demo/${lead.demoToken}`,
    unsubscribe_url: `${env.BASE_URL}/unsubscribe/${lead.unsubscribeToken}`,
    physical_address: lead.campaign?.senderAddress ?? env.PHYSICAL_ADDRESS,
    count: String(count),
    owner_greeting: getOwnerGreeting(lead.enrichment, lang),
  };
}

function getSubject(sequenceNumber: number, fields: MergeFields, variant: 'A' | 'B' = 'A'): string {
  const templates = variant === 'B' ? SUBJECT_VARIANTS : SUBJECT_TEMPLATES;
  const builder = templates[sequenceNumber];
  if (!builder) throw new Error(`Unknown sequence number: ${sequenceNumber}`);
  return builder(fields);
}

function getTemplateName(sequenceNumber: number, lang: string): string {
  const step = DRIP_SEQUENCE.find((s) => s.sequenceNumber === sequenceNumber);
  if (!step) throw new Error(`Unknown sequence number: ${sequenceNumber}`);
  // English is the default (no suffix); other languages append -lang
  return lang === 'en' ? step.templateName : `${step.templateName}-${lang}`;
}

/** Returns true if drip should stop for this lead. */
async function shouldStop(lead: FullLead): Promise<boolean> {
  if (lead.status === 'unsubscribed') return true;
  if (lead.hasReplied) return true;
  if (await outreachRepo.hasClickedAny(lead.id)) return true;
  return false;
}

function tomorrowAt9am(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/* ------------------------------------------------------------------ */
/*  Timezone-aware scheduling                                          */
/* ------------------------------------------------------------------ */

function getLeadTimezone(lead: FullLead): string {
  // Google Maps source data includes time_zone field
  const tz = (lead.sourceData as any)?.time_zone;
  if (tz && typeof tz === 'string') return tz;

  // Fallback: guess from region
  const region = (lead.region ?? '').toLowerCase();
  if (region.includes('dubai') || region.includes('uae')) return 'Asia/Dubai';
  if (region.includes('london') || region.includes('uk')) return 'Europe/London';
  if (
    region.includes('brazil') ||
    region.includes('brasil') ||
    region.includes('são paulo') ||
    region.includes('sao paulo')
  )
    return 'America/Sao_Paulo';
  if (
    region.includes('miami') ||
    region.includes('new york') ||
    region.includes(' us')
  )
    return 'America/New_York';
  if (region.includes('tokyo') || region.includes('japan'))
    return 'Asia/Tokyo';
  if (region.includes('sydney') || region.includes('australia'))
    return 'Australia/Sydney';
  if (
    region.includes('paris') ||
    region.includes('france') ||
    region.includes('germany') ||
    region.includes('spain') ||
    region.includes('italy')
  )
    return 'Europe/Paris';

  return 'UTC'; // fallback
}

function getNextSendTime(timezone: string): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  const localHour = parseInt(formatter.format(now), 10);

  if (localHour < 9) {
    // Today at 9am in their timezone
    const diff = 9 - localHour;
    return new Date(now.getTime() + diff * 3600000);
  } else if (localHour < 17) {
    // During business hours — send now
    return now;
  } else {
    // After 5pm — schedule for tomorrow 9am
    const hoursUntil9am = 24 - localHour + 9;
    return new Date(now.getTime() + hoursUntil9am * 3600000);
  }
}

/* ------------------------------------------------------------------ */
/*  Job types                                                          */
/* ------------------------------------------------------------------ */

interface SendDripJobData {
  leadId: string;
  sequenceNumber: number;
}

/* ------------------------------------------------------------------ */
/*  Worker                                                             */
/* ------------------------------------------------------------------ */

export const outreachWorker = new Worker<SendDripJobData | Record<string, never>>(
  'outreach',
  async (job) => {
    /* ---------- process-scheduled ---------- */
    if (job.name === 'process-scheduled') {
      const due = await outreachRepo.findScheduledBefore(new Date());
      for (const email of due) {
        await outreachQueue.add(
          'send-drip',
          { leadId: email.leadId, sequenceNumber: email.sequenceNumber },
          { jobId: `drip-${email.leadId}-${email.sequenceNumber}-${Date.now()}` },
        );
      }
      return;
    }

    /* ---------- send-drip ---------- */
    const { leadId, sequenceNumber } = job.data as SendDripJobData;

    // 1. Fetch lead (full include)
    const lead = await leadRepo.findById(leadId);
    if (!lead) return;

    // 2. Check stop conditions
    if (await shouldStop(lead)) return;

    // 3. Check daily cap — re-schedule for tomorrow 9am if exhausted
    if (!(await canSendToday())) {
      const tomorrow = tomorrowAt9am();
      await outreachQueue.add(
        'send-drip',
        { leadId, sequenceNumber },
        { delay: tomorrow.getTime() - Date.now() },
      );
      return;
    }

    // 3b. Timezone-aware scheduling: if outside business hours in lead's
    //     timezone, re-schedule for their next 9am
    const leadTimezone = getLeadTimezone(lead);
    const sendTime = getNextSendTime(leadTimezone);
    const delayUntilSend = sendTime.getTime() - Date.now();
    if (delayUntilSend > 60_000) {
      // More than 1 minute away — re-queue with delay
      await outreachQueue.add(
        'send-drip',
        { leadId, sequenceNumber },
        { delay: delayUntilSend },
      );
      return;
    }

    // 4. Build merge fields + detect language from region
    const lang = detectLanguage(lead.region ?? '');
    const mergeFields = buildMergeFields(lead, lang);
    const variant: 'A' | 'B' = Math.random() < 0.5 ? 'A' : 'B';
    const subject = getSubject(sequenceNumber, mergeFields, variant);
    const templateName = getTemplateName(sequenceNumber, lang);
    const unsubscribeUrl = mergeFields.unsubscribe_url;

    // 5. Create outreach email record (status: scheduled)
    const emailRecord = await outreachRepo.create({
      lead: { connect: { id: leadId } },
      campaign: { connect: { id: lead.campaignId } },
      sequenceNumber,
      subject,
      variant,
      bodyHtml: '',
      status: 'scheduled',
      scheduledFor: new Date(),
    });

    // 6. Send email via Resend
    let resendMessageId: string;
    try {
      resendMessageId = await sendEmail({
        to: lead.email!,
        subject,
        templateName,
        mergeFields,
        unsubscribeUrl,
      });
    } catch (err) {
      // Resend 4xx or other failure — mark email failed, log, return
      console.error(`[outreach] Failed to send email to ${lead.email}:`, (err as Error).message);
      await outreachRepo.updateStatus(emailRecord.id, 'failed');
      await leadRepo.updateStatus(leadId, lead.status, (err as Error).message);
      return;
    }

    // 7. Update email record: status → sending, set resendMessageId + sentAt
    await outreachRepo.updateStatus(emailRecord.id, 'sending', {
      sentAt: new Date(),
      resendMessageId,
    });

    // Increment daily send counter
    await incrementSendCount();

    // 8. Update lead status to 'contacted' on first email
    if (sequenceNumber === 1) {
      await leadRepo.updateStatus(leadId, 'contacted');
    }

    // 9. Schedule next drip if not last email (timezone-aware: land at 9am in lead's TZ)
    if (sequenceNumber < LAST_SEQUENCE) {
      const nextStep = DRIP_SEQUENCE.find(
        (s) => s.sequenceNumber === sequenceNumber + 1,
      )!;
      const currentStep = DRIP_SEQUENCE.find(
        (s) => s.sequenceNumber === sequenceNumber,
      )!;
      const baseDays = nextStep.delayDays - currentStep.delayDays;
      // Calculate delay to land at lead's next 9am + baseDays offset
      const futureDate = new Date(Date.now() + baseDays * 86_400_000);
      const futureFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: leadTimezone,
        hour: 'numeric',
        hour12: false,
      });
      const futureHour = parseInt(futureFormatter.format(futureDate), 10);
      // Adjust so it arrives at 9am in their TZ
      const hourAdjust = 9 - futureHour;
      const delayMs = baseDays * 86_400_000 + hourAdjust * 3600_000;
      await outreachQueue.add(
        'send-drip',
        { leadId, sequenceNumber: sequenceNumber + 1 },
        { delay: Math.max(delayMs, 60_000) },
      );
    }

    // 10. After last email: set demo expiry to 60 days from now
    if (sequenceNumber === LAST_SEQUENCE) {
      const expiresAt = new Date(Date.now() + DEMO_EXPIRY_DAYS * 86_400_000);
      await leadRepo.setDemoExpiry(leadId, expiresAt);
    }
  },
  {
    connection,
    concurrency: 1,
  },
);
