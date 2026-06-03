/**
 * Firestore Cache Layer
 *
 * Caches DoorDash data in Firestore for:
 * 1. Persistent storage across device restarts
 * 2. Sharing data between the MCP server and mobile app
 * 3. Historical data tracking for AI predictions
 * 4. Offline access when DoorDash API is unreachable
 *
 * Only initialized if Firebase credentials are provided.
 */

let admin = null;
let db = null;
let initialized = false;

export class CacheLayer {
  constructor() {
    this.initialized = false;
    this.localCache = {};
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  async initialize(firebaseConfig) {
    if (!firebaseConfig || !firebaseConfig.projectId) {
      console.log('[Cache] No Firebase config — using in-memory cache only');
      this.initialized = true; // Still "ready" for local caching
      return;
    }

    try {
      admin = await import('firebase-admin');
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: firebaseConfig.projectId,
            clientEmail: firebaseConfig.clientEmail,
            privateKey: firebaseConfig.privateKey?.replace(/\\n/g, '\n'),
          }),
        });
      }
      db = admin.firestore();
      this.initialized = true;
      console.log('[Cache] Firebase initialized:', firebaseConfig.projectId);
    } catch (e) {
      console.warn('[Cache] Firebase init failed:', e.message);
      console.log('[Cache] Falling back to in-memory cache');
      this.initialized = true;
    }
  }

  isReady() { return this.initialized; }

  /**
   * Cache key format: doordash/{uid}/{type}
   * Types: profile, earnings, ratings, deliveries, zones
   */
  _buildKey(uid, type) {
    return `doordash/${uid}/${type}`;
  }

  async get(uid, type) {
    const key = this._buildKey(uid, type);

    // Check local cache first (instant)
    if (this.localCache[key]) {
      this.cacheHits++;
      return this.localCache[key];
    }

    // Check Firestore
    if (db && uid) {
      try {
        const doc = await db.collection('cache').doc(key).get();
        if (doc.exists) {
          const data = doc.data();
          this.localCache[key] = data;
          this.cacheHits++;
          return data;
        }
      } catch {}
    }

    this.cacheMisses++;
    return null;
  }

  async set(uid, type, data, ttlMinutes = 5) {
    const key = this._buildKey(uid, type);

    const cacheEntry = {
      data,
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMinutes * 60000).toISOString(),
      ttl: ttlMinutes,
    };

    // Update local cache
    this.localCache[key] = cacheEntry;

    // Persist to Firestore
    if (db && uid) {
      try {
        const batch = db.batch();
        const docRef = db.collection('cache').doc(key);
        batch.set(docRef, {
          ...cacheEntry,
          uid,
          type,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Clean up old cache entries
        const oldRef = db.collection('cache').doc(key + '_history_' + Date.now());
        batch.set(oldRef, {
          ...cacheEntry,
          uid, type,
          isHistory: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        await batch.commit();
      } catch (e) {
        console.warn('[Cache] Firestore write failed:', e.message);
      }
    }

    return cacheEntry;
  }

  async getOrFetch(uid, type, fetchFn, ttlMinutes = 5) {
    const cached = await this.get(uid, type);
    if (cached && cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
      return cached.data;
    }
    const freshData = await fetchFn();
    await this.set(uid, type, freshData, ttlMinutes);
    return freshData;
  }

  /**
   * Validate and normalize earnings from DoorDash API
   * into DashMaxx internal format
   */
  normalizeEarnings(rawEarnings) {
    if (!Array.isArray(rawEarnings)) return [];
    return rawEarnings.map(d => ({
      date: d.date,
      earnings: d.totalEarnings || 0,
      basePay: d.basePay || 0,
      tips: d.tips || 0,
      peakPay: d.peakPay || 0,
      adjustments: d.adjustments || 0,
      deliveries: d.deliveries || 0,
      hours: d.activeHours || 0,
      mileage: d.mileage || 0,
    }));
  }

  /**
   * Normalize profile + stats into Platinum format
   */
  normalizePlatinum(profile, ratings) {
    const stats = profile?.stats || ratings || {};
    return {
      acceptanceRate: stats.acceptanceRate ?? null,
      completionRate: stats.completionRate ?? null,
      customerRating: stats.averageRating ?? null,
      onTimeRate: stats.onTimeRate ?? null,
      qualityRate: stats.qualityRate ?? null,
      overallDasherRating: stats.overallDasherRating ?? null,
      deliveriesThisPeriod: stats.lifetimeDeliveries ?? null,
      rewardsTier: stats.rewardsTier ?? null,
      status: profile?.status || null,
      currentZone: profile?.currentZone?.name || null,
    };
  }

  /**
   * Convert DoorDash deliveries into DashMaxx shifts
   */
  normalizeShifts(deliveries) {
    if (!Array.isArray(deliveries)) return [];
    return deliveries.map(d => ({
      date: d.date,
      earnings: (d.earnings || 0) + (d.tip || 0),
      basePay: d.earnings || 0,
      tips: d.tip || 0,
      deliveries: 1,
      hours: 0,
      mileage: d.mileage || 0,
      zone: d.zone || 'unknown',
      source: 'doordash',
      orderId: d.id || d.orderId,
      status: d.status,
    }));
  }

  getStats() {
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      ratio: this.cacheHits + this.cacheMisses > 0
        ? (this.cacheHits / (this.cacheHits + this.cacheMisses) * 100).toFixed(1) + '%'
        : '0%',
      firestore: !!db,
    };
  }
}
