/**
 * Seed script: creates a Campaign with an EmailTemplateSet + 3 templates.
 *
 * Usage:
 *   npx tsx scripts/seed-campaign.ts \
 *     --vertical dental_clinic \
 *     --regions "London,UK" "Dubai,AE" \
 *     --name "Dental Q1 2026"
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const args = argv.slice(2); // strip node + script path
  let vertical = '';
  let name = '';
  const regions: string[] = [];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--vertical':
        vertical = args[++i] ?? '';
        break;
      case '--name':
        name = args[++i] ?? '';
        break;
      case '--regions':
        // Collect all subsequent values until the next flag or end
        while (i + 1 < args.length && !args[i + 1]!.startsWith('--')) {
          regions.push(args[++i]!);
        }
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!vertical) {
    console.error('Missing required --vertical argument');
    process.exit(1);
  }
  if (regions.length === 0) {
    console.error('Missing required --regions argument');
    process.exit(1);
  }
  if (!name) {
    name = `${vertical} campaign`;
  }

  return { vertical, name, regions };
}

// ---------------------------------------------------------------------------
// Template content per sequence
// ---------------------------------------------------------------------------

function buildTemplates(vertical: string) {
  return [
    {
      sequenceNumber: 1,
      subjectTemplate: `Quick question about your ${vertical.replace(/_/g, ' ')} — {{businessName}}`,
      bodyTemplate: [
        '<p>Hi {{businessName}},</p>',
        '<p>I noticed your practice while researching top-rated clinics in {{region}}.',
        'Most businesses in your space are losing potential patients because their website',
        "doesn't convert visitors into bookings.</p>",
        '<p>We built something that fixes that in under 48 hours — curious if you have 2 minutes',
        'to see a live demo we made for you?</p>',
        '<p><a href="{{demoUrl}}">See your personalised demo</a></p>',
        '<p>Best,<br/>The Huntly Team</p>',
        '<p style="font-size:11px;color:#999"><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>',
      ].join('\n'),
    },
    {
      sequenceNumber: 2,
      subjectTemplate: `{{businessName}}, clinics like yours are seeing 3x more bookings`,
      bodyTemplate: [
        '<p>Hi {{businessName}},</p>',
        '<p>Just wanted to share: clinics in {{region}} that added an AI assistant to their site',
        'saw an average 3x increase in online bookings within the first month.</p>',
        '<p>We put together a personalised demo showing exactly how it would work on your site:</p>',
        '<p><a href="{{demoUrl}}">View your demo</a></p>',
        '<p>No commitment, no setup needed. Just click and see.</p>',
        '<p>Cheers,<br/>The Huntly Team</p>',
        '<p style="font-size:11px;color:#999"><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>',
      ].join('\n'),
    },
    {
      sequenceNumber: 3,
      subjectTemplate: `Last chance to claim your free demo — {{businessName}}`,
      bodyTemplate: [
        '<p>Hi {{businessName}},</p>',
        "<p>This is my last note — I don't want to be a bother.</p>",
        '<p>We created a free personalised demo for your practice that shows exactly how',
        'an AI-powered assistant would handle patient enquiries, bookings, and more.</p>',
        '<p><a href="{{demoUrl}}">Claim your demo before it expires</a></p>',
        '<p>If the timing is off, no worries at all. Wishing you all the best!</p>',
        '<p>All the best,<br/>The Huntly Team</p>',
        '<p style="font-size:11px;color:#999"><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>',
      ].join('\n'),
    },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { vertical, name, regions } = parseArgs(process.argv);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Make sure your .env file exists.');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    // 1. Create EmailTemplateSet + templates
    const templateSet = await prisma.emailTemplateSet.create({
      data: {
        name: `${name} — templates`,
        vertical,
        templates: {
          create: buildTemplates(vertical),
        },
      },
    });

    // 2. Create Campaign
    const campaign = await prisma.campaign.create({
      data: {
        name,
        vertical,
        regions,
        emailTemplateSetId: templateSet.id,
        dripConfig: { delays: [0, 3, 7], maxEmails: 3 },
      },
    });

    // 3. Print summary
    console.log('\n--- Campaign created ---');
    console.log(`  ID:       ${campaign.id}`);
    console.log(`  Name:     ${campaign.name}`);
    console.log(`  Vertical: ${campaign.vertical}`);
    console.log(`  Regions:  ${campaign.regions.join(', ')}`);
    console.log(`  Status:   ${campaign.status}`);
    console.log(`  Templates: ${templateSet.id}`);
    console.log('');
    console.log(
      `To launch: curl -X POST http://localhost:3001/api/campaigns/${campaign.id}/launch -H 'x-api-key: YOUR_KEY'`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
