import {
  calcTier, calcTierIndex, calcRevenueShare, calcKpiScores, calcZoneHeat, predictHotZones,
} from '../src/utils/calculations';
import { SACRAMENTO_ZONES } from '../src/utils/constants';

describe('calcTier', () => {
  it('returns platinum when all targets are met', () => {
    expect(calcTier({ acceptanceRate: 71, completionRate: 96, customerRating: 4.8, deliveriesThisPeriod: 120 })).toBe('platinum');
  });

  it('returns gold at the intermediate thresholds', () => {
    expect(calcTier({ acceptanceRate: 61, completionRate: 91, customerRating: 4.6, deliveriesThisPeriod: 0 })).toBe('gold');
  });

  it('returns silver at the entry thresholds', () => {
    expect(calcTier({ acceptanceRate: 51, completionRate: 86, customerRating: 4.3, deliveriesThisPeriod: 0 })).toBe('silver');
  });

  it('returns basic below thresholds', () => {
    expect(calcTier({ acceptanceRate: 20, completionRate: 50, customerRating: 3.0, deliveriesThisPeriod: 0 })).toBe('basic');
  });

  it('handles empty input', () => {
    expect(calcTier({})).toBe('basic');
    expect(calcTier()).toBe('basic');
  });
});

describe('calcRevenueShare', () => {
  it('computes payout from tier share', () => {
    const rs = { tier: 'gold', referrals: 2 };
    const out = calcRevenueShare(rs, true);
    expect(out.currentTier.tier).toBe('gold');
    expect(out.systemRevenue).toBeCloseTo(9.99, 1);
    // 30% share × (referrals + 1)
    expect(out.estimatedPayout).toBeCloseTo(9.99 * 0.3 * 3, 1);
  });

  it('falls back to bronze for unknown tiers', () => {
    const out = calcRevenueShare({ tier: 'nonexistent', referrals: 0 }, true);
    expect(out.currentTier.tier).toBe('bronze');
  });

  it('has zero revenue when not pro', () => {
    const out = calcRevenueShare({ tier: 'gold', referrals: 5 }, false);
    expect(out.systemRevenue).toBe(0);
    expect(out.estimatedPayout).toBe(0);
  });
});

describe('calcKpiScores', () => {
  it('clamps all scores to 0-100', () => {
    const out = calcKpiScores([{ earnings: 100 }], [], 0, true, 10, 'platinum');
    [out.growthScore, out.revenueScore, out.engagementScore, out.communityScore, out.retentionScore, out.platRate, out.platformHealth]
      .forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      });
  });

  it('rewards pro users and platinum tier', () => {
    const free = calcKpiScores([], [], 0, false, 5, 'basic');
    const pro = calcKpiScores([], [], 0, true, 5, 'platinum');
    expect(pro.revenueScore).toBeGreaterThan(free.revenueScore);
    expect(pro.platRate).toBeGreaterThan(free.platRate);
  });
});

describe('calcZoneHeat', () => {
  const shifts = [
    { zone: 'downtown', earnings: 100, hours: 4 },
    { zone: 'downtown', earnings: 50, hours: 2 },
    { zone: 'folsom', earnings: 30, hours: 3 },
  ];

  it('aggregates earnings, hours, and rate per zone', () => {
    const out = calcZoneHeat(SACRAMENTO_ZONES, shifts);
    const downtown = out.find(z => z.id === 'downtown');
    const folsom = out.find(z => z.id === 'folsom');
    expect(downtown.totalEarnings).toBe(150);
    expect(downtown.totalHours).toBe(6);
    expect(downtown.avgRate).toBeCloseTo(25, 1);
    expect(folsom.avgRate).toBeCloseTo(10, 1);
  });

  it('keeps zones with no shifts at zero', () => {
    const out = calcZoneHeat(SACRAMENTO_ZONES, []);
    expect(out).toHaveLength(SACRAMENTO_ZONES.length);
    out.forEach(z => expect(z.totalEarnings).toBe(0));
  });
});

describe('predictHotZones', () => {
  const shifts = [
    { zone: 'downtown', earnings: 200, hours: 5 },
    { zone: 'midtown', earnings: 120, hours: 4 },
    { zone: 'folsom', earnings: 30, hours: 2 },
  ];

  it('ranks higher earning zones first', () => {
    const out = predictHotZones(shifts, 5, 18);
    expect(out.length).toBeGreaterThan(0);
    const names = out.map(z => z.zoneId);
    expect(names[0]).toBe('downtown');
    expect(names.indexOf('downtown')).toBeLessThan(names.indexOf('folsom'));
  });

  it('returns at most 5 zones', () => {
    const many = SACRAMENTO_ZONES.map(z => ({ zone: z.id, earnings: z.peakPay * 10, hours: 2 }));
    expect(predictHotZones(many, 5, 18).length).toBeLessThanOrEqual(5);
  });

  it('returns empty list with no data', () => {
    expect(predictHotZones([], 5, 18)).toEqual([]);
  });
});
