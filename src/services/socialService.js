/**
 * DashMaxx Social Service
 *
 * Community layer backed by Firestore (when Firebase is configured):
 *   - Anonymous Firebase Auth identity per device
 *   - Social feed (social/posts) with realtime updates
 *   - Community leaderboard (social/profiles)
 *   - Meetup RSVPs (meetups/{meetupId}/rsvps/{uid})
 *
 * When Firebase is not configured, every function degrades gracefully
 * and the app keeps working in offline/local-only mode.
 */
import { isFirebaseReady, getDb, getAuth_ } from '../config/firebase';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, limit,
  onSnapshot, setDoc, increment, serverTimestamp,
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';

const FEED_LIMIT = 50;
const LEADERBOARD_LIMIT = 50;
const MAX_POST_LENGTH = 500;

let currentUid = null;
let authPromise = null;

export const isSocialReady = () => isFirebaseReady();

export const getSocialUid = () => currentUid;

export const ensureSocialAuth = async () => {
  if (!isFirebaseReady()) return null;
  if (currentUid) return currentUid;
  if (!authPromise) {
    authPromise = (async () => {
      const auth = getAuth_();
      const cred = await signInAnonymously(auth);
      currentUid = cred.user?.uid || null;
      return currentUid;
    })().catch(e => {
      authPromise = null;
      return null;
    });
  }
  return authPromise;
};

// ===== Feed =====

export const subscribeToFeed = (onPosts, onError) => {
  if (!isFirebaseReady()) {
    onError?.(new Error('FIREBASE_NOT_CONFIGURED'));
    return () => {};
  }
  const db = getDb();
  const q = query(collection(db, 'social/posts'), orderBy('timestamp', 'desc'), limit(FEED_LIMIT));
  return onSnapshot(q, snap => {
    const posts = [];
    snap.forEach(docSnap => {
      const d = docSnap.data();
      posts.push({
        id: docSnap.id,
        author: d.author || 'Dasher',
        avatar: d.avatar || '🚗',
        content: d.content || '',
        timestamp: d.timestamp?.toMillis?.() ?? d.timestamp ?? Date.now(),
        tips: d.tips || 0,
        type: 'remote',
        uid: d.uid || null,
      });
    });
    onPosts(posts);
  }, err => onError?.(err));
};

export const createPost = async ({ author, avatar, content }) => {
  if (!isFirebaseReady()) throw new Error('FIREBASE_NOT_CONFIGURED');
  const uid = await ensureSocialAuth();
  if (!uid) throw new Error('AUTH_UNAVAILABLE');
  const text = String(content || '').trim().slice(0, MAX_POST_LENGTH);
  if (!text) throw new Error('EMPTY_POST');

  const db = getDb();
  const ref = await addDoc(collection(db, 'social/posts'), {
    uid,
    author: String(author || 'Dasher').slice(0, 40),
    avatar: String(avatar || '🚗').slice(0, 8),
    content: text,
    timestamp: serverTimestamp(),
    tips: 0,
  });
  return ref.id;
};

export const tipPost = async (postId, amount = 1) => {
  if (!isFirebaseReady()) throw new Error('FIREBASE_NOT_CONFIGURED');
  const db = getDb();
  await updateDoc(doc(db, 'social/posts', postId), { tips: increment(amount) });
};

// ===== Leaderboard =====

export const subscribeToLeaderboard = (onRows, onError) => {
  if (!isFirebaseReady()) {
    onError?.(new Error('FIREBASE_NOT_CONFIGURED'));
    return () => {};
  }
  const db = getDb();
  const q = query(collection(db, 'social/profiles'), orderBy('earnings', 'desc'), limit(LEADERBOARD_LIMIT));
  return onSnapshot(q, snap => {
    const rows = [];
    snap.forEach(docSnap => {
      const d = docSnap.data();
      rows.push({
        id: docSnap.id,
        name: d.displayName || 'Dasher',
        avatar: d.avatar || '🚗',
        earnings: d.earnings || 0,
        deliveries: d.deliveries || 0,
        tier: d.tier || 'basic',
        streak: d.streakDays || 0,
      });
    });
    onRows(rows);
  }, err => onError?.(err));
};

export const publishProfile = async (profile) => {
  if (!isFirebaseReady()) return null;
  const uid = await ensureSocialAuth();
  if (!uid) return null;
  const db = getDb();
  await setDoc(doc(db, 'social/profiles', uid), {
    displayName: String(profile.displayName || 'Dasher').slice(0, 40),
    avatar: String(profile.avatar || '🚗').slice(0, 8),
    bio: String(profile.bio || '').slice(0, 200),
    earnings: Number(profile.earnings) || 0,
    deliveries: Number(profile.deliveries) || 0,
    tier: String(profile.tier || 'basic').slice(0, 20),
    streakDays: Number(profile.streakDays) || 0,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return uid;
};

// ===== Meetup RSVPs =====

export const subscribeToRsvps = (meetupId, onRsvpIds, onError) => {
  if (!isFirebaseReady()) {
    onError?.(new Error('FIREBASE_NOT_CONFIGURED'));
    return () => {};
  }
  const db = getDb();
  return onSnapshot(collection(db, `meetups/${meetupId}/rsvps`), snap => {
    const ids = [];
    snap.forEach(docSnap => ids.push(docSnap.id));
    onRsvpIds(ids);
  }, err => onError?.(err));
};

export const setRsvp = async (meetupId, rsvp) => {
  if (!isFirebaseReady()) return null;
  const uid = await ensureSocialAuth();
  if (!uid) return null;
  const db = getDb();
  const ref = doc(db, `meetups/${meetupId}/rsvps`, uid);
  if (rsvp) {
    await setDoc(ref, { uid, meetupId, createdAt: serverTimestamp() });
  } else {
    await deleteDoc(ref);
  }
  return uid;
};
