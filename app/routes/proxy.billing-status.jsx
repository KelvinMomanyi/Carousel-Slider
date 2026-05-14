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
  getShopPlanKey,
  getPlanLimits,
} from "../utils/billing-state.server";

const SUBSCRIPTION_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function getAccessLevel(shop) {
  const now = new Date();

  if (!shop || shop.uninstalledAt) {
    return "none";
  }

  if (shop.isDevStore) return "dev";
  if (shop.hasActiveSubscription) return "subscribed";
  if (shop.trialEndsAt && now < shop.trialEndsAt) return "trial";
  if (shop.gracePeriodEndsAt && now < shop.gracePeriodEndsAt) return "grace";

  // Free tier — always accessible
  return "free";
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
 * Returns:
 *   { active: true/false, plan: "free"|"pro", limits: {...} }
 *
 * Free-tier blocks are always active. Premium blocks check the plan.
 * The request is authenticated via Shopify's app proxy HMAC signature.
 */
export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.public.appProxy(request);

    if (!session?.shop) {
      return json(
        { active: false, plan: "free", limits: getPlanLimits("free") },
        { headers: corsHeaders() },
      );
    }

    let shop = await prisma.shop.findUnique({
      where: { shop: session.shop },
    });

    if (!shop?.accessToken || shop.uninstalledAt) {
      return json(
        { active: false, plan: "free", limits: getPlanLimits("free") },
        { headers: corsHeaders() },
      );
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

    const accessLevel = getAccessLevel(shop);
    const planKey = getShopPlanKey(shop);
    const limits = getPlanLimits(planKey);

    // For any valid access level, the app is active
    if (accessLevel !== "none") {
      // Determine effective plan tier for storefront rendering
      const effectivePlan =
        accessLevel === "free" ? "free" : "pro";

      syncBillingMetafield(storedSession, shop).catch(() => {});
      return json(
        { active: true, plan: effectivePlan, limits },
        { headers: corsHeaders() },
      );
    }

    // Double-check with Shopify if we think it's inactive
    shop = await refreshSubscriptionStatusFromShopify(shop);
    const recheckAccess = getAccessLevel(shop);
    const recheckPlan = getShopPlanKey(shop);

    if (recheckAccess !== "none") {
      const effectivePlan =
        recheckAccess === "free" ? "free" : "pro";

      syncBillingMetafield(storedSession, shop).catch(() => {});
      return json(
        { active: true, plan: effectivePlan, limits: getPlanLimits(recheckPlan) },
        { headers: corsHeaders() },
      );
    }

    syncBillingMetafield(storedSession, shop).catch(() => {});
    return json(
      { active: false, plan: "free", limits: getPlanLimits("free") },
      { headers: corsHeaders() },
    );
  } catch (error) {
    if (isShopifyAuthError(error)) {
      await clearStoredShopAuth(error.shop);
    }

    console.error("[Proxy] Billing status check error:", error);
    return json(
      { active: false, plan: "free", limits: getPlanLimits("free") },
      { headers: corsHeaders() },
    );
  }
};

function corsHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
  };
}
