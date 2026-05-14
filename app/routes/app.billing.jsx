import { redirect } from "@remix-run/node";

/**
 * /app/billing now redirects to /app/pricing.
 * The actual Shopify billing approval is triggered from the pricing page's
 * action handler (POST /app/pricing).
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const pricingUrl = new URL("/app/pricing", url.origin);

  // Forward query params (shop, host, embedded)
  for (const [key, value] of url.searchParams) {
    pricingUrl.searchParams.set(key, value);
  }

  return redirect(`${pricingUrl.pathname}${pricingUrl.search}`);
};

export const action = loader;

export default function Billing() {
  return null;
}
