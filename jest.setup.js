/**
 * Jest setup for DashMaxx unit tests.
 * Mocks native storage and Firebase so pure logic can be tested in Node.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('./src/config/firebase', () => ({
  isFirebaseReady: () => false,
  getFirebaseApp: () => { throw new Error('Firebase not configured in tests'); },
  getDb: () => { throw new Error('Firebase not configured in tests'); },
  getAuth_: () => { throw new Error('Firebase not configured in tests'); },
  getFunctions_: () => { throw new Error('Firebase not configured in tests'); },
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  doc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  setDoc: jest.fn(),
  increment: (n) => n,
  serverTimestamp: () => new Date(),
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
  signInAnonymously: jest.fn(),
}));
