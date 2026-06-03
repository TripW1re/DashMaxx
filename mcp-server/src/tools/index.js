/**
 * MCP Tool: sync_profile
 *
 * Fetches the dasher's profile, current stats, and zone from
 * DoorDash's live API. Returns all data in DashMaxx normalized format.
 *
 * Output: DasherProfile
 */
export async function syncProfile(client, cache, uid) {
  const fetchFn = async () => {
    const start = Date.now();
    const result = {};

    try {
      const profile = await client.getProfile();
      const ratings = await client.getRatings();

      if (!profile && !ratings) {
        return { success: false, error: 'No data returned from DoorDash' };
      }

      const stats = profile?.stats || ratings || {};

      result.profile = {
        id: profile?.id,
        name: profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : null,
        email: profile?.email,
        phone: profile?.phone,
        status: profile?.status,
        zone: profile?.currentZone?.name || null,
        zoneId: profile?.currentZone?.id || null,
        vehicle: profile?.vehicle?.type || null,
        market: profile?.market?.name || null,
        rewardsTier: stats.rewardsTier || null,
      };

      result.platinum = {
        acceptanceRate: stats.acceptanceRate ?? null,
        completionRate: stats.completionRate ?? null,
        customerRating: stats.averageRating ?? null,
        onTimeRate: stats.onTimeRate ?? null,
        qualityRate: stats.qualityRate ?? null,
        overallDasherRating: stats.overallDasherRating ?? null,
        lifetimeDeliveries: stats.lifetimeDeliveries ?? null,
        lifetimeEarnings: stats.lifetimeEarnings ?? null,
        lifetimeHours: stats.lifetimeActiveHours ?? null,
        thisWeekDeliveries: stats.thisWeekDeliveries ?? null,
        thisWeekEarnings: stats.thisWeekEarnings ?? null,
        todayDeliveries: stats.todayDeliveries ?? null,
        todayEarnings: stats.todayEarnings ?? null,
        todayHours: stats.todayActiveHours ?? null,
        currentStreak: stats.currentStreak ?? null,
        longestStreak: stats.longestStreak ?? null,
      };

      result._duration = Date.now() - start;
      result.success = true;
    } catch (e) {
      if (e.message === 'AUTH_EXPIRED') {
        return { success: false, error: 'AUTH_EXPIRED', message: 'DoorDash token expired — reconnect' };
      }
      return { success: false, error: e.message };
    }

    return result;
  };

  const data = await cache.getOrFetch(uid, 'profile', fetchFn, 2);
  return data;
}

/**
 * MCP Tool: sync_earnings
 *
 * Fetches daily earnings for a date range. Defaults to current week.
 *
 * Input: { startDate?, endDate? }
 * Output: EarningsDay[]
 */
export async function syncEarnings(client, cache, uid, { startDate, endDate } = {}) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const s = startDate || monday.toISOString().split('T')[0];
  const e = endDate || now.toISOString().split('T')[0];

  const fetchFn = async () => {
    const raw = await client.getEarnings(s, e);
    return {
      days: cache.normalizeEarnings(raw),
      startDate: s,
      endDate: e,
      count: Array.isArray(raw) ? raw.length : 0,
      success: true,
    };
  };

  const data = await cache.getOrFetch(uid, `earnings_${s}_${e}`, fetchFn, 5);
  return data;
}

/**
 * MCP Tool: sync_today
 *
 * Quick fetch of today's stats only.
 *
 * Output: TodayStats
 */
export async function syncToday(client, cache, uid) {
  const fetchFn = async () => {
    const today = new Date().toISOString().split('T')[0];
    const profile = await client.getProfile();
    const earnings = await client.getEarnings(today, today);
    const ratings = await client.getRatings();
    const stats = profile?.stats || ratings || {};

    return {
      date: today,
      earnings: earnings[0]?.totalEarnings || stats.todayEarnings || 0,
      deliveries: earnings[0]?.deliveries || stats.todayDeliveries || 0,
      hours: earnings[0]?.activeHours || stats.todayActiveHours || 0,
      tips: earnings[0]?.tips || 0,
      basePay: earnings[0]?.basePay || 0,
      peakPay: earnings[0]?.peakPay || 0,
      mileage: earnings[0]?.mileage || 0,
      zone: profile?.currentZone?.name || null,
      status: profile?.status || null,
      success: true,
    };
  };

  return cache.getOrFetch(uid, 'today', fetchFn, 1);
}

/**
 * MCP Tool: sync_deliveries
 *
 * Fetches recent delivery history.
 *
 * Input: { limit?, offset? }
 * Output: Delivery[]
 */
export async function syncDeliveries(client, cache, uid, { limit = 50, offset = 0 } = {}) {
  const fetchFn = async () => {
    const raw = await client.getDeliveries(limit, offset);
    return {
      deliveries: cache.normalizeShifts(raw),
      count: Array.isArray(raw) ? raw.length : 0,
      limit,
      offset,
      success: true,
    };
  };

  const data = await cache.getOrFetch(uid, `deliveries_${limit}_${offset}`, fetchFn, 5);
  return data;
}

