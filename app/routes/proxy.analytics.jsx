import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const ALLOWED_EVENT_TYPES = new Set(["impression", "click", "add_to_cart"]);
const MAX_EVENTS_PER_BATCH = 50;
const MAX_BLOCK_NAME_LENGTH = 64;
const MAX_URL_LENGTH = 512;

// Simple in-memory rate limiter (per shop, per minute)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_EVENTS = 200;

function isRateLimited(shop) {
  const now = Date.now();
  const entry = rateLimitMap.get(shop);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(shop, { windowStart: now, count: 1 });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_EVENTS;
}

function sanitizeString(str, maxLen) {
  if (typeof str !== "string") return null;
  return str.slice(0, maxLen).replace(/[^\w\-\/.:?&#= ]/g, "");
}

function validateEvent(evt) {
  if (!evt || typeof evt !== "object") return null;
  if (!ALLOWED_EVENT_TYPES.has(evt.type)) return null;

  return {
    blockName: sanitizeString(evt.blockName, MAX_BLOCK_NAME_LENGTH) || "unknown",
    eventType: evt.type,
    productId: sanitizeString(evt.productId, 128) || null,
    variantId: sanitizeString(evt.variantId, 128) || null,
    pageUrl: sanitizeString(evt.pageUrl, MAX_URL_LENGTH) || null,
  };
}

/**
 * App Proxy endpoint: POST /apps/carousel/analytics
 *
 * Accepts batched analytics events from the storefront tracking script.
 * Body: { events: [{ type, blockName, productId?, variantId?, pageUrl? }] }
 */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.public.appProxy(request);

    if (!session?.shop) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isRateLimited(session.shop)) {
      return json({ error: "Rate limited" }, { status: 429 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }

    const rawEvents = body?.events;
    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      return json({ error: "No events provided" }, { status: 400 });
    }

    // Validate and sanitize events
    const validEvents = rawEvents
      .slice(0, MAX_EVENTS_PER_BATCH)
      .map(validateEvent)
      .filter(Boolean)
      .map((evt) => ({
        id: crypto.randomUUID(),
        shop: session.shop,
        ...evt,
      }));

    if (validEvents.length === 0) {
      return json({ error: "No valid events" }, { status: 400 });
    }

    // Bulk insert
    await prisma.carouselEvent.createMany({
      data: validEvents,
      skipDuplicates: true,
    });

    return json({ ok: true, count: validEvents.length }, { status: 200 });
  } catch (error) {
    console.error("[Analytics] Event ingestion error:", error);
    return json({ error: "Internal error" }, { status: 500 });
  }
};

// GET requests return 405
export const loader = async () => {
  return json({ error: "Use POST" }, { status: 405 });
};
