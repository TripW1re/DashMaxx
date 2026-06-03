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
import { getLocalState, saveToStorage } from './localDb';

// Configurable server URL — set to your MCP server address
const DEFAULT_MCP_URL = 'http://localhost:3100';
const MCP_URL_KEY = 'dashmaxx_mcp_url';

let mcpUrl = DEFAULT_MCP_URL;
let connected = false;
let lastHealthCheck = null;

export const getMcpUrl = async () => {
  try {
    const stored = await AsyncStorage.getItem(MCP_URL_KEY);
    if (stored) mcpUrl = stored;
  } catch {}
  return mcpUrl;
};

export const setMcpUrl = async (url) => {
  mcpUrl = url;
  await AsyncStorage.setItem(MCP_URL_KEY, url);
  connected = false;
};

// ===== Health Check =====

export const checkConnection = async () => {
  try {
    const res = await fetch(`${mcpUrl}/health`, { method: 'GET', timeout: 5000 });
    const data = await res.json();
    connected = data.status === 'ok';
    lastHealthCheck = new Date().toISOString();
    return { connected, ...data };
  } catch {
    connected = false;
    lastHealthCheck = new Date().toISOString();
    return { connected: false };
  }
};

export const isConnected = () => connected;

// ===== API Wrapper =====

const mcpFetch = async (path, options = {}) => {
  const url = `${mcpUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    timeout: 15000,
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new Error('AUTH_EXPIRED');
    throw new Error(`MCP error ${res.status}: ${body}`);
  }
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
    console.log('[MCP] Server not reachable — background sync disabled');
    return false;
  }

  // Do an initial sync
  try { await syncAllFromDoorDash(); } catch {}

  syncInterval = setInterval(async () => {
    try {
      await syncAllFromDoorDash();
    } catch (e) {
      console.log('[MCP] Background sync failed:', e.message);
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
