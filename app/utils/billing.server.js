import { redirect } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  BILLING_GRACE_DAYS,
  BILLING_PLAN,
  BILLING_PLANS,
  BILLING_TRIAL_DAYS,
  SHOP_PLAN_API_VERSION,
  createGracePeriodEnd,
  createTrialWindow,
  getShopPlanKey,
  getPlanLimits,
  isShopifyAuthError,
  ShopifyAuthError,
  syncShopFromShopify,
} from "./billing-state.server";

const ACTIVE_SUBSCRIPTION_STATUS = "ACTIVE";
const LONG_LIVED_BILLING_ACCESS_EXPIRES_AT = new Date(
  "2099-12-31T23:59:59.000Z",
);
const DEV_STORE_BILLING_ACCESS_TTL_MS = 60 * 60 * 1000;

function billingPathForRequest(request) {
  const url = new URL(request.url);
  const billingUrl = new URL("/app/pricing", url.origin);

  for (const param of ["shop", "host", "embedded"]) {
    const value = url.searchParams.get(param);
    if (value) {
      billingUrl.searchParams.set(param, value);
    }
  }

  return `${billingUrl.pathname}${billingUrl.search}`;
}

function authLoginPathForRequest(request, shop) {
  const url = new URL(request.url);
  const loginUrl = new URL("/auth/login", url.origin);

  if (shop) {
    loginUrl.searchParams.set("shop", shop);
  }

  const host = url.searchParams.get("host");
  if (host) {
    loginUrl.searchParams.set("host", host);
  }

  return `${loginUrl.pathname}${loginUrl.search}`;
}

export async function clearStoredShopAuth(shop) {
  if (!shop) {
    return;
  }

  await prisma.session.deleteMany({ where: { shop } });
  await prisma.shop.updateMany({
    where: { shop },
    data: { accessToken: null },
  });
}

function billingState(shop, access, extra = {}) {
  const now = new Date();
  const trialDaysRemaining = shop?.trialEndsAt
    ? Math.max(
        0,
        Math.ceil((shop.trialEndsAt.getTime() - now.getTime()) / 86400000),
      )
    : 0;
  const graceDaysRemaining = shop?.gracePeriodEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (shop.gracePeriodEndsAt.getTime() - now.getTime()) / 86400000,
        ),
      )
    : 0;

  const planKey = getShopPlanKey(shop);
  const limits = getPlanLimits(planKey);

  return {
    access,
    shop: shop?.shop || null,
    isDevStore: Boolean(shop?.isDevStore),
    hasActiveSubscription: Boolean(shop?.hasActiveSubscription),
    isTrialActive: access === "trial",
    isGracePeriodActive: access === "grace",
    trialDaysRemaining,
    graceDaysRemaining,
    trialEndsAt: shop?.trialEndsAt || null,
    gracePeriodEndsAt: shop?.gracePeriodEndsAt || null,
    plan: shop?.plan || null,
    currentPlan: planKey,
    limits,
    ...extra,
  };
}

async function getActiveSubscription(admin) {
  const response = await admin.graphql(
    `#graphql
      query CurrentAppInstallationSubscriptions {
        currentAppInstallation {
          activeSubscriptions {
            id
            status
            name
          }
        }
      }`,
  );

  const responseJson = await response.json();

  if (responseJson.errors?.length) {
    throw new Error(
      `Failed to verify Shopify subscriptions: ${responseJson.errors
        .map((error) => error.message)
        .join(", ")}`,
    );
  }

  const subscriptions =
    responseJson.data?.currentAppInstallation?.activeSubscriptions || [];

  return (
    subscriptions.find(
      (subscription) => subscription.status === ACTIVE_SUBSCRIPTION_STATUS,
    ) || null
  );
}

