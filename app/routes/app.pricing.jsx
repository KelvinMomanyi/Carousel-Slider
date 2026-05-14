import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  InlineGrid,
  List,
  Badge,
  Divider,
  Banner,
  Box,
} from "@shopify/polaris";
import {
  requireBilling,
  createBillingApproval,
  getBillingConfig,
  hasPremiumFeatureAccess,
} from "../utils/billing.server";

export const loader = async ({ request }) => {
  const context = await requireBilling(request, { allowBillingPage: true });
  const { billing } = context;
  const billingConfig = getBillingConfig();
  const isPro = hasPremiumFeatureAccess(billing);

  return json({
    billing,
    billingConfig,
    isPro,
  });
};

export const action = async ({ request }) => {
  const context = await requireBilling(request, { allowBillingPage: true });

  return createBillingApproval(request, context);
};

function PlanCard({ name, price, interval, features, isCurrent, isPopular, actionLabel, onAction, actionUrl, tone }) {
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingLg">{name}</Text>
          <InlineStack gap="200">
            {isCurrent && <Badge tone="success">Current Plan</Badge>}
            {isPopular && !isCurrent && <Badge tone="attention">Popular</Badge>}
          </InlineStack>
        </InlineStack>

        <InlineStack blockAlign="baseline" gap="100">
          <Text variant="heading2xl" as="p">{price}</Text>
          {interval && (
            <Text variant="bodyMd" tone="subdued">/{interval}</Text>
          )}
        </InlineStack>

        <Divider />

        <List>
          {features.map((feature, i) => (
            <List.Item key={i}>{feature}</List.Item>
          ))}
        </List>

        <Divider />

        {actionUrl ? (
          <Button
            url={actionUrl}
            variant={tone === "primary" ? "primary" : undefined}
            fullWidth
            disabled={isCurrent}
          >
            {isCurrent ? "Current Plan" : actionLabel}
          </Button>
        ) : (
          <Button
            onClick={onAction}
            variant={tone === "primary" ? "primary" : undefined}
            fullWidth
            disabled={isCurrent}
          >
            {isCurrent ? "Current Plan" : actionLabel}
          </Button>
        )}
      </BlockStack>
    </Card>
  );
}

export default function PricingPage() {
  const { billing, billingConfig, isPro } = useLoaderData();
  const submit = useSubmit();

  const handleUpgrade = () => {
    submit({}, { method: "post" });
  };

  const isOnFree = !isPro && billing.access === "free";

  return (
    <Page
      title="Pricing"
      backAction={{ content: "Home", url: "/app" }}
    >
      <BlockStack gap="500">
        {billing.isTrialActive && (
          <Banner title={`Pro Trial — ${billing.trialDaysRemaining} days left`} tone="info">
            <p>
              You have full access to all Pro features during your trial.
              Subscribe before it ends to keep all your carousel layouts working.
            </p>
          </Banner>
        )}

        {billing.isDevStore && (
          <Banner title="Development Store" tone="info">
            <p>Billing is not enforced on development stores. All features are available.</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <PlanCard
                name="Free"
                price="$0"
                interval={null}
                isCurrent={isOnFree}
                isPopular={false}
                features={[
                  "2 carousel layouts",
                  "Up to 6 products per slider",
                  "Auto-sliding & navigation",
                  "Add-to-cart functionality",
                  "Mobile responsive",
                  "Lazy-loaded images",
                  "No code required",
                ]}
                actionLabel="Current Plan"
                actionUrl="/app"
                tone="default"
              />
              <PlanCard
                name="Pro Plan"
                price="$6.99"
                interval="month"
                isCurrent={isPro && billing.access === "subscribed"}
                isPopular={true}
                features={[
                  "All 9 carousel layouts",
                  "Unlimited products per slider",
                  "Theme color scheme integration",
                  "3D & animated transitions",
                  "Custom gradient backgrounds",
                  "Compare-at-price display",
                  "Advanced aspect ratio controls",
                  "Priority email support",
                ]}
                actionLabel={billing.isTrialActive ? "Subscribe Now" : "Upgrade to Pro"}
                onAction={handleUpgrade}
                tone="primary"
              />
            </InlineGrid>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Feature Comparison</Text>
                <Divider />
                <Box padding="200">
                  <BlockStack gap="300">
                    {[
                      { feature: "Carousel Slider (Classic)", free: "✓", pro: "✓" },
                      { feature: "Carousel: Coverflow", free: "✓", pro: "✓" },
                      { feature: "Carousel: Aerphone", free: "—", pro: "✓" },
                      { feature: "Carousel Swift Layout", free: "—", pro: "✓" },
                      { feature: "Carousel: Orbit Ring", free: "—", pro: "✓" },
                      { feature: "Carousel Elegance", free: "—", pro: "✓" },
                      { feature: "Carousel Vanish", free: "—", pro: "✓" },
                      { feature: "Carousel: Card Stack", free: "—", pro: "✓" },
                      { feature: "Carousel: Modern", free: "—", pro: "✓" },
                      { feature: "Products per Slider", free: "6", pro: "Unlimited" },
                      { feature: "Theme Color Integration", free: "Basic", pro: "Full" },
                      { feature: "Gradient Backgrounds", free: "—", pro: "✓" },
                      { feature: "3D Animations", free: "—", pro: "✓" },
                      { feature: "Priority Support", free: "—", pro: "✓" },
                    ].map(({ feature, free, pro }) => (
                      <InlineGrid key={feature} columns={3} gap="400">
                        <Text variant="bodyMd">{feature}</Text>
                        <Text variant="bodyMd" alignment="center" tone={free === "—" ? "subdued" : undefined}>{free}</Text>
                        <Text variant="bodyMd" alignment="center" fontWeight={pro === "✓" ? "semibold" : undefined}>{pro}</Text>
                      </InlineGrid>
                    ))}
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Why Upgrade?</Text>
                <Text variant="bodyMd" tone="subdued">
                  Pro merchants get access to premium carousel layouts designed to increase product visibility,
                  cross-sell effectively, and improve mobile shopping experiences. Every layout is optimized for
                  conversions with built-in add-to-cart, lazy loading, and responsive design.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
