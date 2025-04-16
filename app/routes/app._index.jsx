import { useEffect } from "react";
import { useFetcher } from "@remix-run/react";
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
  Image
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
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

  return (
    <Page>
    <BlockStack gap="500">
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
    
  