async function getActiveSubscriptionWithToken(session) {
  if (!session?.shop || !session?.accessToken) {
    return null;
  }

  const response = await fetch(
    `https://${session.shop}/admin/api/${SHOP_PLAN_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        query: `#graphql
          query CurrentAppInstallationSubscriptions {
            currentAppInstallation {
              activeSubscriptions {
                id
                status
                name
              }
            }
          }`,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to verify Shopify subscriptions for ${session.shop}: ${response.status} ${response.statusText}`,
    );
  }

  const responseJson = await response.json();

  if (responseJson.errors?.length) {
    throw new Error(
      `Failed to verify Shopify subscriptions: ${responseJson.errors
        .map((error) => error.message)
        .join(", ")}`,
    );
  }

  const subscriptions =
    responseJson.data?.currentAppInstallation?.activeSubscriptions || [];

  return (
    subscriptions.find(
      (subscription) => subscription.status === ACTIVE_SUBSCRIPTION_STATUS,
    ) || null
  );
}

async function markActiveSubscription(shopDomain, subscription) {
  return prisma.shop.update({
    where: { shop: shopDomain },
    data: {
      hasActiveSubscription: true,
      plan: subscription.name,
      subscriptionId: subscription.id,
      currentPlan: "pro",
      lastCheckedAt: new Date(),
    },
  });
}

async function markNoActiveSubscription(shopDomain) {
  return prisma.shop.update({
    where: { shop: shopDomain },
    data: {
      hasActiveSubscription: false,
      plan: null,
      subscriptionId: null,
      currentPlan: "free",
      lastCheckedAt: new Date(),
    },
  });
}

function syncBillingMetafieldLater(session, shop) {
  syncBillingMetafield(session, shop).catch(() => {});
}

function billingContext({ admin, session, shop, access, extra }) {
  syncBillingMetafieldLater(session, shop);

  return {
    admin,
    session,
    billing: billingState(shop, access, extra),
  };
}

async function initializeTrial(shop) {
  const trialWindow = createTrialWindow();

  return prisma.shop.update({
    where: { shop: shop.shop },
    data: trialWindow,
  });
}

async function ensureGracePeriod(shop) {
  if (shop.gracePeriodEndsAt || !shop.trialEndsAt) {
    return shop;
  }

  return prisma.shop.update({
    where: { shop: shop.shop },
    data: {
      gracePeriodEndsAt: createGracePeriodEnd(shop.trialEndsAt),
    },
  });
}

/**
 * Requires billing — but never fully blocks access.
 *
 * Freemium model:
 * - Dev stores → full access (access: "dev")
 * - Active trial → full access (access: "trial")
 * - Grace period → full access with warning (access: "grace")
 * - Active subscription → full Pro access (access: "subscribed")
 * - No subscription after trial/grace → FREE TIER (access: "free")
 *
 * The key change: instead of redirecting to billing on expiry,
 * we degrade to the free plan so the app always works.
 */
export async function requireBilling(request, options = {}) {
  const { admin, session } = await authenticate.admin(request);

  let shop;

  try {
    shop = await syncShopFromShopify(session);
  } catch (error) {
    if (isShopifyAuthError(error)) {
      await clearStoredShopAuth(session.shop);
      throw redirect(authLoginPathForRequest(request, session.shop));
    }

    throw error;
  }

  const now = new Date();

  // Dev stores always get full access
  if (shop.isDevStore) {
    return billingContext({
      admin,
      session,
      shop,
      access: "dev",
    });
  }

  // First visit — start trial
  if (!shop.trialEndsAt) {
    shop = await initializeTrial(shop);

    return billingContext({
      admin,
      session,
      shop,
      access: "trial",
    });
  }

  // Trial still active
  if (now < shop.trialEndsAt) {
    return billingContext({
      admin,
      session,
      shop,
      access: "trial",
    });
  }

  // Trial expired — check grace period
  shop = await ensureGracePeriod(shop);

  if (shop.gracePeriodEndsAt && now < shop.gracePeriodEndsAt) {
    return billingContext({
      admin,
      session,
      shop,
      access: "grace",
      extra: {
        trialExpired: true,
      },
    });
  }

  // Check for active Shopify subscription
  const activeSubscription = await getActiveSubscription(admin);

  if (activeSubscription) {
    shop = await markActiveSubscription(session.shop, activeSubscription);

    return billingContext({
      admin,
      session,
      shop,
      access: "subscribed",
      extra: {
        activeSubscription,
      },
    });
  }

  // No active subscription — DEGRADE TO FREE instead of blocking
  shop = await markNoActiveSubscription(session.shop);
  await syncBillingMetafield(session, shop).catch(() => {});

  return billingContext({
    admin,
    session,
    shop,
    access: "free",
  });
}

