import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import Constants from 'expo-constants';

const getConfig = () => {
  const extra = Constants.expoConfig?.extra || {};
  const apiKey = extra.firebaseApiKey || process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey || apiKey === 'REPLACE_ME') return null;

  return {
    apiKey,
    authDomain: extra.firebaseAuthDomain || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: extra.firebaseProjectId || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: extra.firebaseStorageBucket || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: extra.firebaseMessagingSenderId || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: extra.firebaseAppId || process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
};

const config = getConfig();

let app = null;
let db = null;
let auth = null;
let functions = null;

export const isFirebaseReady = () => config !== null;

export const getFirebaseApp = () => {
  if (!config) throw new Error('Firebase not configured — set EXPO_PUBLIC_FIREBASE_* env vars or app.json extra');
  if (!app) app = initializeApp(config);
  return app;
};

export const getDb = () => {
  if (!db) { db = getFirestore(getFirebaseApp()); }
  return db;
};

export const getAuth_ = () => {
  if (!auth) { auth = getAuth(getFirebaseApp()); }
  return auth;
};

export const getFunctions_ = () => {
  if (!functions) { functions = getFunctions(getFirebaseApp()); }
  return functions;
};
