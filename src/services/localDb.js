import AsyncStorage from '@react-native-async-storage/async-storage';
import { isFirebaseReady, getDb, getAuth_ } from '../config/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, getDocs, onSnapshot, Timestamp, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';

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
let firebaseUnsubs = [];

export const getLocalState = () => {
  if (!localState) localState = { ...defaultState };
  return localState;
};

export const loadFromStorage = async () => {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      localState = deepMerge(defaultState, saved);
    } else {
      localState = { ...defaultState };
    }
  } catch {
    localState = { ...defaultState };
  }
  return localState;
};

export const saveToStorage = async (state) => {
  try {
    localState = state;
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    stateListeners.forEach(fn => fn(state));
  } catch (e) {
    // silently fail
  }
};

export const subscribeToState = (fn) => {
  stateListeners.push(fn);
  return () => { stateListeners = stateListeners.filter(f => f !== fn); };
};

const deepMerge = (defaults, overrides) => {
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
  localState = { ...defaultState };
  await AsyncStorage.removeItem(LOCAL_KEY);
  return localState;
};
