import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  refreshSubscriptionStatusFromShopify,
  clearStoredShopAuth,
  syncBillingMetafield,
} from "../utils/billing.server";
import {
  isShopifyAuthError,
  syncShopFromShopify,
} from "../utils/billing-state.server";

const SUBSCRIPTION_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function isCurrentAccessActive(shop) {
  const now = new Date();

  return Boolean(
    shop &&
      !shop.uninstalledAt &&
      (shop.isDevStore ||
        shop.hasActiveSubscription ||
        (shop.trialEndsAt && now < shop.trialEndsAt) ||
        (shop.gracePeriodEndsAt && now < shop.gracePeriodEndsAt)),
  );
}

function shouldRecheckSubscription(shop) {
  if (!shop?.hasActiveSubscription || !shop.lastCheckedAt) {
    return false;
  }

  return (
    Date.now() - shop.lastCheckedAt.getTime() >
    SUBSCRIPTION_RECHECK_INTERVAL_MS
  );
}

/**
 * App Proxy endpoint: /apps/carousel/billing-status
 *
 * Called from the storefront by the billing-gate JS snippet.
 * Returns { active: true/false } so the carousel can decide
 * whether to render.
 *
 * The request is authenticated via Shopify's app proxy HMAC signature.
 */
export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.public.appProxy(request);

    if (!session?.shop) {
      return json({ active: false }, { headers: corsHeaders() });
    }

    let shop = await prisma.shop.findUnique({
      where: { shop: session.shop },
    });

    if (!shop?.accessToken || shop.uninstalledAt) {
      return json({ active: false }, { headers: corsHeaders() });
    }

    const storedSession = {
      shop: session.shop,
      accessToken: shop.accessToken,
    };

    // If a development store has gone live, this flips isDevStore off and
    // starts the 7-day live-store trial before deciding storefront access.
    if (shop.isDevStore) {
      shop = await syncShopFromShopify(storedSession);
    }

    if (shouldRecheckSubscription(shop)) {
      shop = await refreshSubscriptionStatusFromShopify(shop);
    }

    if (isCurrentAccessActive(shop)) {
      syncBillingMetafield(storedSession, shop).catch(() => {});
      return json({ active: true }, { headers: corsHeaders() });
    }

    shop = await refreshSubscriptionStatusFromShopify(shop);

    if (isCurrentAccessActive(shop)) {
      syncBillingMetafield(storedSession, shop).catch(() => {});
      return json({ active: true }, { headers: corsHeaders() });
    }

    syncBillingMetafield(storedSession, shop).catch(() => {});
    return json({ active: false }, { headers: corsHeaders() });
  } catch (error) {
    if (isShopifyAuthError(error)) {
      await clearStoredShopAuth(error.shop);
    }

    console.error("[Proxy] Billing status check error:", error);
    return json({ active: false }, { headers: corsHeaders() });
  }
};

function corsHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
  };
}
