import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

    const shop = await prisma.shop.findUnique({
      where: { shop: session.shop },
    });

    if (!shop) {
      return json({ active: false }, { headers: corsHeaders() });
    }

    // Dev stores always have access (billing not enforced by Shopify)
    if (shop.isDevStore) {
      return json({ active: true }, { headers: corsHeaders() });
    }

    // Active subscription = full access
    if (shop.hasActiveSubscription) {
      return json({ active: true }, { headers: corsHeaders() });
    }

    // In-trial = access
    if (shop.trialEndsAt && new Date() < shop.trialEndsAt) {
      return json({ active: true }, { headers: corsHeaders() });
    }

    // In grace period = access
    if (shop.gracePeriodEndsAt && new Date() < shop.gracePeriodEndsAt) {
      return json({ active: true }, { headers: corsHeaders() });
    }

    // No active billing, trial, or grace period
    return json({ active: false }, { headers: corsHeaders() });
  } catch (error) {
    console.error("[Proxy] Billing status check error:", error);
    // Fail open — don't break the storefront for paying merchants
    // if there's an unexpected auth error
    return json({ active: true }, { headers: corsHeaders() });
  }
};

function corsHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
  };
}
