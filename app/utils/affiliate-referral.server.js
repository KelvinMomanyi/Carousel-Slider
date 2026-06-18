import { createCookie } from "@remix-run/node";
import prisma from "../db.server";

const AFFILIATE_REFERRAL_COOKIE = "carousel_affiliate_ref";
const AFFILIATE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const MYSHOPIFY_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const affiliateReferralCookie = createCookie(AFFILIATE_REFERRAL_COOKIE, {
  httpOnly: true,
  maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
});

export function normalizeAffiliateCode(value) {
  if (typeof value !== "string") return null;

  const code = value.trim().toLowerCase();
  return AFFILIATE_CODE_PATTERN.test(code) ? code : null;
}

export function normalizeShopDomain(value) {
  if (typeof value !== "string") return null;

  let shop = value.trim().toLowerCase();
  if (!shop) return null;

  shop = shop.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  if (!shop.includes(".")) {
    shop = `${shop}.myshopify.com`;
  }

  return MYSHOPIFY_DOMAIN_PATTERN.test(shop) ? shop : null;
}

async function readFormData(request) {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH"].includes(method)) return null;

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return null;
  }

  try {
    return await request.clone().formData();
  } catch (error) {
    console.error("[Affiliate] Failed to read referral form data:", error);
    return null;
  }
}

async function readReferralContext(request) {
  const url = new URL(request.url);
  const formData = await readFormData(request);
  const cookieHeader = request.headers.get("cookie");
  const cookieRef = normalizeAffiliateCode(
    await affiliateReferralCookie.parse(cookieHeader),
  );
  const queryRef = normalizeAffiliateCode(url.searchParams.get("ref"));
  const formRef = normalizeAffiliateCode(formData?.get("ref"));
  const queryShop = normalizeShopDomain(url.searchParams.get("shop"));
  const formShop = normalizeShopDomain(formData?.get("shop"));

  return {
    affiliateCode: queryRef || formRef || cookieRef,
    shop: queryShop || formShop,
    shouldSetCookie: Boolean(queryRef || formRef),
  };
}

async function buildReferralHeaders({ affiliateCode, shouldSetCookie }) {
  const headers = new Headers();

  if (affiliateCode && shouldSetCookie) {
    headers.append(
      "Set-Cookie",
      await affiliateReferralCookie.serialize(affiliateCode),
    );
  }

  return headers;
}

async function recordPendingAffiliateReferral({ affiliateCode, shop }) {
  const existingInstall = await prisma.affiliateReferral.findFirst({
    where: {
      status: "installed",
      OR: [{ shop }, { pendingShop: shop }],
    },
  });

  if (existingInstall) {
    return existingInstall;
  }

  const now = new Date();

  return prisma.affiliateReferral.upsert({
    where: { pendingShop: shop },
    create: {
      affiliateCode,
      pendingShop: shop,
      status: "pending",
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      affiliateCode,
      status: "pending",
      lastSeenAt: now,
    },
  });
}

export async function captureAffiliateReferral(request) {
  const context = await readReferralContext(request);
  const headers = await buildReferralHeaders(context);

  if (!context.affiliateCode || !context.shop) {
    return { ...context, headers };
  }

  try {
    await recordPendingAffiliateReferral({
      affiliateCode: context.affiliateCode,
      shop: context.shop,
    });
  } catch (error) {
    console.error("[Affiliate] Failed to record pending referral:", error);
  }

  return { ...context, headers };
}

export async function recordAffiliateInstall(session) {
  const shop = normalizeShopDomain(session?.shop);
  if (!shop) return null;

  const existingInstall = await prisma.affiliateReferral.findFirst({
    where: {
      shop,
      status: "installed",
    },
  });

  if (existingInstall) {
    return existingInstall;
  }

  const pendingReferral = await prisma.affiliateReferral.findUnique({
    where: { pendingShop: shop },
  });

  if (!pendingReferral) {
    return null;
  }

  return prisma.affiliateReferral.update({
    where: { id: pendingReferral.id },
    data: {
      shop,
      status: "installed",
      installedAt: new Date(),
    },
  });
}
