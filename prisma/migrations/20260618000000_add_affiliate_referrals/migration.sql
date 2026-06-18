CREATE TABLE IF NOT EXISTS "AffiliateReferral" (
  "id" TEXT NOT NULL,
  "affiliateCode" TEXT NOT NULL,
  "shop" TEXT,
  "pendingShop" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "installedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateReferral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateReferral_shop_key"
  ON "AffiliateReferral"("shop");

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateReferral_pendingShop_key"
  ON "AffiliateReferral"("pendingShop");

CREATE INDEX IF NOT EXISTS "AffiliateReferral_affiliateCode_idx"
  ON "AffiliateReferral"("affiliateCode");

CREATE INDEX IF NOT EXISTS "AffiliateReferral_status_idx"
  ON "AffiliateReferral"("status");

CREATE INDEX IF NOT EXISTS "AffiliateReferral_installedAt_idx"
  ON "AffiliateReferral"("installedAt");
