import prisma from "../db.server";

/**
 * Check if merchant has active billing subscription
 * @param {Object} billing - Billing object from authenticate.admin()
 * @param {Array<string>} planNames - Plan names to check (defaults to both PRO plans)
 * @returns {Promise<Object>} - { hasActivePayment, appSubscriptions }
 */
export async function requireBilling(billing, planNames = ["PRO Monthly", "PRO Annual"]) {
    const { hasActivePayment, appSubscriptions } = await billing.check({
        plans: planNames,
        isTest: false, // Production mode
    });

    return { hasActivePayment, appSubscriptions };
}

/**
 * Get subscription status for a shop from database
 * @param {string} shopDomain - Shop domain
 * @returns {Promise<Object|null>} - Shop record or null
 */
export async function getBillingStatus(shopDomain) {
    const shop = await prisma.shop.findUnique({
        where: { shopDomain },
    });

    return shop;
}

/**
 * Update subscription status in database
 * @param {string} shopDomain - Shop domain
 * @param {Object} data - Data to update
 */
export async function updateSubscriptionStatus(shopDomain, data) {
    await prisma.shop.update({
        where: { shopDomain },
        data,
    });
}

/**
 * Check if shop is in trial period
 * @param {Object} shop - Shop record from database
 * @returns {boolean} - True if in trial
 */
export function isInTrial(shop) {
    if (!shop || !shop.trialEndsAt) return false;

    const now = new Date();
    return now < shop.trialEndsAt && shop.subscriptionStatus === "NONE";
}

/**
 * Get days remaining in trial
 * @param {Object} shop - Shop record from database
 * @returns {number} - Days remaining (0 if trial expired)
 */
export function getTrialDaysRemaining(shop) {
    if (!shop || !shop.trialEndsAt) return 0;

    const now = new Date();
    const daysRemaining = Math.ceil((shop.trialEndsAt - now) / (1000 * 60 * 60 * 24));

    return Math.max(0, daysRemaining);
}
