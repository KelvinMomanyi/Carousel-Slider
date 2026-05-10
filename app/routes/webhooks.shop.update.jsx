import { authenticate } from "../../shopify.server";
import { syncShopFromShopify } from "../../utils/billing-state.server";
import { syncBillingMetafield } from "../../utils/billing.server";
import { json } from "@remix-run/node";

/**
 * Handles SHOP_UPDATE webhook — fired when a store's plan changes.
 * This catches the critical dev-store → live-store transition so we
 * can flip isDevStore to false and begin enforcing billing immediately,
 * rather than waiting for the merchant to open the app admin.
 */
export const action = async ({ request }) => {
  try {
    const { topic, shop, session } = await authenticate.webhook(request);

    if (topic === "SHOP_UPDATE") {
      console.log(`[Webhook] Shop updated for ${shop} — re-syncing plan status`);

      // Re-fetch the shop's Shopify plan and update isDevStore flag
      if (session) {
        const updatedShop = await syncShopFromShopify(session);

        // Sync the storefront metafield so Liquid blocks react immediately
        await syncBillingMetafield(session, updatedShop);

        console.log(
          `[Webhook] Shop ${shop} plan sync complete — isDevStore: ${updatedShop.isDevStore}`
        );
      }
    }

    return json({ success: true });
  } catch (error) {
    console.error("[Webhook] Shop update error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};
