import { authenticate } from "../shopify.server";
import db from "../db.server";
import { markAppUninstalled } from "../utils/billing.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await markAppUninstalled(shop);

  // Uninstall webhooks often do not include a session, but any stored sessions
  // for this shop are revoked and should not be reused.
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
