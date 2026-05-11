-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('generating', 'draft', 'approved', 'accepted', 'paid', 'deployed', 'failed');

-- CreateTable
CREATE TABLE "proposal_drafts" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'generating',
    "token" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "suggested_tier" TEXT,
    "final_tier" TEXT,
    "price_cents" INTEGER,
    "payment_link_url" TEXT,
    "accepted_name" TEXT,
    "accepted_email" TEXT,
    "accepted_phone" TEXT,
    "accepted_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "deployed_slug" TEXT,
    "deployed_at" TIMESTAMP(3),
    "generation_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proposal_drafts_token_key" ON "proposal_drafts"("token");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_drafts_deployed_slug_key" ON "proposal_drafts"("deployed_slug");

-- CreateIndex
CREATE INDEX "proposal_drafts_lead_id_idx" ON "proposal_drafts"("lead_id");

-- CreateIndex
CREATE INDEX "proposal_drafts_status_idx" ON "proposal_drafts"("status");

-- AddForeignKey
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "proposal_drafts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
