CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "scope" TEXT,
  "expires" TIMESTAMP(3),
  "accessToken" TEXT NOT NULL,
  "userId" BIGINT,
  "firstName" TEXT,
  "lastName" TEXT,
  "email" TEXT,
  "accountOwner" BOOLEAN NOT NULL DEFAULT false,
  "locale" TEXT,
  "collaborator" BOOLEAN DEFAULT false,
  "emailVerified" BOOLEAN DEFAULT false,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Shop" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "installDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trialEndsAt" TIMESTAMP(3),
  "plan" TEXT,
  "isDevStore" BOOLEAN NOT NULL DEFAULT false,
  "hasActiveSubscription" BOOLEAN NOT NULL DEFAULT false,
  "gracePeriodEndsAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accessToken" TEXT,
  "shopifyPlanName" TEXT,
  "subscriptionId" TEXT,
  "uninstalledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "shop" TEXT;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "installDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "plan" TEXT;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "isDevStore" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "hasActiveSubscription" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "gracePeriodEndsAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "accessToken" TEXT;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "shopifyPlanName" TEXT;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "uninstalledAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Shop' AND column_name = 'shopDomain'
  ) THEN
    UPDATE "Shop"
    SET "shop" = "shopDomain"
    WHERE "shop" IS NULL AND "shopDomain" IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Shop' AND column_name = 'planName'
  ) THEN
    UPDATE "Shop"
    SET "plan" = "planName"
    WHERE "plan" IS NULL AND "planName" IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Shop' AND column_name = 'subscriptionStatus'
  ) THEN
    UPDATE "Shop"
    SET "hasActiveSubscription" = ("subscriptionStatus" = 'ACTIVE')
    WHERE "subscriptionStatus" IS NOT NULL;
  END IF;
END $$;

UPDATE "Shop"
SET "shop" = "id"
WHERE "shop" IS NULL;

UPDATE "Shop"
SET "installDate" = "createdAt"
WHERE "installDate" IS NULL AND "createdAt" IS NOT NULL;

UPDATE "Shop"
SET "installDate" = CURRENT_TIMESTAMP
WHERE "installDate" IS NULL;

UPDATE "Shop"
SET "lastCheckedAt" = CURRENT_TIMESTAMP
WHERE "lastCheckedAt" IS NULL;

UPDATE "Shop"
SET "isDevStore" = false
WHERE "isDevStore" IS NULL;

UPDATE "Shop"
SET "hasActiveSubscription" = false
WHERE "hasActiveSubscription" IS NULL;

UPDATE "Shop"
SET "gracePeriodEndsAt" = "trialEndsAt" + interval '2 days'
WHERE "trialEndsAt" IS NOT NULL AND "gracePeriodEndsAt" IS NULL;

ALTER TABLE "Shop" ALTER COLUMN "shop" SET NOT NULL;
ALTER TABLE "Shop" ALTER COLUMN "installDate" SET NOT NULL;
ALTER TABLE "Shop" ALTER COLUMN "isDevStore" SET NOT NULL;
ALTER TABLE "Shop" ALTER COLUMN "hasActiveSubscription" SET NOT NULL;
ALTER TABLE "Shop" ALTER COLUMN "lastCheckedAt" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Shop_shop_key" ON "Shop"("shop");
