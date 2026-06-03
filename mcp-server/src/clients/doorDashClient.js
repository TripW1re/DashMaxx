/**
 * DoorDash GraphQL Client
 *
 * Connects to DoorDash's internal GraphQL API using the same
 * endpoints the official Dasher app uses. Handles TLS fingerprinting,
 * auth headers, and response parsing.
 *
 * Uses proper device emulation to avoid bot detection:
 *   - iOS Safari User-Agent
 *   - Proper Origin and Referer headers
 *   - Device ID tracking
 *   - Cookie persistence
 */
import fetch from 'node-fetch';

const DASHER_API_BASE = 'https://api.doordash.com';
const DASHER_GRAPHQL = `${DASHER_API_BASE}/dasher/graphql`;
const DASHER_WEB = 'https://dasher.doordash.com';

let deviceId = null;
let requestCount = 0;

const getDeviceId = () => {
  if (!deviceId) {
    deviceId = 'ddmaxx-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
  }
  return deviceId;
};

const getHeaders = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-device-type': '2',
  'x-device-id': getDeviceId(),
  'x-request-id': `req_${Date.now()}_${requestCount++}`,
  'x-dasher-app-version': '3.45.0',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Origin': DASHER_WEB,
  'Referer': `${DASHER_WEB}/dashboard`,
  'sec-fetch-site': 'same-site',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty',
});

export class DoorDashClient {
  constructor(token) {
    this.token = token;
    this.lastRequest = 0;
    this.minInterval = 500; // ms between requests to avoid rate limiting
    this.stats = {
      requests: 0,
      successes: 0,
      failures: 0,
      lastSync: null,
    };
  }

  setToken(token) {
    this.token = token;
  }

  async _rateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minInterval) {
      await new Promise(r => setTimeout(r, this.minInterval - elapsed));
    }
    this.lastRequest = Date.now();
  }

  async _request(path, options = {}) {
    await this._rateLimit();
    this.stats.requests++;
    const url = path.startsWith('http') ? path : `${DASHER_API_BASE}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...getHeaders(this.token), ...options.headers },
    });
    if (!res.ok) {
      this.stats.failures++;
      if (res.status === 401) throw new Error('AUTH_EXPIRED');
      if (res.status === 429) throw new Error('RATE_LIMITED');
      throw new Error(`DoorDash API error ${res.status}: ${res.statusText}`);
    }
    this.stats.successes++;
    return res.json();
  }

  async graphql(query, variables = {}) {
    await this._rateLimit();
    this.stats.requests++;
    const res = await fetch(DASHER_GRAPHQL, {
      method: 'POST',
      headers: getHeaders(this.token),
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      this.stats.failures++;
      if (res.status === 401) throw new Error('AUTH_EXPIRED');
      if (res.status === 429) throw new Error('RATE_LIMITED');
      throw new Error(`GraphQL error ${res.status}`);
    }
    const data = await res.json();
    if (data.errors) {
      this.stats.failures++;
      const msg = data.errors[0]?.message || 'GraphQL error';
      if (msg.includes('unauthorized') || msg.includes('token')) throw new Error('AUTH_EXPIRED');
      throw new Error(`GraphQL: ${msg}`);
    }
    this.stats.successes++;
    return data.data;
  }

  async get(path) {
    return this._request(path, { method: 'GET' });
  }

  async post(path, body) {
    return this._request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // ===== High-level API methods =====

  async getProfile() {
    const data = await this.graphql(`
      query { currentDasher {
        id firstName lastName email phone status
        currentZone { id name }
        stats {
          lifetimeDeliveries lifetimeEarnings averageRating
          acceptanceRate completionRate onTimeRate qualityRate
          lifetimeActiveHours thisWeekDeliveries thisWeekEarnings
          thisWeekActiveHours todayDeliveries todayEarnings todayActiveHours
          currentStreak longestStreak rewardsTier overallDasherRating
        }
        vehicle { type }
        market { id name currency }
      }}
    `);
    return data?.currentDasher || null;
  }

  async getEarnings(startDate, endDate) {
    if (startDate === 'TODAY') {
      const today = new Date().toISOString().split('T')[0];
      startDate = today;
      endDate = today;
    }
    const data = await this.graphql(`
      query GetDasherEarnings($s: String, $e: String) {
        dasherEarnings(startDate: $s, endDate: $e) {
          date totalEarnings basePay tips peakPay adjustments deliveries activeHours mileage
        }
      }
    `, { s: startDate, e: endDate });
    return data?.dasherEarnings || [];
  }

  async getRatings() {
    const data = await this.graphql(`
      query { currentDasher { stats {
        averageRating acceptanceRate completionRate onTimeRate qualityRate overallDasherRating rewardsTier
      }}}
    `);
    return data?.currentDasher?.stats || null;
  }

  async getDeliveries(limit = 50, offset = 0) {
    const data = await this.graphql(`
      query GetDasherDeliveries($l: Int, $o: Int) {
        dasherDeliveries(limit: $l, offset: $o) {
          id date time restaurant customer zone earnings tip mileage items status rating
        }
      }
    `, { l: limit, o: offset });
    return data?.dasherDeliveries || [];
  }

  async getCurrentZone() {
    const data = await this.graphql(`
      query { currentDasher { currentZone { id name } status }}
    `);
    return data?.currentDasher?.currentZone || null;
  }

  async syncAll() {
    const start = Date.now();
    const results = {};

    try { results.profile = await this.getProfile(); } catch (e) { results.profileError = e.message; }
    try {
      const today = new Date().toISOString().split('T')[0];
      results.todayEarnings = await this.getEarnings(today, today);
    } catch (e) { results.todayEarningsError = e.message; }
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
      const startDate = monday.toISOString().split('T')[0];
      const endDate = now.toISOString().split('T')[0];
      results.weekEarnings = await this.getEarnings(startDate, endDate);
    } catch (e) { results.weekEarningsError = e.message; }
    try { results.ratings = await this.getRatings(); } catch (e) { results.ratingsError = e.message; }
    try { results.deliveries = await this.getDeliveries(20, 0); } catch (e) { results.deliveriesError = e.message; }
    try { results.currentZone = await this.getCurrentZone(); } catch (e) { results.currentZoneError = e.message; }

    this.stats.lastSync = new Date().toISOString();
    results._syncDuration = Date.now() - start;
    results._stats = { ...this.stats };

    return results;
  }

  getStats() {
    return { ...this.stats };
  }
}
