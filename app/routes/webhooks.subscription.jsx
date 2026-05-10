import { authenticate } from "../shopify.server";
import { updateSubscriptionStatus, syncBillingMetafield } from "../utils/billing.server";
import prisma from "../db.server";
import { json } from "@remix-run/node";

export const action = async ({ request }) => {
    try {
        const { topic, shop, payload, session } = await authenticate.webhook(request);

        if (topic === "APP_SUBSCRIPTIONS_UPDATE") {
            const subscription = payload.app_subscription || payload;

            // Update database with new subscription status
            const updatedShop = await updateSubscriptionStatus(shop, subscription);

            console.log(`[Webhook] Subscription updated for ${shop}: ${subscription.status}`);

            // Sync the storefront billing metafield
            if (session) {
                await syncBillingMetafield(session, updatedShop);
            } else {
                // If no session in webhook, fetch from DB and use stored token
                const shopRecord = await prisma.shop.findUnique({ where: { shop } });
                if (shopRecord?.accessToken) {
                    await syncBillingMetafield(
                        { shop, accessToken: shopRecord.accessToken },
                        updatedShop,
                    );
                }
            }
        }

        return json({ success: true });
    } catch (error) {
        console.error("[Webhook] Error:", error);
        return json({ error: error.message }, { status: 500 });
    }
};
