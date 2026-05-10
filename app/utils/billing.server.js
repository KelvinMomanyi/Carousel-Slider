import { redirect } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  BILLING_GRACE_DAYS,
  BILLING_PLAN,
  BILLING_TRIAL_DAYS,
  createGracePeriodEnd,
  createTrialWindow,
  syncShopFromShopify,
} from "./billing-state.server";

const ACTIVE_SUBSCRIPTION_STATUS = "ACTIVE";

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

  let shop = await syncShopFromShopify(session);
  const now = new Date();

  // Sync the billing metafield on every admin visit so the storefront
  // Liquid blocks always reflect the latest billing state
  syncBillingMetafield(session, shop).catch(() => {});

  if (shop.isDevStore) {
    return {
      admin,
      session,
      billing: billingState(shop, "dev"),
    };
  }

  if (!shop.trialEndsAt) {
    shop = await initializeTrial(shop);

    return {
      admin,
      session,
      billing: billingState(shop, "trial"),
    };
  }

  if (now < shop.trialEndsAt) {
    return {
      admin,
      session,
      billing: billingState(shop, "trial"),
    };
  }

  shop = await ensureGracePeriod(shop);

  if (shop.gracePeriodEndsAt && now < shop.gracePeriodEndsAt) {
    return {
      admin,
      session,
      billing: billingState(shop, "grace", {
        trialExpired: true,
      }),
    };
  }

  const activeSubscription = await getActiveSubscription(admin);

  if (activeSubscription) {
    shop = await markActiveSubscription(session.shop, activeSubscription);

    return {
      admin,
      session,
      billing: billingState(shop, "subscribed", {
        activeSubscription,
      }),
    };
  }

  shop = await markNoActiveSubscription(session.shop);

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
  const requestUrl = new URL(request.url);
  const baseUrl = process.env.SHOPIFY_APP_URL || requestUrl.origin;
  const returnUrl = new URL("/app", baseUrl);
  const host = requestUrl.searchParams.get("host");

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
        trialDays: 0,
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

/**
 * Syncs a shop-level metafield that the storefront Liquid blocks can read
 * to gate carousel rendering based on billing status.
 *
 * The metafield is set to "true" if the shop has active billing (subscription,
 * trial, grace period, or dev store) and "false" otherwise.
 */
export async function syncBillingMetafield(session, shop) {
  if (!session?.accessToken || !session?.shop) {
    return;
  }

  const isActive = Boolean(
    shop?.isDevStore ||
      shop?.hasActiveSubscription ||
      (shop?.trialEndsAt && new Date() < shop.trialEndsAt) ||
      (shop?.gracePeriodEndsAt && new Date() < shop.gracePeriodEndsAt),
  );

  try {
    const response = await fetch(
      `https://${session.shop}/admin/api/2025-04/graphql.json`,
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
                namespace: "app--carousel-slider",
                key: "billing_active",
                ownerId: `gid://shopify/Shop/${await getShopGid(session)}`,
                type: "boolean",
                value: String(isActive),
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
 * Retrieves the numeric shop ID needed for the metafield ownerId.
 */
async function getShopGid(session) {
  try {
    const response = await fetch(
      `https://${session.shop}/admin/api/2025-04/shop.json`,
      {
        headers: {
          "X-Shopify-Access-Token": session.accessToken,
          Accept: "application/json",
        },
      },
    );

    const data = await response.json();
    return data.shop?.id;
  } catch {
    return null;
  }
}
