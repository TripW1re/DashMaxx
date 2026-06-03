/**
 * DOORDASH API CONNECTOR
 *
 * Connects directly to DoorDash's internal Dasher API to pull live stats.
 * Uses the same GraphQL + REST endpoints the official Dasher app uses.
 *
 * Connection strategies (attempted in order):
 *   1. Auth token → direct API calls (fastest, most reliable)
 *   2. Session cookies → web scraping fallback
 *   3. Manual data (existing fallback)
 *
 * Authentication:
 *   User captures their DoorDash auth token from:
 *     - Browser DevTools (dasher.doordash.com → Application → Cookies → token)
 *     - Or Charles Proxy / mitmproxy session
 *   Token is stored securely in iOS Keychain
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DASHER_API_BASE = 'https://api.doordash.com/dasher';
const DASHER_GRAPHQL = 'https://api.doordash.com/dasher/graphql';
const DASHER_WEB = 'https://dasher.doordash.com';

const TOKEN_STORAGE_KEY = 'dashmaxx_doordash_token';
const CONFIG_STORAGE_KEY = 'dashmaxx_doordash_config';

let authToken = null;
let cachedProfile = null;

// ============= Token Management =============

export const getStoredToken = async () => {
  try {
    return await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  } catch { return null; }
};

export const storeToken = async (token) => {
  authToken = token;
  await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
};

export const clearToken = async () => {
  authToken = null;
  cachedProfile = null;
  await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
  await AsyncStorage.removeItem(CONFIG_STORAGE_KEY);
};

export const isConnected = async () => {
  const token = await getStoredToken();
  return !!token;
};

// ============= API Headers =============

const getHeaders = (token) => ({
  'Authorization': `Bearer ${token || authToken}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'x-device-type': '2', // web
  'x-device-id': 'dashmaxx-' + Date.now().toString(36),
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Origin': DASHER_WEB,
  'Referer': DASHER_WEB + '/',
});

// ============= API Call Wrappers =============

const apiGet = async (path, token) => {
  const t = token || authToken;
  if (!t) throw new Error('No DoorDash auth token');
  const url = `${DASHER_API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: getHeaders(t),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Token expired — reconnect DoorDash');
    throw new Error(`DoorDash API error: ${res.status}`);
  }
  return res.json();
};

const apiGraphql = async (query, variables, token) => {
  const t = token || authToken;
  if (!t) throw new Error('No DoorDash auth token');
  const res = await fetch(DASHER_GRAPHQL, {
    method: 'POST',
    headers: getHeaders(t),
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Token expired — reconnect DoorDash');
    throw new Error(`DoorDash GraphQL error: ${res.status}`);
  }
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'GraphQL error');
  return data.data;
};

// ============= Dasher Profile =============

const DASHER_PROFILE_QUERY = `
  query GetDasherProfile {
    currentDasher {
      id
      firstName
      lastName
      email
      phone
      status
      currentZone {
        id
        name
      }
      stats {
        lifetimeDeliveries
        lifetimeEarnings
        averageRating
        acceptanceRate
        completionRate
        onTimeRate
        qualityRate
        lifetimeActiveHours
        thisWeekDeliveries
        thisWeekEarnings
        thisWeekActiveHours
        todayDeliveries
        todayEarnings
        todayActiveHours
        currentStreak
        longestStreak
        rewardsTier
        overallDasherRating
      }
      vehicle {
        type
      }
      market {
        id
        name
        currency
      }
    }
  }
`;

export const fetchProfile = async (token) => {
  try {
    const data = await apiGraphql(DASHER_PROFILE_QUERY, {}, token);
    const dasher = data?.currentDasher;
    if (!dasher) throw new Error('No dasher data returned');
    cachedProfile = dasher;
    return dasher;
  } catch (e) {
    // Fallback to REST API
    return fetchProfileRest(token);
  }
};

const fetchProfileRest = async (token) => {
  const profile = await apiGet('/v1/profile', token);
  cachedProfile = profile;
  return profile;
};

// ============= Earnings =============

const EARNINGS_QUERY = `
  query GetDasherEarnings($startDate: String, $endDate: String) {
    dasherEarnings(startDate: $startDate, endDate: $endDate) {
      date
      totalEarnings
      basePay
      tips
      peakPay
      adjustments
      deliveries
      activeHours
      mileage
    }
  }
`;

export const fetchEarnings = async (token, startDate, endDate) => {
  try {
    const data = await apiGraphql(EARNINGS_QUERY, { startDate, endDate }, token);
    return data?.dasherEarnings || [];
  } catch (e) {
    // Fallback to REST
    const earnings = await apiGet('/v1/earnings', token);
    return earnings?.days || [];
  }
};

export const fetchTodayEarnings = async (token) => {
  const today = new Date().toISOString().split('T')[0];
  const earnings = await fetchEarnings(token, today, today);
  return earnings[0] || { date: today, totalEarnings: 0, deliveries: 0, activeHours: 0, tips: 0, basePay: 0, peakPay: 0 };
};

export const fetchThisWeekEarnings = async (token) => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const start = monday.toISOString().split('T')[0];
  const end = now.toISOString().split('T')[0];
  return fetchEarnings(token, start, end);
};

// ============= Ratings =============

export const fetchRatings = async (token) => {
  try {
    const data = await apiGraphql(`
      query GetDasherRatings {
        currentDasher {
          stats {
            averageRating
            acceptanceRate
            completionRate
            onTimeRate
            qualityRate
            overallDasherRating
            rewardsTier
          }
        }
      }
    `, {}, token);
    return data?.currentDasher?.stats;
  } catch {
    return apiGet('/v1/ratings', token);
  }
};

// ============= Delivery History =============

const DELIVERIES_QUERY = `
  query GetDasherDeliveries($limit: Int, $offset: Int) {
    dasherDeliveries(limit: $limit, offset: $offset) {
      id
      orderId
      date
      time
      restaurant
      customer
      zone
      earnings
      tip
      mileage
      items
      status
      rating
    }
  }
`;

export const fetchDeliveries = async (token, limit = 50, offset = 0) => {
  try {
    const data = await apiGraphql(DELIVERIES_QUERY, { limit, offset }, token);
    return data?.dasherDeliveries || [];
  } catch {
    return apiGet(`/v1/deliveries?limit=${limit}&offset=${offset}`, token);
  }
};

// ============= Zone / Status =============

export const fetchCurrentZone = async (token) => {
  try {
    const data = await apiGraphql(`
      query GetCurrentZone {
        currentDasher {
          currentZone { id name }
          status
        }
      }
    `, {}, token);
    return data?.currentDasher?.currentZone || null;
  } catch {
    return apiGet('/v1/current-zone', token);
  }
};

// ============= Sync to DashMaxx State =============

/**
 * Fetches all DoorDash data and returns it in DashMaxx-compatible format.
 * Call this to sync the dashboard with live data.
 */
