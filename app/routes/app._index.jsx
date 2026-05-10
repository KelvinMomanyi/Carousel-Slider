import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  List,
  Link,
  Banner,
} from "@shopify/polaris";
import { requireBilling, getBillingConfig } from "../utils/billing.server";

export const loader = async ({ request }) => {
  const { session, billing } = await requireBilling(request);

  return json({
    shop: session.shop,
    billing,
    billingConfig: getBillingConfig(),
  });
};

export const action = async ({ request }) => {
  const { admin } = await requireBilling(request);
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

function BillingBanner({ billing, billingConfig }) {
  if (billing.isDevStore) {
    return (
      <Banner title="Development Store Access" tone="info">
        <p>Billing is not enforced while this shop is on a development plan.</p>
      </Banner>
    );
  }

  if (billing.isTrialActive) {
    return (
      <Banner
        title={`Trial ends in ${billing.trialDaysRemaining} day${
          billing.trialDaysRemaining === 1 ? "" : "s"
        }`}
        tone="info"
      >
        <p>
          Your {billingConfig.trialDays}-day trial includes full access to
          Carousel Slider.
        </p>
      </Banner>
    );
  }

  if (billing.isGracePeriodActive) {
    return (
      <Banner
        title="Trial expired"
        tone="warning"
        action={{ content: "Upgrade", url: "/app/billing" }}
      >
        <p>
          Your trial has ended. Upgrade within{" "}
          {billing.graceDaysRemaining} day
          {billing.graceDaysRemaining === 1 ? "" : "s"} to avoid losing access.
        </p>
      </Banner>
    );
  }

  if (billing.hasActiveSubscription) {
    return (
      <Banner
        title={`${billing.plan || "Pro"} subscription active`}
        tone="success"
      >
        <p>You have full access to Carousel Slider.</p>
      </Banner>
    );
  }

  return null;
}

export default function Index() {
  const { billing, billingConfig } = useLoaderData();

  return (
    <Page>
      <BlockStack gap="500">
        <BillingBanner billing={billing} billingConfig={billingConfig} />

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Carousel Slider is installed
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Add the app block from the theme editor to show a product
                    carousel on product pages, collection pages, or the
                    homepage.
                  </Text>
                  <List>
                    <List.Item>
                      <Text as="h3" variant="headingMd">
                        Add the extension
                      </Text>
                      <Text as="p" variant="bodyMd">
                        In the theme editor, click Add section, open Apps, and
                        select Carousel Slider.
                      </Text>
                    </List.Item>
                    <List.Item>
                      <Text as="h3" variant="headingMd">
                        Customize the content
                      </Text>
                      <Text as="p" variant="bodyMd">
                        Choose collections, colors, and carousel styling from
                        the app block settings.
                      </Text>
                    </List.Item>
                    <List.Item>
                      <Text as="h3" variant="headingMd">
                        Preview before publishing
                      </Text>
                      <Text as="p" variant="bodyMd">
                        The theme editor preview updates as you adjust the
                        carousel.
                      </Text>
                    </List.Item>
                  </List>
                </BlockStack>

                {!billing.hasActiveSubscription && !billing.isDevStore && (
                  <Button url="/app/billing" variant="primary">
                    Upgrade to {billingConfig.plan.name}
                  </Button>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Need help?
                </Text>
                <List>
                  <Link url="/app/support" removeUnderline>
                    <Button>Email Support</Button>
                  </Link>
                </List>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
