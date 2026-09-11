/**
 * DashMaxx MCP Client
 *
 * Connects the mobile app to the MCP server for real DoorDash data.
 * Falls back gracefully to local/AsyncStorage when server is unreachable.
 *
 * Architecture:
 *   Mobile App → MCP Client → MCP Server (localhost:3100 or cloud URL)
 *                                   ↓
 *                            DoorDash API
 *                                   ↓
 *                            Firestore Cache
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getLocalState, saveToStorage } from './localDb';

// Configurable server URL — set to your MCP server address.
// Priority: user setting (AsyncStorage) > app.json extra.mcpUrl > fallback.
const FALLBACK_MCP_URL = 'https://artistic-reflection-production.up.railway.app';
const MCP_URL_KEY = 'dashmaxx_mcp_url';
const MCP_API_KEY_KEY = 'dashmaxx_mcp_api_key';

let mcpUrl = Constants.expoConfig?.extra?.mcpUrl || FALLBACK_MCP_URL;
let connected = false;

const getMcpApiKey = async () => {
  try {
    return await AsyncStorage.getItem(MCP_API_KEY_KEY) || '';
  } catch {
    return '';
  }
};

export const setMcpApiKey = async (key) => {
  try {
    if (key) await AsyncStorage.setItem(MCP_API_KEY_KEY, key);
    else await AsyncStorage.removeItem(MCP_API_KEY_KEY);
  } catch {}
  connected = false;
};

export const getMcpUrl = async () => {
  try {
    const stored = await AsyncStorage.getItem(MCP_URL_KEY);
    if (stored) mcpUrl = stored;
  } catch {}
  return mcpUrl;
};

export const setMcpUrl = async (url) => {
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (!clean) throw new Error('MCP server URL cannot be empty');
  mcpUrl = clean;
  await AsyncStorage.setItem(MCP_URL_KEY, clean);
  connected = false;
};

// ===== Fetch with timeout (AbortController — RN's fetch ignores `timeout`) =====

const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('TIMEOUT');
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

// ===== Health Check =====

export const checkConnection = async () => {
  try {
    const res = await fetchWithTimeout(`${mcpUrl}/health`, { method: 'GET' }, 5000);
    const data = await res.json();
    connected = data.status === 'ok';
    return { connected, lastHealthCheck: new Date().toISOString(), ...data };
  } catch {
    connected = false;
    return { connected: false, lastHealthCheck: new Date().toISOString() };
  }
};

export const isConnected = () => connected;

// ===== API Wrapper =====

const mcpFetch = async (path, options = {}) => {
  const url = `${mcpUrl}${path}`;
  const apiKey = await getMcpApiKey();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (apiKey) headers['x-api-key'] = apiKey;

  let res;
  try {
    res = await fetchWithTimeout(url, { ...options, headers }, 15000);
  } catch (e) {
    connected = false;
    throw e;
  }

  if (!res.ok) {
    let serverError = null;
    try {
      const parsed = await res.json();
      serverError = parsed?.error || parsed?.status || null;
    } catch {}
    if (res.status === 401) {
      if (serverError === 'UNAUTHORIZED') throw new Error('API_KEY_REJECTED');
      throw new Error('AUTH_EXPIRED');
    }
    throw new Error(`MCP error ${res.status}${serverError ? `: ${serverError}` : ''}`);
  }
  connected = true;
  return res.json();
};

// ===== DoorDash Data Sync =====

export const syncAllFromDoorDash = async () => {
  const result = await mcpFetch('/sync/all');
  if (result.success) {
    // Save to local state for offline access
    await mergeDoorDashData(result);
  }
  return result;
};

export const syncProfileFromDoorDash = async () => {
  return mcpFetch('/sync/profile');
};

export const syncTodayFromDoorDash = async () => {
  const result = await mcpFetch('/sync/today');
  if (result.success) await mergeDoorDashData({ today: result });
  return result;
};

export const syncEarningsFromDoorDash = async (startDate, endDate) => {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const qs = params.toString();
  return mcpFetch(`/sync/earnings${qs ? '?' + qs : ''}`);
};

export const syncDeliveriesFromDoorDash = async (limit = 50, offset = 0) => {
  return mcpFetch(`/sync/deliveries?limit=${limit}&offset=${offset}`);
};

export const getHotZonePredictions = async (day, hour) => {
  const params = new URLSearchParams();
  if (day !== undefined) params.set('day', String(day));
  if (hour !== undefined) params.set('hour', String(hour));
  const qs = params.toString();
  return mcpFetch(`/predict${qs ? '?' + qs : ''}`);
};

export const setDoorDashToken = async (token) => {
  return mcpFetch('/token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
};

// ===== Data Merge =====

const newShiftId = () => 'dd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

const mergeDoorDashData = async (result) => {
  const state = getLocalState();
  let changed = false;

  // Merge platinum stats from DoorDash
  if (result.profile?.platinum) {
    const p = result.profile.platinum;
    if (p.acceptanceRate != null) { state.platinum.acceptanceRate = p.acceptanceRate; changed = true; }
    if (p.completionRate != null) { state.platinum.completionRate = p.completionRate; changed = true; }
    if (p.customerRating != null) { state.platinum.customerRating = p.customerRating; changed = true; }
    if (p.lifetimeDeliveries != null) { state.platinum.deliveriesThisPeriod = p.lifetimeDeliveries; changed = true; }
  }

  // Merge today data
  if (result.today) {
    const today = result.today;
    const existingToday = state.shifts.find(s => s.date === today.date && s.source === 'doordash');
    if (!existingToday && (today.earnings > 0 || today.deliveries > 0)) {
      state.shifts.push({
        id: newShiftId(),
        date: today.date,
        earnings: today.earnings || 0,
        hours: today.hours || 0,
        deliveries: today.deliveries || 0,
        mileage: today.mileage || 0,
        zone: today.zone || 'doordash',
        source: 'doordash',
        tips: today.tips || 0,
        basePay: today.basePay || 0,
        peakPay: today.peakPay || 0,
      });
      changed = true;
    }
  }

  // Merge daily earnings as shifts
  if (result.earnings?.days) {
    result.earnings.days.forEach(d => {
      if (d.earnings > 0 && !state.shifts.find(s => s.date === d.date && s.source === 'doordash')) {
        state.shifts.push({
          id: newShiftId(),
          date: d.date,
          earnings: d.earnings || 0,
          hours: d.hours || 0,
          deliveries: d.deliveries || 0,
          mileage: d.mileage || 0,
          zone: 'doordash',
          source: 'doordash',
          tips: d.tips || 0,
          basePay: d.basePay || 0,
          peakPay: d.peakPay || 0,
        });
        changed = true;
      }
    });
  }

  // Merge delivery-level data
  if (result.deliveries?.deliveries) {
    result.deliveries.deliveries.forEach(d => {
      if (!state.shifts.find(s => s.orderId === d.orderId && s.source === 'doordash')) {
        state.shifts.push({
          id: newShiftId(),
          date: d.date,
          earnings: d.earnings || 0,
          hours: d.hours || 0,
          deliveries: d.deliveries || 1,
          mileage: d.mileage || 0,
          zone: d.zone || 'unknown',
          source: 'doordash',
          orderId: d.orderId,
        });
        changed = true;
      }
    });
  }

  if (changed) {
    state.settings.lastDoorDashSync = new Date().toISOString();
    await saveToStorage(state);
  }

  return changed;
};

// ===== Background Sync =====

let syncInterval = null;

export const startBackgroundSync = async (intervalMinutes = 5) => {
  stopBackgroundSync();
  const check = await checkConnection();
  if (!check.connected) {
    return false;
  }

  // Do an initial sync
  try { await syncAllFromDoorDash(); } catch {}

  syncInterval = setInterval(async () => {
    try {
      await syncAllFromDoorDash();
    } catch {
      // Offline/transient errors — checkConnection() already marks us offline;
      // the next tick will retry as long as the interval is alive.
    }
  }, intervalMinutes * 60 * 1000);

  return true;
};

export const stopBackgroundSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
};
