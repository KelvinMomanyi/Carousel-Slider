import { redirect } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  BILLING_GRACE_DAYS,
  BILLING_PLAN,
  BILLING_TRIAL_DAYS,
  SHOP_PLAN_API_VERSION,
  createGracePeriodEnd,
  createTrialWindow,
  isShopifyAuthError,
  syncShopFromShopify,
} from "./billing-state.server";

const ACTIVE_SUBSCRIPTION_STATUS = "ACTIVE";
const LONG_LIVED_BILLING_ACCESS_EXPIRES_AT = new Date(
  "2099-12-31T23:59:59.000Z",
);
const DEV_STORE_BILLING_ACCESS_TTL_MS = 60 * 60 * 1000;

function billingPathForRequest(request) {
  const url = new URL(request.url);
  const billingUrl = new URL("/app/billing", url.origin);

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

export async function requireBilling(request, options = {}) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const allowBillingPage =
    options.allowBillingPage && url.pathname === "/app/billing";

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

  if (shop.isDevStore) {
    return billingContext({
      admin,
      session,
      shop,
      access: "dev",
    });
  }

  if (!shop.trialEndsAt) {
    shop = await initializeTrial(shop);

    return billingContext({
      admin,
      session,
      shop,
      access: "trial",
    });
  }

  if (now < shop.trialEndsAt) {
    return billingContext({
      admin,
      session,
      shop,
      access: "trial",
    });
  }

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

  shop = await markNoActiveSubscription(session.shop);
  await syncBillingMetafield(session, shop).catch(() => {});

  if (allowBillingPage) {
    return {
      admin,
      session,
      billing: billingState(shop, "blocked"),
    };
  }

  throw redirect(billingPathForRequest(request));
}

export async function createBillingApproval(request, authenticatedContext) {
  const { admin, session } =
    authenticatedContext || (await authenticate.admin(request));
  const billing = authenticatedContext?.billing;

  if (billing?.isDevStore) {
    return redirect("/app");
  }

  const requestUrl = new URL(request.url);
  const baseUrl = process.env.SHOPIFY_APP_URL || requestUrl.origin;
  const returnUrl = new URL("/app", baseUrl);
  const host = requestUrl.searchParams.get("host");
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
      isDevStore: false,
      lastCheckedAt: now,
    },
    update: {
      hasActiveSubscription,
      plan: hasActiveSubscription ? subscriptionName : null,
      subscriptionId,
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
      uninstalledAt: now,
      lastCheckedAt: now,
    },
    update: {
      hasActiveSubscription: false,
      isDevStore: false,
      accessToken: null,
      plan: null,
      subscriptionId: null,
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
    trialDays: BILLING_TRIAL_DAYS,
    graceDays: BILLING_GRACE_DAYS,
  };
}

export function hasPremiumFeatureAccess(billing) {
  return Boolean(
    billing?.isDevStore ||
      billing?.hasActiveSubscription ||
      billing?.isTrialActive ||
      billing?.isGracePeriodActive,
  );
}

function getBillingMetafieldSnapshot(shop) {
  const now = new Date();
  const inactive = {
    isActive: false,
    expiresAt: now,
  };

  if (!shop || shop.uninstalledAt) {
    return inactive;
  }

  if (shop.isDevStore) {
    return {
      isActive: true,
      expiresAt: new Date(now.getTime() + DEV_STORE_BILLING_ACCESS_TTL_MS),
    };
  }

  if (shop.hasActiveSubscription) {
    return {
      isActive: true,
      expiresAt: LONG_LIVED_BILLING_ACCESS_EXPIRES_AT,
    };
  }

  if (shop.trialEndsAt && now < shop.trialEndsAt) {
    return {
      isActive: true,
      expiresAt: shop.trialEndsAt,
    };
  }

  if (shop.gracePeriodEndsAt && now < shop.gracePeriodEndsAt) {
    return {
      isActive: true,
      expiresAt: shop.gracePeriodEndsAt,
    };
  }

  return inactive;
}

/**
 * Syncs app-data metafields that the storefront Liquid blocks can read
 * through the theme app extension app object.
 *
 * billing.active is paired with billing.expires_at so Liquid can
 * fail closed as soon as a trial or grace period ends, without waiting for
 * another admin visit.
 */
export async function syncBillingMetafield(session, shop) {
  if (!session?.accessToken || !session?.shop) {
    return;
  }

  const { isActive, expiresAt } = getBillingMetafieldSnapshot(shop);

  try {
    const appInstallationGid = await getAppInstallationGid(session);

    if (!appInstallationGid) {
      throw new Error(
        `Could not resolve app installation ID for ${session.shop}`,
      );
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
            ],
          },
        }),
      },
    );

    const result = await response.json();

    if (result.data?.metafieldsSet?.userErrors?.length) {
      console.error(
        "[Metafield] Sync errors:",
        result.data.metafieldsSet.userErrors,
      );
    }
  } catch (error) {
    // Non-fatal — the app proxy JS check is the fallback
    console.error("[Metafield] Failed to sync billing metafield:", error);
  }
}

/**
 * Retrieves the app installation ID needed for app-data metafields.
 */
async function getAppInstallationGid(session) {
  try {
    const response = await fetch(
      `https://${session.shop}/admin/api/${SHOP_PLAN_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({
          query: `
            query CurrentAppInstallation {
              currentAppInstallation {
                id
              }
            }
          `,
        }),
      },
    );

    const data = await response.json();
    return data.data?.currentAppInstallation?.id || null;
  } catch {
    return null;
  }
}
