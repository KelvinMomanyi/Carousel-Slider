import { authenticate } from "../shopify.server";
import db from "../db.server";
import { markAppUninstalled, syncBillingMetafield } from "../utils/billing.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const updatedShop = await markAppUninstalled(shop);

  // Sync the billing metafield to false so storefront blocks stop rendering
  if (session) {
    await syncBillingMetafield(session, updatedShop).catch(() => {});
  } else if (updatedShop?.accessToken) {
    await syncBillingMetafield(
      { shop, accessToken: updatedShop.accessToken },
      updatedShop,
    ).catch(() => {});
  }

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