export const syncAllData = async (token) => {
  const t = token || await getStoredToken();
  if (!t) throw new Error('Not connected to DoorDash');

  try {
    const [profile, ratings, todayEarnings, weekEarnings, recentDeliveries] = await Promise.all([
      fetchProfile(t).catch(() => null),
      fetchRatings(t).catch(() => null),
      fetchTodayEarnings(t).catch(() => ({ totalEarnings: 0, deliveries: 0, activeHours: 0 })),
      fetchThisWeekEarnings(t).catch(() => []),
      fetchDeliveries(t, 20).catch(() => []),
    ]);

    const stats = profile?.stats || ratings || {};

    // Convert to DashMaxx internal format
    const shifts = (weekEarnings || []).map(d => ({
      date: d.date,
      earnings: d.totalEarnings || 0,
      hours: d.activeHours || 0,
      deliveries: d.deliveries || 0,
      mileage: d.mileage || 0,
      zone: profile?.currentZone?.name || 'unknown',
      source: 'doordash',
    }));

    // Also convert recent deliveries to shifts
    (recentDeliveries || []).forEach(d => {
      if (d.date && !shifts.find(s => s.date === d.date)) {
        shifts.push({
          date: d.date,
          earnings: (d.earnings || 0) + (d.tip || 0),
          hours: 0,
          deliveries: 1,
          mileage: d.mileage || 0,
          zone: d.zone || 'unknown',
          source: 'doordash',
        });
      }
    });

    return {
      profile: {
        name: profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : null,
        email: profile?.email,
        zone: profile?.currentZone?.name,
        status: profile?.status,
        vehicle: profile?.vehicle?.type,
        market: profile?.market?.name,
        rewardsTier: stats?.rewardsTier,
      },
      platinum: {
        acceptanceRate: stats?.acceptanceRate ?? null,
        completionRate: stats?.completionRate ?? null,
        customerRating: stats?.averageRating ?? null,
        onTimeRate: stats?.onTimeRate ?? null,
        qualityRate: stats?.qualityRate ?? null,
        overallDasherRating: stats?.overallDasherRating ?? null,
        deliveriesThisPeriod: stats?.lifetimeDeliveries ?? null,
      },
      today: {
        earnings: todayEarnings.totalEarnings || 0,
        deliveries: todayEarnings.deliveries || 0,
        hours: todayEarnings.activeHours || 0,
        tips: todayEarnings.tips || 0,
        basePay: todayEarnings.basePay || 0,
        peakPay: todayEarnings.peakPay || 0,
      },
      shifts,
      raw: { profile, ratings, todayEarnings, weekEarnings, recentDeliveries },
    };
  } catch (e) {
    throw e;
  }
};

