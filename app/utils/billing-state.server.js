import prisma from "../db.server";

export const BILLING_PLAN = {
  name: "Pro Plan",
  amount: 6.99,
  currencyCode: "USD",
  interval: "EVERY_30_DAYS",
};

export const BILLING_TRIAL_DAYS = 7;
export const BILLING_GRACE_DAYS = 0;
export const SHOP_PLAN_API_VERSION =
  process.env.SHOPIFY_SHOP_PLAN_API_VERSION || "2025-04";

const DEV_STORE_PLAN_NAMES = new Set(["affiliate", "development"]);

export function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function isDevelopmentStorePlan(planName) {
  return DEV_STORE_PLAN_NAMES.has(String(planName || "").toLowerCase());
}

export async function fetchShopInfo(session) {
  if (!session?.shop || !session?.accessToken) {
    throw new Error("Cannot fetch shop info without an authenticated shop session");
  }

  const response = await fetch(
    `https://${session.shop}/admin/api/${SHOP_PLAN_API_VERSION}/shop.json`,
    {
      headers: {
        "X-Shopify-Access-Token": session.accessToken,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Shopify shop info for ${session.shop}: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return data.shop || {};
}

export async function fetchShopPlanName(session) {
  const shopInfo = await fetchShopInfo(session);
  return shopInfo.plan_name || null;
}

function baseShopData({ session, shopifyPlanName, now }) {
  return {
    accessToken: session.accessToken,
    isDevStore: isDevelopmentStorePlan(shopifyPlanName),
    shopifyPlanName,
    lastCheckedAt: now,
    uninstalledAt: null,
  };
}

export async function recordShopInstall(session) {
  const now = new Date();
  const shopifyPlanName = await fetchShopPlanName(session);
  const isDevStore = isDevelopmentStorePlan(shopifyPlanName);

  const shop = await prisma.shop.upsert({
    where: { shop: session.shop },
    create: {
      id: crypto.randomUUID(),
      shop: session.shop,
      installDate: now,
      ...(!isDevStore ? createTrialWindow(now) : {}),
      hasActiveSubscription: false,
      ...baseShopData({ session, shopifyPlanName, now }),
    },
    update: baseShopData({ session, shopifyPlanName, now }),
  });

  return ensureLiveTrialStarted(shop, now);
}

export async function syncShopFromShopify(session) {
  const now = new Date();
  const shopifyPlanName = await fetchShopPlanName(session);
  const data = baseShopData({ session, shopifyPlanName, now });

  try {
    const shop = await prisma.shop.upsert({
      where: { shop: session.shop },
      create: {
        id: crypto.randomUUID(),
        shop: session.shop,
        installDate: now,
        ...(!data.isDevStore ? createTrialWindow(now) : {}),
        hasActiveSubscription: false,
        ...data,
      },
      update: data,
    });

    return ensureLiveTrialStarted(shop, now);
  } catch (error) {
    if (error.code !== "P2002") {
      throw error;
    }

    const shop = await prisma.shop.update({
      where: { shop: session.shop },
      data,
    });

    return ensureLiveTrialStarted(shop, now);
  }
}

export function createTrialWindow(now = new Date()) {
  const trialEndsAt = addDays(now, BILLING_TRIAL_DAYS);

  return {
    trialEndsAt,
    gracePeriodEndsAt: addDays(trialEndsAt, BILLING_GRACE_DAYS),
  };
}

export function createGracePeriodEnd(trialEndsAt) {
  return addDays(trialEndsAt, BILLING_GRACE_DAYS);
}

export async function ensureLiveTrialStarted(shop, now = new Date()) {
  if (!shop || shop.isDevStore || shop.trialEndsAt) {
    return shop;
  }

  return prisma.shop.update({
    where: { shop: shop.shop },
    data: createTrialWindow(now),
  });
}