/**
 * MCP Tool: sync_all
 *
 * Full sync of all DoorDash data. This is the main sync operation
 * that the mobile app calls to refresh the dashboard.
 *
 * Output: FullSyncResult
 */
export async function syncAll(client, cache, uid) {
  const start = Date.now();
  const results = {};

  try {
    const profileResult = await syncProfile(client, cache, uid);
    results.profile = profileResult;

    if (profileResult.success) {
      const todayDate = new Date().toISOString().split('T')[0];
      const earningsResult = await syncEarnings(client, cache, uid);
      results.earnings = earningsResult;

      const todayResult = await syncToday(client, cache, uid);
      results.today = todayResult;

      const deliveriesResult = await syncDeliveries(client, cache, uid, { limit: 20 });
      results.deliveries = deliveriesResult;
    } else {
      results.error = profileResult.error;
    }

    results._duration = Date.now() - start;
    results.success = !!profileResult.success;
    results.syncedAt = new Date().toISOString();
    results.cache = cache.getStats();

    return results;
  } catch (e) {
    return {
      success: false,
      error: e.message,
      _duration: Date.now() - start,
      syncedAt: new Date().toISOString(),
    };
  }
}

/**
 * MCP Tool: get_sync_stats
 *
 * Returns sync health statistics.
 *
 * Output: SyncStats
 */
export async function getSyncStats(client, cache) {
  const clientStats = client?.getStats() || {};
  const cacheStats = cache?.getStats() || {};
  return {
    api: {
      requests: clientStats.requests || 0,
      successes: clientStats.successes || 0,
      failures: clientStats.failures || 0,
      lastSync: clientStats.lastSync || null,
      successRate: clientStats.requests > 0
        ? ((clientStats.successes / clientStats.requests) * 100).toFixed(1) + '%'
        : '0%',
    },
    cache: cacheStats,
    tokenConfigured: !!client?.token,
    timestamp: new Date().toISOString(),
  };
}

/**
 * MCP Tool: predict_hot_zones
 *
 * AI prediction engine: analyzes historical earnings data
 * to predict which zones will be most profitable right now.
 *
 * Input: { dayOfWeek?, hour? }
 * Output: ZonePrediction[]
 */
export async function predictHotZones(client, cache, uid, { dayOfWeek, hour } = {}) {
  const now = new Date();
  const targetDay = dayOfWeek ?? now.getDay();
  const targetHour = hour ?? now.getHours();

  const fetchFn = async () => {
    // Get last 7 days of earnings for prediction
    const endDate = now.toISOString().split('T')[0];
    const startDate = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
    const rawEarnings = await client.getEarnings(startDate, endDate);

    const earnings = cache.normalizeEarnings(rawEarnings);

    // Build zone performance map from earnings data + deliveries
    let deliveries = [];
    try { deliveries = (await client.getDeliveries(100, 0)) || []; } catch {}

    const zoneMap = {};
    const zoneDeliveries = {};

    deliveries.forEach(d => {
      const zone = d.zone || 'unknown';
      if (!zoneDeliveries[zone]) zoneDeliveries[zone] = { earnings: 0, tips: 0, count: 0 };
      zoneDeliveries[zone].earnings += d.earnings || 0;
      zoneDeliveries[zone].tips += d.tip || 0;
      zoneDeliveries[zone].count += 1;
    });

    // Score each zone
    const zones = Object.entries(zoneDeliveries).map(([name, data]) => {
      const avgPerDelivery = data.count > 0 ? (data.earnings + data.tips) / data.count : 0;
      const frequency = data.count;

      // Peak time bonus (lunch 11-13, dinner 17-20)
      const isPeak = (targetHour >= 11 && targetHour <= 13) || (targetHour >= 17 && targetHour <= 20);
      const peakBonus = isPeak ? 2 : 0;

      // Weekend bonus
      const isWeekend = targetDay === 0 || targetDay === 6;
      const weekendBonus = isWeekend ? 1.5 : 0;

      const score = avgPerDelivery + peakBonus + weekendBonus + (frequency * 0.1);

      return {
        zone: name,
        avgPerDelivery: Math.round(avgPerDelivery * 100) / 100,
        frequency,
        peakBonus,
        weekendBonus,
        score: Math.round(score * 100) / 100,
        deliveries: data.count,
        totalEarnings: Math.round((data.earnings + data.tips) * 100) / 100,
      };
    });

    zones.sort((a, b) => b.score - a.score);

    return {
      zones: zones.slice(0, 10),
      predictedAt: new Date().toISOString(),
      dayOfWeek: targetDay,
      hour: targetHour,
      isPeakTime: (targetHour >= 11 && targetHour <= 13) || (targetHour >= 17 && targetHour <= 20),
      isWeekend: targetDay === 0 || targetDay === 6,
      dataPoints: deliveries.length,
      success: true,
    };
  };

  return cache.getOrFetch(uid, `predict_${targetDay}_${targetHour}`, fetchFn, 30);
}
