DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Shop'
      AND column_name = 'shopDomain'
  ) THEN
    UPDATE "Shop"
    SET "shop" = "shopDomain"
    WHERE "shop" IS NULL AND "shopDomain" IS NOT NULL;

    ALTER TABLE "Shop" ALTER COLUMN "shopDomain" DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Shop'
      AND column_name = 'planName'
  ) THEN
    UPDATE "Shop"
    SET "plan" = "planName"
    WHERE "plan" IS NULL AND "planName" IS NOT NULL;

    ALTER TABLE "Shop" ALTER COLUMN "planName" DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Shop'
      AND column_name = 'subscriptionStatus'
  ) THEN
    UPDATE "Shop"
    SET "hasActiveSubscription" = ("subscriptionStatus" = 'ACTIVE')
    WHERE "subscriptionStatus" IS NOT NULL;

    ALTER TABLE "Shop" ALTER COLUMN "subscriptionStatus" DROP NOT NULL;
  END IF;
END $$;
