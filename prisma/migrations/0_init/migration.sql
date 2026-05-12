-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'active', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('sourced', 'enriched', 'qualified', 'contacted', 'replied', 'converted', 'unsubscribed');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('scheduled', 'sending', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'complained');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "vertical" TEXT NOT NULL,
    "regions" TEXT[],
    "max_leads_per_region" INTEGER NOT NULL DEFAULT 50,
    "email_template_set_id" TEXT,
    "drip_config" JSONB NOT NULL DEFAULT '{}',
    "sender_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "region" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "website_url" TEXT,
    "email" TEXT,
    "google_maps_place_id" TEXT,
    "google_rating" DOUBLE PRECISION,
    "google_review_count" INTEGER,
    "source_data" JSONB,
    "status" "LeadStatus" NOT NULL DEFAULT 'sourced',
    "has_replied" BOOLEAN NOT NULL DEFAULT false,
    "demo_token" TEXT,
    "demo_expires_at" TIMESTAMP(3),
    "unsubscribe_token" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_enrichments" (
    "lead_id" TEXT NOT NULL,
    "has_whatsapp" BOOLEAN,
    "has_chatbot" BOOLEAN,
    "has_online_booking" BOOLEAN,
    "emails_found" TEXT[],
    "website_tech_signals" JSONB,
    "review_sentiment_summary" TEXT,
    "pain_signals" JSONB,
    "owner_name" TEXT,
    "enriched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_enrichments_pkey" PRIMARY KEY ("lead_id")
);

-- CreateTable
CREATE TABLE "lead_qualifications" (
    "lead_id" TEXT NOT NULL,
    "fit_score" INTEGER NOT NULL,
    "score_reasoning" TEXT NOT NULL,
    "personalized_hook" TEXT NOT NULL,
    "demo_page_data" JSONB NOT NULL,
    "qualified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_qualifications_pkey" PRIMARY KEY ("lead_id")
);

-- CreateTable
CREATE TABLE "outreach_emails" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "resend_message_id" TEXT,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "variant" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'scheduled',
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_template_sets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,

    CONSTRAINT "email_template_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "template_set_id" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "subject_template" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excluded_clients" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "domain" TEXT,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excluded_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_google_maps_place_id_key" ON "leads"("google_maps_place_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_demo_token_key" ON "leads"("demo_token");

-- CreateIndex
CREATE UNIQUE INDEX "leads_unsubscribe_token_key" ON "leads"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "leads_campaign_id_idx" ON "leads"("campaign_id");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "outreach_emails_lead_id_idx" ON "outreach_emails"("lead_id");

-- CreateIndex
CREATE INDEX "outreach_emails_campaign_id_idx" ON "outreach_emails"("campaign_id");

-- CreateIndex
CREATE INDEX "outreach_emails_status_scheduled_for_idx" ON "outreach_emails"("status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_template_set_id_sequence_number_key" ON "email_templates"("template_set_id", "sequence_number");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_email_template_set_id_fkey" FOREIGN KEY ("email_template_set_id") REFERENCES "email_template_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_enrichments" ADD CONSTRAINT "lead_enrichments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_qualifications" ADD CONSTRAINT "lead_qualifications_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_template_set_id_fkey" FOREIGN KEY ("template_set_id") REFERENCES "email_template_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

