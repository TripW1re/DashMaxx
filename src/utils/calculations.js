import { SACRAMENTO_ZONES, REVENUE_TIERS, PLATINUM_TARGETS } from './constants';

export const calcTier = (stats) => {
  const p = stats || {};
  const t = PLATINUM_TARGETS;
  if (p.acceptanceRate >= t.ar && p.completionRate >= t.cr && p.customerRating >= t.rating && p.deliveriesThisPeriod >= t.deliveries) return 'platinum';
  if (p.acceptanceRate >= 60 && p.completionRate >= 90 && p.customerRating >= 4.5) return 'gold';
  if (p.acceptanceRate >= 50 && p.completionRate >= 85 && p.customerRating >= 4.2) return 'silver';
  return 'basic';
};

export const calcTierIndex = (tier) => {
  return REVENUE_TIERS.findIndex(t => t.tier === tier);
};

export const calcRevenueShare = (rs, isPro) => {
  const tierIdx = REVENUE_TIERS.findIndex(t => t.tier === rs.tier);
  const currentTier = REVENUE_TIERS[Math.max(0, tierIdx)];
  const systemRevenue = isPro ? 9.99 : 0;
  const estimatedPayout = systemRevenue * (currentTier.share / 100) * (rs.referrals + 1);
  return { currentTier, estimatedPayout, systemRevenue, tierIdx };
};

export const calcKpiScores = (shifts, posts, meetupsAttended, isPro, daysLeft, tier) => {
  const totalShifts = shifts.length;
  const growthScore = Math.min(100, 10 + totalShifts * 2);
  const revenueScore = isPro ? 85 : 30 + Math.min(55, totalShifts * 3);
  const engagementScore = Math.min(100, totalShifts > 0 ? 40 + totalShifts * 2 : 10);
  const communityScore = Math.min(100, 20 + posts.length * 5 + meetupsAttended * 8);
  const retentionScore = Math.min(100, isPro ? 85 : daysLeft > 7 ? 70 : 40);
  const platRate = tier === 'platinum' ? 90 : tier === 'gold' ? 70 : tier === 'silver' ? 50 : 20;
  const platformHealth = Math.round(growthScore * 0.25 + revenueScore * 0.20 + engagementScore * 0.20 + communityScore * 0.15 + retentionScore * 0.10 + platRate * 0.10);
  const projectedUsers = 100 + totalShifts * 3;
  const acquisitionValue = Math.round(projectedUsers * 65);
  const yourShare = isPro ? Math.round(acquisitionValue * 0.01) : Math.round(acquisitionValue * 0.001);
  return { growthScore, revenueScore, engagementScore, communityScore, retentionScore, platRate, platformHealth, projectedUsers, acquisitionValue, yourShare };
};

export const calcZoneHeat = (zones, shifts) => {
  return zones.map(zone => {
    const zoneShifts = shifts.filter(s => s.zone === zone.id);
    const totalEarnings = zoneShifts.reduce((s, sh) => s + (sh.earnings || 0), 0);
    const totalHours = zoneShifts.reduce((s, sh) => s + (sh.hours || 0), 0);
    const avgRate = totalHours > 0 ? totalEarnings / totalHours : 0;
    const maxEarnings = Math.max(...zones.map(z => {
      const zs = shifts.filter(s => s.zone === z.id);
      return zs.reduce((s, sh) => s + (sh.earnings || 0), 0);
    }), 1);
    const intensity = maxEarnings > 0 ? totalEarnings / maxEarnings : 0;
    return { ...zone, totalEarnings, totalHours, avgRate, intensity };
  });
};

export const predictHotZones = (shifts, dayOfWeek, hour) => {
  const zoneScores = {};
  shifts.forEach(s => {
    if (!zoneScores[s.zone]) zoneScores[s.zone] = { earnings: 0, count: 0, hours: 0 };
    zoneScores[s.zone].earnings += s.earnings || 0;
    zoneScores[s.zone].count += 1;
    zoneScores[s.zone].hours += s.hours || 0;
  });

  const scored = Object.entries(zoneScores).map(([zoneId, data]) => {
    const avgRate = data.hours > 0 ? data.earnings / data.hours : 0;
    const frequency = data.count;
    const zone = SACRAMENTO_ZONES.find(z => z.id === zoneId);
    return { zoneId, zoneName: zone?.name || zoneId, avgRate, frequency, peakPay: zone?.peakPay || 0, totalEarnings: data.earnings };
  });

  scored.sort((a, b) => (b.avgRate + b.peakPay) - (a.avgRate + a.peakPay));
  return scored.slice(0, 5);
};
