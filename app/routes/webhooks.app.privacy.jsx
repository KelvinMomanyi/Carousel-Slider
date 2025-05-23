import { authenticate } from "../shopify.server";


export const action = async ({ request }) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(
    request
  );

  if (!admin) {
    // The admin context isn't returned if the webhook fired after a shop was uninstalled.
    throw new Response();
  }

  // switch (topic) {
  //   case "PRODUCTS_UPDATE":
  //     console.log("updated");
  //     break;
  //   case "CUSTOMERS_DATA_REQUEST":
  //   case "CUSTOMERS_REDACT":
  //   case "SHOP_REDACT":
  //   default:
  //     throw new Response("Unhandled webhook topic", { status: 404 });
  // }
  switch (topic) {
    case "products/update":
      console.log("updated");
      break;
    case "customers/data_request":
    case "customers/redact":
    case "shop/redact":
      // Handle redaction requests here
      console.log(`Handling redaction topic: ${topic}`);
      break;
    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }
  

  throw new Response();
};