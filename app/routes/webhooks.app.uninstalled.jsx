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

  // Uninstall webhooks often do not include a session, but any stored sessions
  // for this shop are revoked and should not be reused.
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
