import prisma from "../db.server";

const EVENT_RETENTION_DAYS = 90;

// ---------------------------------------------------------------------------
// Daily aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregates raw CarouselEvent rows for a given date into
 * CarouselDailySummary rows. If summaries already exist for that
 * date they are updated (upsert).
 *
 * Called lazily from the dashboard loader.
 */
export async function aggregateDailySummaries(shop, date) {
  const targetDate = date || yesterday();
  const dayStart = startOfDay(targetDate);
  const dayEnd = endOfDay(targetDate);

  // Check if we already aggregated this day
  const existing = await prisma.carouselDailySummary.findFirst({
    where: { shop, date: dayStart },
  });

  // Only skip if the date is in the past (today's data is always refreshed)
  if (existing && dayStart < startOfDay(new Date())) {
    return;
  }

  // Group raw events by blockName + eventType
  const groups = await prisma.carouselEvent.groupBy({
    by: ["blockName", "eventType"],
    where: {
      shop,
      createdAt: { gte: dayStart, lte: dayEnd },
    },
    _count: { id: true },
  });

  // Pivot into { blockName: { impressions, clicks, addToCarts } }
  const summaryMap = {};
  for (const group of groups) {
    const key = group.blockName;
    if (!summaryMap[key]) {
      summaryMap[key] = { impressions: 0, clicks: 0, addToCarts: 0 };
    }

    const count = group._count.id;
    switch (group.eventType) {
      case "impression":
        summaryMap[key].impressions = count;
        break;
      case "click":
        summaryMap[key].clicks = count;
        break;
      case "add_to_cart":
        summaryMap[key].addToCarts = count;
        break;
    }
  }

  // Upsert summaries
  const upserts = Object.entries(summaryMap).map(([blockName, counts]) =>
    prisma.carouselDailySummary.upsert({
      where: {
        shop_date_blockName: { shop, date: dayStart, blockName },
      },
      create: {
        id: crypto.randomUUID(),
        shop,
        date: dayStart,
        blockName,
        ...counts,
      },
      update: counts,
    }),
  );

  if (upserts.length > 0) {
    await Promise.all(upserts);
  }

  // Opportunistically prune old raw events
  pruneOldEvents(shop).catch(() => {});
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Returns daily summary data for the dashboard.
 * Returns an array of { date, impressions, clicks, addToCarts } objects
 * sorted by date ascending.
 */
export async function getAnalyticsSummary(shop, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const summaries = await prisma.carouselDailySummary.findMany({
    where: {
      shop,
      date: { gte: since },
    },
    orderBy: { date: "asc" },
  });

  // Group by date (aggregate across all blocks)
  const byDate = {};
  for (const row of summaries) {
    const key = row.date.toISOString().slice(0, 10);
    if (!byDate[key]) {
      byDate[key] = { date: key, impressions: 0, clicks: 0, addToCarts: 0 };
    }
    byDate[key].impressions += row.impressions;
    byDate[key].clicks += row.clicks;
    byDate[key].addToCarts += row.addToCarts;
  }

  // Fill in missing days with zeros
  const result = [];
  const cursor = new Date(since);
  const today = new Date();
  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    result.push(
      byDate[key] || { date: key, impressions: 0, clicks: 0, addToCarts: 0 },
    );
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

/**
 * Returns per-block summary for the given period.
 */
export async function getBlockBreakdown(shop, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const summaries = await prisma.carouselDailySummary.findMany({
    where: {
      shop,
      date: { gte: since },
    },
  });

  const byBlock = {};
  for (const row of summaries) {
    if (!byBlock[row.blockName]) {
      byBlock[row.blockName] = {
        blockName: row.blockName,
        impressions: 0,
        clicks: 0,
        addToCarts: 0,
      };
    }
    byBlock[row.blockName].impressions += row.impressions;
    byBlock[row.blockName].clicks += row.clicks;
    byBlock[row.blockName].addToCarts += row.addToCarts;
  }

  return Object.values(byBlock).sort(
    (a, b) => b.impressions - a.impressions,
  );
}

/**
 * Returns the top products by click count.
 */
export async function getTopProducts(shop, days = 30, limit = 5) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const groups = await prisma.carouselEvent.groupBy({
    by: ["productId"],
    where: {
      shop,
      eventType: { in: ["click", "add_to_cart"] },
      productId: { not: null },
      createdAt: { gte: since },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  return groups.map((g) => ({
    productId: g.productId,
    interactions: g._count.id,
  }));
}

/**
 * Returns totals + comparison with previous period for KPI cards.
 */
export async function getAnalyticsTotals(shop, days = 30) {
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - days);
  currentStart.setHours(0, 0, 0, 0);

  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - days);

  const [current, previous] = await Promise.all([
    prisma.carouselDailySummary.aggregate({
      where: { shop, date: { gte: currentStart } },
      _sum: { impressions: true, clicks: true, addToCarts: true },
    }),
    prisma.carouselDailySummary.aggregate({
      where: { shop, date: { gte: previousStart, lt: currentStart } },
      _sum: { impressions: true, clicks: true, addToCarts: true },
    }),
  ]);

  const cur = {
    impressions: current._sum.impressions || 0,
    clicks: current._sum.clicks || 0,
    addToCarts: current._sum.addToCarts || 0,
  };

  const prev = {
    impressions: previous._sum.impressions || 0,
    clicks: previous._sum.clicks || 0,
    addToCarts: previous._sum.addToCarts || 0,
  };

  function pctChange(curr, prv) {
    if (prv === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prv) / prv) * 100);
  }

  return {
    impressions: cur.impressions,
    clicks: cur.clicks,
    addToCarts: cur.addToCarts,
    ctr: cur.impressions > 0
      ? ((cur.clicks / cur.impressions) * 100).toFixed(1)
      : "0.0",
    conversionRate: cur.impressions > 0
      ? ((cur.addToCarts / cur.impressions) * 100).toFixed(1)
      : "0.0",
    changes: {
      impressions: pctChange(cur.impressions, prev.impressions),
      clicks: pctChange(cur.clicks, prev.clicks),
      addToCarts: pctChange(cur.addToCarts, prev.addToCarts),
    },
  };
}

// ---------------------------------------------------------------------------
// Pruning
// ---------------------------------------------------------------------------

export async function pruneOldEvents(shop, retentionDays = EVENT_RETENTION_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  await prisma.carouselEvent.deleteMany({
    where: {
      shop,
      createdAt: { lt: cutoff },
    },
  });
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}
