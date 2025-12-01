import { authenticate } from "../shopify.server";
import { updateSubscriptionStatus } from "../utils/billing.server";
import { json } from "@remix-run/node";

export const action = async ({ request }) => {
    try {
        const { topic, shop, payload } = await authenticate.webhook(request);

        if (topic === "APP_SUBSCRIPTIONS_UPDATE") {
            const subscription = payload;

            // Update database with new subscription status
            await updateSubscriptionStatus(shop, {
                subscriptionStatus: subscription.status, // ACTIVE, CANCELLED, EXPIRED
                planName: subscription.name,
                billingInterval: subscription.name.includes("Annual") ? "ANNUAL" : "MONTHLY",
                subscriptionId: subscription.id,
            });

            console.log(`[Webhook] Subscription updated for ${shop}: ${subscription.status}`);
        }

        return json({ success: true });
    } catch (error) {
        console.error("[Webhook] Error:", error);
        return json({ error: error.message }, { status: 500 });
    }
};
