import { useEffect } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
  Image,
  Banner
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { requireBilling, getBillingStatus, isInTrial, getTrialDaysRemaining } from "../utils/billing.server";
import { json } from "@remix-run/node";

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);

  // Check billing status
  const { hasActivePayment, appSubscriptions } = await requireBilling(billing);

  // Get shop data from database
  const shop = await getBillingStatus(session.shop);

  const inTrial = shop ? isInTrial(shop) : false;
  const trialDaysRemaining = shop ? getTrialDaysRemaining(shop) : 0;

  return json({
    hasActivePayment,
    inTrial,
    trialDaysRemaining,
    shop: session.shop,
    subscriptionStatus: shop?.subscriptionStatus || "NONE",
  });
};


export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();
  const product = responseJson.data.productCreate.product;
  const variantId = product.variants.edges[0].node.id;
  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyRemixTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );
  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson.data.productCreate.product,
    variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
  };
};

export default function Index() {
  const fetcher = useFetcher();
  const loaderData = useLoaderData();
  const { hasActivePayment, inTrial, trialDaysRemaining, subscriptionStatus } = loaderData || {};

  const shopify = useAppBridge();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";
  const productId = fetcher.data?.product?.id.replace(
    "gid://shopify/Product/",
    "",
  );

  useEffect(() => {
    if (productId) {
      shopify.toast.show("Product created");
    }
  }, [productId, shopify]);
  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  // Show upgrade prompt if no active payment and not in trial
  if (!hasActivePayment && !inTrial) {
    return (
      <Page>
        <BlockStack gap="500">
          <Banner
            title="Subscription Required"
            status="warning"
          >
            <p>
              Your free trial has ended. Subscribe to continue using the Carousel Slider.
            </p>
            <p>
              <strong>Plans Available:</strong>
            </p>
            <List>
              <List.Item>PRO Monthly - $6.99/month</List.Item>
              <List.Item>PRO Annual - $60/year (Save 28%!)</List.Item>
            </List>
            <p style={{ marginTop: "1rem" }}>
              To subscribe, go to: <strong>Shopify Admin → Settings → Apps and sales channels → Carousel Slider → Billing</strong>
            </p>
          </Banner>

          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">App Features (Subscription Required)</Text>
              <List>
                <List.Item>Beautiful product carousel on any page</List.Item>
                <List.Item>Customizable colors and styling</List.Item>
                <List.Item>Collection-based or all products display</List.Item>
                <List.Item>Responsive design for all devices</List.Item>
                <List.Item>Real-time theme editor preview</List.Item>
              </List>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    );
  }

  return (
    <Page>
      <BlockStack gap="500">
        {/* Trial Banner */}
        {inTrial && (
          <Banner
            title={`Free Trial Active - ${trialDaysRemaining} day${trialDaysRemaining !== 1 ? 's' : ''} remaining`}
            status="info"
          >
            <p>
              You're currently on a 7-day free trial. Enjoy full access to all features!
            </p>
            <p>
              After your trial ends, subscribe to continue using the Carousel Slider for just <strong>$6.99/month</strong> or <strong>$60/year</strong>.
            </p>
          </Banner>
        )}

        {/* Active Subscription Banner */}
        {hasActivePayment && !inTrial && (
          <Banner
            title="PRO Subscription Active"
            status="success"
          >
            <p>Thank you for subscribing! You have full access to all features.</p>
          </Banner>
        )}

        <Layout>
          {/* Main Content */}
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                {/* Welcome Text */}
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Congrats on installing carousel-slider Shopify app 🎉
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Once the extension is installed, you can use it as follows:
                  </Text>
                  <List>
                    <List.Item>
                      <Text as="h3" variant="headingMd">Step 1: Add the Extension to Your Pages</Text>
                      <Text as="p" variant="bodyMd">
                        You can add the extension to any page, such as product pages, collection pages, or the homepage, by clicking the "Add Section" button then navigating to the Apps Menu and selecting the app.
                      </Text>
                    </List.Item>
                    <List.Item>
                      <Text as="h3" variant="headingMd">Step 2: Customize Your Content</Text>
                      <Text as="p" variant="bodyMd">
                        The extension allows you to customize the content displayed, such as adding a custom collection of featured products,but by default the carousel will display all the products in your store.
                        You can also customize the color of the product title, among other customization when you click the app from the theme editor section.
                      </Text>
                    </List.Item>
                    <List.Item>
                      <Text as="h3" variant="headingMd">Step 3: View Changes in Real-Time</Text>
                      <Text as="p" variant="bodyMd">
                        The Theme Editor updates live, so you can preview the changes before saving them.
                      </Text>
                    </List.Item>
                  </List>
                </BlockStack>

                {/* Getting Started Section */}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Get started with the application
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Follow the steps above using the Theme Editor to begin adding and customizing carousels on your store pages.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Help Section */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Need Help?</Text>
                  <List>
                    <Link url="/app/support" removeUnderline>
                      <Button primary>Email Support</Button>
                    </Link>
                  </List>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>


  );
}
