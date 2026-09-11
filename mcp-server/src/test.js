/**
 * DashMaxx MCP Server test suite (node:test).
 *
 * Run with: npm test  (or `node --test src/test.js`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isValidToken, toBearerToken, sanitizeLimit, sanitizeOffset, isValidDateParam } from './lib/validation.js';
import { TokenManager } from './lib/tokenManager.js';
import { CacheLayer } from './lib/cache.js';
import * as Tools from './tools/index.js';

// ===== Validation helpers =====

test('isValidToken accepts JWT-style tokens', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature-part';
  assert.equal(isValidToken(jwt), true);
});

test('isValidToken accepts DoorDash-style tokens', () => {
  assert.equal(isValidToken('DDV1_abcdefghijklmnopqrstuvwxyz123456789'), true);
});

test('isValidToken strips a Bearer prefix', () => {
  assert.equal(isValidToken('Bearer DDV1_abcdefghijklmnopqrstuvwxyz123456789'), true);
});

test('isValidToken rejects short, empty, and spaced tokens; trims trailing whitespace', () => {
  assert.equal(isValidToken('short'), false);
  assert.equal(isValidToken(''), false);
  assert.equal(isValidToken(null), false);
  assert.equal(isValidToken(undefined), false);
  assert.equal(isValidToken(42), false);
  assert.equal(isValidToken('DDV1_abcdefghijklm nopqrstuvwxyz123456789'), false);
  // Trailing whitespace is trimmed during validation — normalized tokens are accepted
  assert.equal(isValidToken('DDV1_abcdefghijklmnopqrstuvwxyz123456789\n'), true);
});

test('toBearerToken normalizes input', () => {
  assert.equal(toBearerToken('  Bearer abcdefghijklmnopqrstuvwxyz123  '), 'abcdefghijklmnopqrstuvwxyz123');
  assert.equal(toBearerToken(null), '');
});

test('sanitizeLimit clamps bounds and non-numbers', () => {
  assert.equal(sanitizeLimit('25'), 25);
  assert.equal(sanitizeLimit('999999'), 100);
  assert.equal(sanitizeLimit('0'), 50);
  assert.equal(sanitizeLimit('abc'), 50);
  assert.equal(sanitizeLimit(undefined, 20, 50), 20);
});

test('sanitizeOffset rejects negatives', () => {
  assert.equal(sanitizeOffset('10'), 10);
  assert.equal(sanitizeOffset('-5'), 0);
  assert.equal(sanitizeOffset('x'), 0);
});

test('isValidDateParam accepts only valid ISO dates', () => {
  assert.equal(isValidDateParam('2026-06-01'), true);
  assert.equal(isValidDateParam('2026-13-40'), false);
  assert.equal(isValidDateParam('06/01/2026'), false);
  assert.equal(isValidDateParam(''), false);
  assert.equal(isValidDateParam(undefined), false);
});

// ===== TokenManager =====

test('TokenManager initializes from env var', async () => {
  process.env.DD_AUTH_TOKEN = 'DDV1_test_token_value_123456789';
  const tm = new TokenManager();
  const result = await tm.initialize();
  assert.equal(result.token, 'DDV1_test_token_value_123456789');
  assert.equal(result.source, 'env');
  assert.equal(tm.hasToken(), true);
  delete process.env.DD_AUTH_TOKEN;
});

test('TokenManager validates and stores tokens', async () => {
  const tm = new TokenManager();
  tm.setToken('DDV1_stored_token_value_987654321', false); // don't persist to disk in tests
  assert.equal(tm.getToken(), 'DDV1_stored_token_value_987654321');
  assert.equal(tm.source, 'manual');
  tm.clearToken();
  assert.equal(tm.hasToken(), false);
});

// ===== CacheLayer (in-memory mode) =====

test('CacheLayer initializes without Firebase', async () => {
  const cache = new CacheLayer();
  await cache.initialize(null);
  assert.equal(cache.isReady(), true);
  assert.equal(cache.getStats().firestore, false);
});

test('CacheLayer caches and expires entries', async () => {
  const cache = new CacheLayer();
  await cache.initialize(null);
  let calls = 0;
  const fetchFn = async () => { calls++; return { value: calls }; };

  const first = await cache.getOrFetch('uid', 'test', fetchFn, 5);
  assert.equal(first.value, 1);
  const second = await cache.getOrFetch('uid', 'test', fetchFn, 5);
  assert.equal(second.value, 1); // served from cache
  assert.equal(calls, 1);
  assert.ok(cache.getStats().hits >= 1);
});

test('CacheLayer refetches when TTL expires', async () => {
  const cache = new CacheLayer();
  await cache.initialize(null);
  let calls = 0;
  const fetchFn = async () => { calls++; return { value: calls }; };
  await cache.getOrFetch('uid', 'ttl-test', fetchFn, 5);
  // Manually expire the entry
  const key = 'doordash/uid/ttl-test';
  cache.localCache[key].expiresAt = new Date(Date.now() - 1000).toISOString();
  const fresh = await cache.getOrFetch('uid', 'ttl-test', fetchFn, 5);
  assert.equal(fresh.value, 2);
  assert.equal(calls, 2);
});

test('CacheLayer normalizes earnings', () => {
  const cache = new CacheLayer();
  const out = cache.normalizeEarnings([
    { date: '2026-06-01', totalEarnings: 120.5, basePay: 80, tips: 30.5, peakPay: 10, adjustments: 0, deliveries: 9, activeHours: 5, mileage: 42 },
  ]);
  assert.deepEqual(out[0], {
    date: '2026-06-01', earnings: 120.5, basePay: 80, tips: 30.5, peakPay: 10,
    adjustments: 0, deliveries: 9, hours: 5, mileage: 42,
  });
});

test('CacheLayer normalizes deliveries into shifts', () => {
  const cache = new CacheLayer();
  const out = cache.normalizeShifts([
    { id: 'o1', date: '2026-06-01', earnings: 8, tip: 3.5, mileage: 4.2, zone: 'downtown', status: 'complete' },
  ]);
  assert.deepEqual(out[0], {
    date: '2026-06-01', earnings: 11.5, basePay: 8, tips: 3.5, deliveries: 1,
    hours: 0, mileage: 4.2, zone: 'downtown', source: 'doordash', orderId: 'o1', status: 'complete',
  });
});

// ===== Tools with a stubbed DoorDash client =====

const stubClient = (overrides = {}) => ({
  token: 'DDV1_test_token_value_123456789',
  getProfile: async () => ({
    id: 'd1', firstName: 'Test', lastName: 'Dasher', status: 'active',
    currentZone: { id: 'downtown', name: 'Downtown Sac' },
    stats: {
      acceptanceRate: 72, completionRate: 96, averageRating: 4.8,
      lifetimeDeliveries: 120, todayDeliveries: 4, todayEarnings: 52.25,
      todayActiveHours: 2.5,
    },
  }),
  getRatings: async () => ({ acceptanceRate: 72, completionRate: 96, averageRating: 4.8 }),
  getEarnings: async () => [
    { date: '2026-06-11', totalEarnings: 120.5, basePay: 80, tips: 30.5, peakPay: 10, deliveries: 9, activeHours: 5, mileage: 42 },
  ],
  getDeliveries: async () => [
    { id: 'o1', date: '2026-06-11', earnings: 8, tip: 3.5, mileage: 4.2, zone: 'downtown', status: 'complete' },
  ],
  getStats: () => ({ requests: 0, successes: 0, failures: 0 }),
  ...overrides,
});

test('syncToday returns normalized today stats', async () => {
  const cache = new CacheLayer();
  await cache.initialize(null);
  const result = await Tools.syncToday(stubClient(), cache, 'test-uid');
  assert.equal(result.success, true);
  // Today's earnings row (from getEarnings) takes precedence over profile stats
  assert.equal(result.deliveries, 9);
  assert.equal(result.earnings, 120.5);
  assert.equal(result.hours, 5);
  assert.equal(result.tips, 30.5);
  assert.equal(result.basePay, 80);
  assert.equal(result.mileage, 42);
  assert.equal(result.zone, 'Downtown Sac');
  assert.equal(result.status, 'active');
});

test('syncEarnings returns normalized days', async () => {
  const cache = new CacheLayer();
  await cache.initialize(null);
  const result = await Tools.syncEarnings(stubClient(), cache, 'test-uid', { startDate: '2026-06-01', endDate: '2026-06-11' });
  assert.equal(result.success, true);
  assert.equal(result.count, 1);
  assert.equal(result.days[0].earnings, 120.5);
});

test('syncProfile maps platinum stats', async () => {
  const cache = new CacheLayer();
  await cache.initialize(null);
  const result = await Tools.syncProfile(stubClient(), cache, 'test-uid');
  assert.equal(result.success, true);
  assert.equal(result.platinum.acceptanceRate, 72);
  assert.equal(result.platinum.customerRating, 4.8);
  assert.equal(result.profile.name, 'Test Dasher');
});

test('syncProfile surfaces AUTH_EXPIRED from client', async () => {
  const cache = new CacheLayer();
  await cache.initialize(null);
  const client = stubClient({
    getProfile: async () => { const e = new Error('AUTH_EXPIRED'); throw e; },
    getRatings: async () => { const e = new Error('AUTH_EXPIRED'); throw e; },
  });
  const result = await Tools.syncProfile(client, cache, 'test-uid');
  assert.equal(result.success, false);
  assert.equal(result.error, 'AUTH_EXPIRED');
});

test('syncAll aggregates all sub-syncs', async () => {
  const cache = new CacheLayer();
  await cache.initialize(null);
  const result = await Tools.syncAll(stubClient(), cache, 'test-uid');
  assert.equal(result.success, true);
  assert.ok(result.profile.success);
  assert.ok(result.today.success);
  assert.ok(result.earnings.success);
  assert.ok(result.deliveries.success);
  assert.ok(result.syncedAt);
});

test('predictHotZones ranks zones by score', async () => {
  const cache = new CacheLayer();
  await cache.initialize(null);
  const client = stubClient({
    getDeliveries: async () => [
      { id: 'a', earnings: 9, tip: 2, zone: 'downtown' },
      { id: 'b', earnings: 7, tip: 1, zone: 'midtown' },
      { id: 'c', earnings: 5, tip: 0.5, zone: 'folsom' },
    ],
  });
  const result = await Tools.predictHotZones(client, cache, 'test-uid', { dayOfWeek: 5, hour: 18 });
  assert.equal(result.success, true);
  assert.ok(Array.isArray(result.zones));
  assert.equal(result.zones[0].zone, 'downtown');
  assert.equal(result.isPeakTime, true);
  const scores = result.zones.map(z => z.score);
  const sorted = [...scores].sort((a, b) => b - a);
  assert.deepEqual(scores, sorted);
});
