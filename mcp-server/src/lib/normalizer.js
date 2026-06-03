/**
 * DashMaxx Data Normalizer
 *
 * Transforms raw DoorDash API data into DashMaxx internal format.
 * Used by both the MCP server and the mobile app to ensure
 * consistent data shapes.
 */

export function normalizeProfile(profile) {
  if (!profile) return null;
  const stats = profile.stats || {};
  return {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    status: profile.status,
    zone: profile.currentZone?.name || null,
    zoneId: profile.currentZone?.id || null,
    vehicle: profile.vehicle?.type || null,
    market: profile.market?.name || null,
    stats: {
      lifetimeDeliveries: stats.lifetimeDeliveries,
      lifetimeEarnings: stats.lifetimeEarnings,
      averageRating: stats.averageRating,
      acceptanceRate: stats.acceptanceRate,
      completionRate: stats.completionRate,
      onTimeRate: stats.onTimeRate,
      qualityRate: stats.qualityRate,
      rewardsTier: stats.rewardsTier,
      overallDasherRating: stats.overallDasherRating,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
    },
    today: {
      earnings: stats.todayEarnings,
      deliveries: stats.todayDeliveries,
      hours: stats.todayActiveHours,
    },
    thisWeek: {
      earnings: stats.thisWeekEarnings,
      deliveries: stats.thisWeekDeliveries,
      hours: stats.thisWeekActiveHours,
    },
  };
}

export function normalizeEarningsDay(raw) {
  return {
    date: raw.date,
    totalEarnings: raw.totalEarnings || 0,
    basePay: raw.basePay || 0,
    tips: raw.tips || 0,
    peakPay: raw.peakPay || 0,
    adjustments: raw.adjustments || 0,
    deliveries: raw.deliveries || 0,
    activeHours: raw.activeHours || 0,
    mileage: raw.mileage || 0,
  };
}

export function normalizeDelivery(raw) {
  return {
    id: raw.id || raw.orderId,
    date: raw.date,
    time: raw.time,
    restaurant: raw.restaurant,
    zone: raw.zone,
    earnings: (raw.earnings || 0) + (raw.tip || 0),
    basePay: raw.earnings || 0,
    tip: raw.tip || 0,
    mileage: raw.mileage || 0,
    items: raw.items || 0,
    status: raw.status,
    rating: raw.rating,
  };
}

export function toDashMaxxShift(delivery) {
  return {
    date: delivery.date,
    earnings: (delivery.earnings || 0) + (delivery.tip || 0),
    basePay: delivery.earnings || 0,
    tips: delivery.tip || 0,
    deliveries: 1,
    hours: 0,
    mileage: delivery.mileage || 0,
    zone: delivery.zone || 'unknown',
    source: 'doordash',
    orderId: delivery.id || delivery.orderId,
    status: delivery.status,
  };
}

export function calculatePlatinumProgress(platinum) {
  const targets = { ar: 70, cr: 95, rating: 4.7, deliveries: 100 };
  const p = platinum || {};
  return [
    { label: 'Acceptance Rate', current: p.acceptanceRate ?? 0, target: targets.ar, pct: Math.min(100, ((p.acceptanceRate ?? 0) / targets.ar) * 100) },
    { label: 'Completion Rate', current: p.completionRate ?? 0, target: targets.cr, pct: Math.min(100, ((p.completionRate ?? 0) / targets.cr) * 100) },
    { label: 'Customer Rating', current: p.customerRating ?? 0, target: targets.rating, pct: Math.min(100, ((p.customerRating ?? 0) / targets.rating) * 100) },
    { label: 'Deliveries', current: p.lifetimeDeliveries ?? 0, target: targets.deliveries, pct: Math.min(100, ((p.lifetimeDeliveries ?? 0) / targets.deliveries) * 100) },
  ];
}
