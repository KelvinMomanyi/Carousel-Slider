import { createBillingApproval, requireBilling } from "../utils/billing.server";

export const loader = async ({ request }) => {
  const context = await requireBilling(request, { allowBillingPage: true });

  return createBillingApproval(request, context);
};

export const action = loader;

export default function Billing() {
  return null;
}