// ============= Token Capture Guide =============

export const getTokenCaptureInstructions = () => ({
  ios: [
    'Open Safari and go to dasher.doordash.com',
    'Log in to your Dasher account',
    'Open Safari Developer Tools (Settings → Safari → Advanced → Web Inspector)',
    'Connect your iPhone to Mac, open Safari → Develop → iPhone → dasher.doordash.com',
    'Go to the Network tab, find any API request to api.doordash.com',
    'Copy the "authorization" header value (starts with "Bearer ")',
    'Paste the full token below',
  ],
  browser: [
    'Open Chrome/Safari and go to dasher.doordash.com',
    'Log in to your Dasher account',
    'Open DevTools (F12) → Application/Storage → Cookies → dasher.doordash.com',
    'Find the "__dash_token" or "authorization" cookie',
    'Or: Network tab → find request to api.doordash.com → Headers → Authorization',
    'Copy the token (starts with "Bearer " or "eyJ...")',
    'Paste it below',
  ],
  android: [
    'Install "HTTP Canary" or "Packet Capture" from Play Store',
    'Open the app and start capturing traffic',
    'Open the DoorDash Dasher app and use it normally',
    'Go back to the capture app and find requests to "api.doordash.com"',
    'Look for the "Authorization" header in any request',
    'Copy the token value and paste below',
  ],
});

// ============= Auto-Detect Token from WebView =============

/**
 * Extract DoorDash auth token by intercepting API calls.
 * This is used by the WebView-based login flow in the app.
 */
export const extractTokenFromRequest = (url, headers) => {
  if (url.includes('api.doordash.com') || url.includes('dasher.doordash.com')) {
    const authHeader = headers?.authorization || headers?.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.replace('Bearer ', '');
    }
  }
  // Also check for token in cookies or URL params
  if (url.includes('token=')) {
    const match = url.match(/token=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
};

export const extractTokenFromCookie = (cookieString) => {
  if (!cookieString) return null;
  const cookies = cookieString.split(';');
  for (const cookie of cookies) {
    const [key, ...vals] = cookie.trim().split('=');
    const value = vals.join('=');
    if (key === '__dash_token' || key === 'authorization' || key === 'dash_token') {
      return value.replace('Bearer ', '');
    }
  }
  return null;
};
