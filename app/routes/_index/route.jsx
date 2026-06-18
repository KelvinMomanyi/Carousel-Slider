import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "../../shopify.server";
import { captureAffiliateReferral } from "../../utils/affiliate-referral.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const referral = await captureAffiliateReferral(request);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`, {
      headers: referral.headers,
    });
  }

  return json(
    { showForm: Boolean(login), affiliateCode: referral.affiliateCode },
    { headers: referral.headers },
  );
};

export default function App() {
  const { showForm, affiliateCode } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Carousel-Slider</h1>
        <p className={styles.text}>
         Showcase your best sellers in style — swipe, shop, and impress.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            {affiliateCode && (
              <input type="hidden" name="ref" value={affiliateCode} />
            )}
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
        <li>
          <strong>One-click Add to Cart</strong>. Makes shopping seamless and fast, improving the user experience and boosting conversions.
        </li>
        <li>
          <strong>Interactive Product Slider</strong>. Showcase your products in a stylish, swipeable carousel that keeps customers engaged.
        </li>
        <li>
          <strong>High-Impact Visuals</strong>. Present your products with large images and smooth transitions to capture attention instantly.
        </li>
        </ul>
      </div>
    </div>
  );
}
