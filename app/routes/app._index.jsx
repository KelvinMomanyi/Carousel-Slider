import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  InlineGrid,
  Icon,
  List,
  Link,
  Banner,
  Badge,
  Divider,
  Box,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  StarIcon,
} from "@shopify/polaris-icons";
import { requireBilling, getBillingConfig, hasPremiumFeatureAccess } from "../utils/billing.server";

export const loader = async ({ request }) => {
  const { session, billing } = await requireBilling(request);

  return json({
    shop: session.shop,
    billing,
    billingConfig: getBillingConfig(),
    isPro: hasPremiumFeatureAccess(billing),
  });
};

// ---------------------------------------------------------------------------
// Slider catalogue — used to show available layouts with free/pro badges
// ---------------------------------------------------------------------------

const SLIDER_CATALOGUE = [
  { name: "Carousel Slider", file: "slider", plan: "free", description: "Classic thumbnail carousel with auto-slide" },
  { name: "Carousel: Coverflow", file: "slide9", plan: "free", description: "3D coverflow card layout" },
  { name: "Carousel: Aerphone", file: "slide2", plan: "pro", description: "Bold product showcase with specs" },
  { name: "Carousel Swift Layout", file: "slide4", plan: "pro", description: "Full-screen cinematic slider" },
  { name: "Carousel: Orbit Ring", file: "slide5", plan: "pro", description: "3D rotating product ring" },
  { name: "Carousel Elegance", file: "slide7", plan: "pro", description: "Color-accented product cards" },
  { name: "Carousel Vanish", file: "slide8", plan: "pro", description: "Split-screen with details panel" },
  { name: "Carousel: Card Stack", file: "slide11", plan: "pro", description: "Auto-play stacked card gallery" },
  { name: "Carousel: Modern", file: "slide12", plan: "pro", description: "Thumbnail slider with gradient accents" },
];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function BillingBanner({ billing, billingConfig }) {
  if (billing.isDevStore) {
    return (
      <Banner title="Development Store" tone="info">
        <p>Full access is enabled while this shop is on a development plan.</p>
      </Banner>
    );
  }

  if (billing.access === "subscribed" || billing.hasActiveSubscription) {
    return (
      <Banner
        title={`${billing.plan || "Pro"} Plan — Active`}
        tone="success"
      >
        <p>You have full access to all 9 carousel layouts and unlimited products.</p>
      </Banner>
    );
  }

  if (billing.isTrialActive) {
    return (
      <Banner
        title={`Pro Trial — ${billing.trialDaysRemaining} day${billing.trialDaysRemaining === 1 ? "" : "s"} remaining`}
        tone="info"
        action={{ content: "View Plans", url: "/app/pricing" }}
      >
        <p>
          You have full Pro access during your {billingConfig.trialDays}-day trial.
          After the trial, you'll keep free access to 2 carousel layouts.
        </p>
      </Banner>
    );
  }

  if (billing.isGracePeriodActive) {
    return (
      <Banner
        title="Trial ended — Grace period active"
        tone="warning"
        action={{ content: "Upgrade to Pro", url: "/app/pricing" }}
      >
        <p>
          Your trial has ended. Upgrade within {billing.graceDaysRemaining} day{billing.graceDaysRemaining === 1 ? "" : "s"} to keep all Pro features,
          or continue with 2 free carousel layouts.
        </p>
      </Banner>
    );
  }

  if (billing.access === "free") {
    return (
      <Banner
        title="Free Plan"
        tone="info"
        action={{ content: "Upgrade to Pro", url: "/app/pricing" }}
      >
        <p>
          You have access to 2 carousel layouts. Upgrade to Pro to unlock all 9 layouts, unlimited products, and priority support.
        </p>
      </Banner>
    );
  }

  return null;
}

