import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCAL_KEY = 'dashmaxx_state';

const defaultState = {
  shifts: [],
  revenueShare: { tier: 'bronze', referrals: 0, streakDays: 0, monthEarnings: 0, shiftsLogged: 0, socialPosts: 0, meetupsAttended: 0 },
  platinum: { acceptanceRate: 50, completionRate: 85, customerRating: 4.2, deliveriesThisPeriod: 0, deliveriesAtPlatinum: 0 },
  social: { posts: [], profile: { displayName: 'Dasher', bio: '', avatar: '🚗', joinDate: new Date().toISOString() } },
  meetups: { rsvps: {} },
  gps: { spoofing: false, lat: 38.5816, lng: -121.4944, speed: 'drive', accuracy: 50, currentZone: 'downtown' },
  settings: { isPro: false, theme: 'dark', trialStart: Date.now(), referralCode: '', referralEarnings: 0, debugMode: false, platinumTargets: { ar: 70, cr: 95, rating: 4.7, deliveries: 100 } },
};

let localState = null;
let stateListeners = [];

export const getDefaultState = () => JSON.parse(JSON.stringify(defaultState));

export const getLocalState = () => {
  if (!localState) localState = getDefaultState();
  return localState;
};

export const loadFromStorage = async () => {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      localState = deepMerge(defaultState, saved);
      migrateState(localState);
    } else {
      localState = getDefaultState();
    }
  } catch {
    localState = getDefaultState();
  }
  return localState;
};

// Backfill IDs for shifts created before IDs were introduced,
// and keep nested structures in the expected shape.
const migrateState = (state) => {
  if (Array.isArray(state.shifts)) {
    let changed = false;
    state.shifts.forEach(sh => {
      if (!sh.id) {
        sh.id = 'shift-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        changed = true;
      }
    });
    if (changed) AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(state)).catch(() => {});
  }
  if (!state.social || typeof state.social !== 'object') state.social = { ...defaultState.social };
  if (!state.meetups || typeof state.meetups !== 'object') state.meetups = { ...defaultState.meetups };
  if (!state.revenueShare || typeof state.revenueShare !== 'object') state.revenueShare = { ...defaultState.revenueShare };
  if (!state.platinum || typeof state.platinum !== 'object') state.platinum = { ...defaultState.platinum };
  if (!state.settings || typeof state.settings !== 'object') state.settings = { ...defaultState.settings };
};

export const saveToStorage = async (state) => {
  try {
    localState = state;
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    stateListeners.forEach(fn => fn(state));
  } catch {
    // storage write failed — keep in-memory state so the UI still works
  }
};

export const subscribeToState = (fn) => {
  stateListeners.push(fn);
  return () => { stateListeners = stateListeners.filter(f => f !== fn); };
};

export const deepMerge = (defaults, overrides) => {
  const result = { ...defaults };
  if (!overrides || typeof overrides !== 'object') return result;
  Object.keys(overrides).forEach(key => {
    if (defaults[key] && typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
      result[key] = deepMerge(defaults[key], overrides[key]);
    } else {
      result[key] = overrides[key] !== undefined ? overrides[key] : defaults[key];
    }
  });
  return result;
};

export const resetLocalState = async () => {
  localState = getDefaultState();
  await AsyncStorage.removeItem(LOCAL_KEY);
  return localState;
};
