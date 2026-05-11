import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Icon set — must match inline SVGs in templates                     */
/* ------------------------------------------------------------------ */

export const ICON_NAMES = [
  'phone',
  'calendar',
  'globe',
  'message',
  'clock',
  'star',
  'shield',
  'zap',
  'mail',
  'mapPin',
] as const;

export type IconName = typeof ICON_NAMES[number];

/* ------------------------------------------------------------------ */
/*  Site content schema (Claude output contract)                       */
/* ------------------------------------------------------------------ */

const IconSchema = z.enum(ICON_NAMES);

export const SiteContentSchema = z.object({
  brand: z.object({
    tagline:     z.string().min(1).max(80),
    description: z.string().min(1).max(280),
  }),
  services: z.array(z.object({
    icon:        IconSchema,
    title:       z.string().min(1).max(60),
    description: z.string().min(1).max(200),
  })).min(4).max(8),
  testimonials: z.array(z.object({
    quote:       z.string().min(1).max(300),
    attribution: z.string().min(1).max(80),
  })).max(4),
  contact: z.object({
    headline: z.string().min(1).max(60),
    address:  z.string().nullable(),
    phone:    z.string().nullable(),
    whatsapp: z.string().nullable(),
    hours:    z.string().nullable(),
  }),
  proposalIntro: z.object({
    salutation: z.string().min(1).max(80),
    pitch:      z.string().min(1).max(400),
  }),
  diagnosis: z.object({
    bullets: z.array(z.object({
      icon:     IconSchema,
      label:    z.string().min(1).max(80),
      evidence: z.string().min(1).max(200),
    })).min(2).max(5),
  }),
  pricingPitch: z.object({
    headline:     z.string().min(1).max(100),
    valueBullets: z.array(z.string().min(1).max(120)).min(2).max(4),
  }),
  cta: z.object({
    primaryLabel: z.string().min(1).max(40),
    reassurance:  z.string().min(1).max(120),
  }),
});

export type SiteContent = z.infer<typeof SiteContentSchema>;