function PlanStatusCard({ billing, isPro }) {
  const planName = isPro ? "Pro Plan" : "Free Plan";
  const planTone = isPro ? "success" : "info";

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingMd">Your Plan</Text>
          <Badge tone={planTone}>{planName}</Badge>
        </InlineStack>
        <Divider />
        <InlineGrid columns={2} gap="400">
          <BlockStack gap="100">
            <Text variant="bodyMd" tone="subdued">Carousel Layouts</Text>
            <Text variant="headingLg">{isPro ? "9" : "2"}</Text>
          </BlockStack>
          <BlockStack gap="100">
            <Text variant="bodyMd" tone="subdued">Products per Slider</Text>
            <Text variant="headingLg">{isPro ? "Unlimited" : "6"}</Text>
          </BlockStack>
        </InlineGrid>
        {!isPro && (
          <>
            <Divider />
            <Button url="/app/pricing" variant="primary" fullWidth>
              Upgrade to Pro — $6.99/mo
            </Button>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

function SetupGuide() {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Quick Setup Guide</Text>
        <List type="number">
          <List.Item>
            <BlockStack gap="100">
              <Text as="span" variant="headingSm">Open the Theme Editor</Text>
              <Text as="span" variant="bodyMd" tone="subdued">
                Go to Online Store → Themes → Customize
              </Text>
            </BlockStack>
          </List.Item>
          <List.Item>
            <BlockStack gap="100">
              <Text as="span" variant="headingSm">Add a Carousel Section</Text>
              <Text as="span" variant="bodyMd" tone="subdued">
                Click "Add section" → Apps → Choose a Carousel Slider layout
              </Text>
            </BlockStack>
          </List.Item>
          <List.Item>
            <BlockStack gap="100">
              <Text as="span" variant="headingSm">Select a Collection</Text>
              <Text as="span" variant="bodyMd" tone="subdued">
                Pick the product collection to display in the block settings
              </Text>
            </BlockStack>
          </List.Item>
          <List.Item>
            <BlockStack gap="100">
              <Text as="span" variant="headingSm">Customize & Publish</Text>
              <Text as="span" variant="bodyMd" tone="subdued">
                Adjust colors, sizing, and styling — then hit Save
              </Text>
            </BlockStack>
          </List.Item>
        </List>
      </BlockStack>
    </Card>
  );
}

function SliderCatalogue({ isPro }) {
  const freeSliders = SLIDER_CATALOGUE.filter((s) => s.plan === "free");
  const proSliders = SLIDER_CATALOGUE.filter((s) => s.plan === "pro");

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Available Carousel Layouts</Text>
        <Text variant="bodyMd" tone="subdued">
          Add these from the Theme Editor under Apps → Carousel Slider
        </Text>
        <Divider />

        <Text as="h3" variant="headingSm">
          Included in Free Plan
        </Text>
        <BlockStack gap="200">
          {freeSliders.map((slider) => (
            <InlineStack key={slider.file} align="space-between" blockAlign="center" wrap={false}>
              <BlockStack gap="050">
                <Text variant="bodyMd" fontWeight="semibold">{slider.name}</Text>
                <Text variant="bodySm" tone="subdued">{slider.description}</Text>
              </BlockStack>
              <Badge tone="success">Free</Badge>
            </InlineStack>
          ))}
        </BlockStack>

        <Divider />

        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingSm">
            Pro Plan Layouts
          </Text>
          {!isPro && <Badge tone="attention">Upgrade to unlock</Badge>}
        </InlineStack>
        <BlockStack gap="200">
          {proSliders.map((slider) => (
            <InlineStack key={slider.file} align="space-between" blockAlign="center" wrap={false}>
              <BlockStack gap="050">
                <Text variant="bodyMd" fontWeight="semibold">{slider.name}</Text>
                <Text variant="bodySm" tone="subdued">{slider.description}</Text>
              </BlockStack>
              <Badge tone={isPro ? "success" : "new"}>
                {isPro ? "Active" : "Pro"}
              </Badge>
            </InlineStack>
          ))}
        </BlockStack>

        {!isPro && (
          <>
            <Divider />
            <Button url="/app/pricing" fullWidth>
              Unlock All Layouts
            </Button>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Index() {
  const { billing, billingConfig, isPro, shop } = useLoaderData();

  return (
    <Page title="Carousel Slider">
      <BlockStack gap="500">
        <BillingBanner billing={billing} billingConfig={billingConfig} />

        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <PlanStatusCard billing={billing} isPro={isPro} />
              <SetupGuide />
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <SliderCatalogue isPro={isPro} />

              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Need help?</Text>
                  <Text variant="bodyMd" tone="subdued">
                    We typically respond within a few hours.
                  </Text>
                  <Link url="/app/support" removeUnderline>
                    <Button fullWidth>Contact Support</Button>
                  </Link>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