export async function createBillingApproval(request, authenticatedContext) {
  const { admin, session } =
    authenticatedContext || (await authenticate.admin(request));
  const billing = authenticatedContext?.billing;

  const requestUrl = new URL(request.url);
  const host = requestUrl.searchParams.get("host");

  if (billing?.isDevStore) {
    const devRedirectUrl = new URL("/app", requestUrl.origin);
    devRedirectUrl.searchParams.set("shop", session.shop);
    if (host) {
      devRedirectUrl.searchParams.set("host", host);
    }
    return redirect(`${devRedirectUrl.pathname}${devRedirectUrl.search}`);
  }

  const baseUrl = process.env.SHOPIFY_APP_URL || requestUrl.origin;
  const returnUrl = new URL("/app", baseUrl);
  const remainingTrialDays = billing?.isTrialActive
    ? Math.max(0, billing.trialDaysRemaining || 0)
    : 0;

  returnUrl.searchParams.set("shop", session.shop);
  if (host) {
    returnUrl.searchParams.set("host", host);
  }

  const response = await admin.graphql(
    `#graphql
      mutation AppSubscriptionCreate(
        $name: String!
        $returnUrl: URL!
        $test: Boolean
        $trialDays: Int
        $lineItems: [AppSubscriptionLineItemInput!]!
      ) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          test: $test
          trialDays: $trialDays
          lineItems: $lineItems
        ) {
          appSubscription {
            id
            status
            name
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        name: BILLING_PLAN.name,
        returnUrl: returnUrl.toString(),
        test: process.env.SHOPIFY_BILLING_TEST === "true",
        trialDays: remainingTrialDays,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: BILLING_PLAN.amount,
                  currencyCode: BILLING_PLAN.currencyCode,
                },
                interval: BILLING_PLAN.interval,
              },
            },
          },
        ],
      },
    },
  );

  const responseJson = await response.json();
  const result = responseJson.data?.appSubscriptionCreate;
  const userErrors = result?.userErrors || [];

  if (responseJson.errors?.length || userErrors.length) {
    const messages = [
      ...(responseJson.errors || []).map((error) => error.message),
      ...userErrors.map((error) => error.message),
    ];

    throw new Response(messages.join(", "), { status: 400 });
  }

  if (!result?.confirmationUrl) {
    throw new Response("Shopify did not return a billing confirmation URL.", {
      status: 502,
    });
  }

  await prisma.shop.update({
    where: { shop: session.shop },
    data: {
      plan: BILLING_PLAN.name,
      currentPlan: "pro",
      lastCheckedAt: new Date(),
    },
  });

  return redirect(result.confirmationUrl);
}

export async function getBillingStatus(shopDomain) {
  return prisma.shop.findUnique({
    where: { shop: shopDomain },
  });
}

export async function refreshSubscriptionStatusFromShopify(shop) {
  if (!shop?.shop || !shop?.accessToken) {
    return shop;
  }

  const activeSubscription = await getActiveSubscriptionWithToken({
    shop: shop.shop,
    accessToken: shop.accessToken,
  });

  if (activeSubscription) {
    return markActiveSubscription(shop.shop, activeSubscription);
  }

  return markNoActiveSubscription(shop.shop);
}

export async function updateSubscriptionStatus(shopDomain, subscription) {
  const status = subscription?.status || "NONE";
  const hasActiveSubscription = status === ACTIVE_SUBSCRIPTION_STATUS;
  const subscriptionName = subscription?.name || null;
  const subscriptionId =
    subscription?.id || subscription?.admin_graphql_api_id || null;
  const now = new Date();

  return prisma.shop.upsert({
    where: { shop: shopDomain },
    create: {
      id: crypto.randomUUID(),
      shop: shopDomain,
      installDate: now,
      hasActiveSubscription,
      plan: hasActiveSubscription ? subscriptionName : null,
      subscriptionId,
      currentPlan: hasActiveSubscription ? "pro" : "free",
      isDevStore: false,
      lastCheckedAt: now,
    },
    update: {
      hasActiveSubscription,
      plan: hasActiveSubscription ? subscriptionName : null,
      subscriptionId,
      currentPlan: hasActiveSubscription ? "pro" : "free",
      lastCheckedAt: now,
    },
  });
}

export async function markAppUninstalled(shopDomain) {
  const now = new Date();

  return prisma.shop.upsert({
    where: { shop: shopDomain },
    create: {
      id: crypto.randomUUID(),
      shop: shopDomain,
      installDate: now,
      hasActiveSubscription: false,
      isDevStore: false,
      currentPlan: "free",
      uninstalledAt: now,
      lastCheckedAt: now,
    },
    update: {
      hasActiveSubscription: false,
      isDevStore: false,
      accessToken: null,
      plan: null,
      subscriptionId: null,
      currentPlan: "free",
      uninstalledAt: now,
      lastCheckedAt: now,
    },
  });
}

export function isInTrial(shop) {
  return Boolean(shop?.trialEndsAt && new Date() < shop.trialEndsAt);
}

export function isInGracePeriod(shop) {
  return Boolean(shop?.gracePeriodEndsAt && new Date() < shop.gracePeriodEndsAt);
}

export function getTrialDaysRemaining(shop) {
  if (!shop?.trialEndsAt) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil((shop.trialEndsAt.getTime() - Date.now()) / 86400000),
  );
}

export function getGraceDaysRemaining(shop) {
  if (!shop?.gracePeriodEndsAt) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil((shop.gracePeriodEndsAt.getTime() - Date.now()) / 86400000),
  );
}

export function getBillingConfig() {
  return {
    plan: BILLING_PLAN,
    plans: BILLING_PLANS,
    trialDays: BILLING_TRIAL_DAYS,
    graceDays: BILLING_GRACE_DAYS,
  };
}

/**
 * Returns true if the merchant has access to premium (Pro) features.
 * Free-tier features are always accessible.
 */
export function hasPremiumFeatureAccess(billing) {
  return Boolean(
    billing?.isDevStore ||
      billing?.hasActiveSubscription ||
      billing?.isTrialActive ||
      billing?.isGracePeriodActive,
  );
}

/**
 * Returns true if the merchant has at least free-tier access (always true
 * for installed apps in the freemium model).
 */
export function hasAnyAccess(billing) {
  return Boolean(billing?.access && billing.access !== "blocked");
}

function getBillingMetafieldSnapshot(shop) {
  const now = new Date();
  const planKey = getShopPlanKey(shop);
  const inactive = {
    isActive: false,
    planTier: "free",
    expiresAt: now,
  };

  if (!shop || shop.uninstalledAt) {
    return inactive;
  }

  // Dev stores
  if (shop.isDevStore) {
    return {
      isActive: true,
      planTier: "pro",
      expiresAt: new Date(now.getTime() + DEV_STORE_BILLING_ACCESS_TTL_MS),
    };
  }

  // Active subscription
  if (shop.hasActiveSubscription) {
    return {
      isActive: true,
      planTier: "pro",
      expiresAt: LONG_LIVED_BILLING_ACCESS_EXPIRES_AT,
    };
  }

  // Trial active
  if (shop.trialEndsAt && now < shop.trialEndsAt) {
    return {
      isActive: true,
      planTier: "pro",
      expiresAt: shop.trialEndsAt,
    };
  }

  // Grace period
  if (shop.gracePeriodEndsAt && now < shop.gracePeriodEndsAt) {
    return {
      isActive: true,
      planTier: "pro",
      expiresAt: shop.gracePeriodEndsAt,
    };
  }

  // Free tier — always active, but limited
  return {
    isActive: true,
    planTier: "free",
    expiresAt: LONG_LIVED_BILLING_ACCESS_EXPIRES_AT,
  };
}

/**
 * Syncs app-data metafields that the storefront Liquid blocks can read
 * through the theme app extension app object.
 *
 * billing.active is paired with billing.expires_at so Liquid can
 * fail closed as soon as a trial or grace period ends, without waiting for
 * another admin visit.
 *
 * billing.plan_tier tells blocks whether to render (free vs pro).
 */
export async function syncBillingMetafield(session, shop) {
  if (!session?.accessToken || !session?.shop || shop?.uninstalledAt) {
    return;
  }

  const { isActive, expiresAt, planTier } = getBillingMetafieldSnapshot(shop);

  try {
    const appInstallationGid = await getAppInstallationGid(session);

    if (!appInstallationGid) {
      console.warn(
        `[Metafield] Skipping billing metafield sync: no current app installation for ${session.shop}`,
      );
      return;
    }

    const result = await shopifyAdminGraphql(session, {
      query: `
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id namespace key value }
            userErrors { field message }
          }
        }
      `,
      variables: {
        metafields: [
          {
            namespace: "billing",
            key: "active",
            ownerId: appInstallationGid,
            type: "boolean",
            value: String(isActive),
          },
          {
            namespace: "billing",
            key: "expires_at",
            ownerId: appInstallationGid,
            type: "date_time",
            value: expiresAt.toISOString(),
          },
          {
            namespace: "billing",
            key: "plan_tier",
            ownerId: appInstallationGid,
            type: "single_line_text_field",
            value: planTier,
          },
        ],
      },
    });

    if (result.metafieldsSet?.userErrors?.length) {
      console.error(
        "[Metafield] Sync errors:",
        result.metafieldsSet.userErrors,
      );
    }
  } catch (error) {
    if (isShopifyAuthError(error)) {
      await clearStoredShopAuth(error.shop || session.shop).catch(
        (clearError) => {
          console.error(
            "[Metafield] Failed to clear rejected shop auth:",
            clearError,
          );
        },
      );

      console.warn(
        `[Metafield] Skipping billing metafield sync: Shopify rejected stored token for ${error.shop || session.shop}`,
      );
      return;
    }

    // Non-fatal - the app proxy JS check is the fallback
    console.error("[Metafield] Failed to sync billing metafield:", error);
  }
}

async function shopifyAdminGraphql(session, { query, variables }) {
  const response = await fetch(
    `https://${session.shop}/admin/api/${SHOP_PLAN_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 401) {
    throw new ShopifyAuthError(
      `Shopify rejected the stored access token for ${session.shop}`,
      { shop: session.shop, status: response.status },
    );
  }

  if (!response.ok) {
    throw new Error(
      `Shopify GraphQL request failed for ${session.shop}: ${response.status} ${response.statusText}${formatGraphqlErrors(payload?.errors)}`,
    );
  }

  if (!payload) {
    throw new Error(
      `Shopify GraphQL request returned invalid JSON for ${session.shop}`,
    );
  }

  if (payload?.errors?.length) {
    throw new Error(
      `Shopify GraphQL errors for ${session.shop}:${formatGraphqlErrors(payload.errors)}`,
    );
  }

  return payload?.data || {};
}

function formatGraphqlErrors(errors) {
  if (!errors?.length) {
    return "";
  }

  return ` ${errors.map((error) => error.message).join(", ")}`;
}

/**
 * Retrieves the app installation ID needed for app-data metafields.
 */
async function getAppInstallationGid(session) {
  const data = await shopifyAdminGraphql(session, {
    query: `
      query CurrentAppInstallation {
        currentAppInstallation {
          id
        }
      }
    `,
  });

  return data.currentAppInstallation?.id || null;
}
