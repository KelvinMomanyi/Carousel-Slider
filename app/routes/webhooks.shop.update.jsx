import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  isShopifyAuthError,
  syncShopFromShopify,
} from "../utils/billing-state.server";
import {
  clearStoredShopAuth,
  syncBillingMetafield,
} from "../utils/billing.server";

/**
 * Handles SHOP_UPDATE webhooks. This catches the critical dev-store to
 * live-store transition so billing enforcement starts immediately.
 */
export const action = async ({ request }) => {
  try {
    const { topic, shop, session } = await authenticate.webhook(request);

    if (topic === "SHOP_UPDATE") {
      console.log(`[Webhook] Shop updated for ${shop} - re-syncing plan status`);

      const storedShop = await prisma.shop.findUnique({ where: { shop } });
      const syncSession =
        session ||
        (storedShop?.accessToken
          ? { shop, accessToken: storedShop.accessToken }
          : null);

      if (!syncSession) {
        console.warn(`[Webhook] No access token available to sync ${shop}`);
        return json({ success: true, synced: false });
      }

      const updatedShop = await syncShopFromShopify(syncSession);
      await syncBillingMetafield(syncSession, updatedShop);

      console.log(
        `[Webhook] Shop ${shop} plan sync complete - isDevStore: ${updatedShop.isDevStore}`,
      );
    }

    return json({ success: true });
  } catch (error) {
    if (isShopifyAuthError(error)) {
      await clearStoredShopAuth(error.shop);
      console.warn(
        `[Webhook] Stored access token rejected for ${error.shop}; reauth required`,
      );
      return json({ success: true, synced: false, reauthRequired: true });
    }

    console.error("[Webhook] Shop update error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};
