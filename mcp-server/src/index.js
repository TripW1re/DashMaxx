/**
 * DashMaxx MCP Server
 *
 * Data pipeline that connects DoorDash's internal API to the DashMaxx app.
 * Runs as both:
 *   1. MCP Server (for AI model integration)
 *   2. REST API server (for mobile app consumption)
 *   3. CLI sync tool (for one-off data pulls)
 *
 * Architecture:
 *   DoorDash API ←→ MCP Server ←→ Firebase/Firestore ←→ DashMaxx Mobile App
 *                         ↓
 *                   AI Predictions
 *                         ↓
 *                   Shareholder KPI
 */
import 'dotenv/config';
import { createServer } from 'http';
import { DoorDashClient } from './clients/doorDashClient.js';
import { TokenManager } from './lib/tokenManager.js';
import { CacheLayer } from './lib/cache.js';
import * as Tools from './tools/index.js';

const PORT = parseInt(process.env.PORT || '3100', 10);
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL_MINUTES || '5', 10);

// ===== Initialize Core Services =====
const tokenManager = new TokenManager();
const doorDashClient = new DoorDashClient(null);
const cache = new CacheLayer();

let serverStartTime = null;
let syncInterval = null;
let lastSyncResult = null;

// ===== UID for data isolation =====
// In production, this comes from Firebase Auth.
// For MVP, we use a static ID since it's a single-user setup.
const UID = 'dashmaxx-user-001';

// ===== Server Stats =====
const serverStats = {
  startTime: null,
  requests: 0,
  syncs: 0,
  errors: 0,
};

// ===== Initialize =====
async function initialize() {
  serverStartTime = new Date().toISOString();
  serverStats.startTime = serverStartTime;

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        DashMaxx MCP Server v1.0            ║');
  console.log('╠══════════════════════════════════════════════╣');

  // Initialize token
  const tokenResult = await tokenManager.initialize();
  if (tokenResult.token) {
    doorDashClient.setToken(tokenResult.token);
    console.log(`║  ✅ DoorDash token loaded (source: ${tokenResult.source})`);
  } else {
    console.log('║  ⚠️  No DoorDash token — use "token:capture" to set one');
  }

  // Initialize cache
  const firebaseConfig = process.env.FIREBASE_PROJECT_ID ? {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
  } : null;

  await cache.initialize(firebaseConfig);
  if (cache.isReady()) {
    console.log(`║  ✅ Cache ready (Firebase: ${!!firebaseConfig})`);
  }

  console.log(`║  🚀 Server starting on port ${PORT}`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Start periodic sync
  if (tokenManager.hasToken()) {
    startPeriodicSync();
  }
}

// ===== Periodic Sync =====
function startPeriodicSync() {
  const intervalMs = SYNC_INTERVAL * 60 * 1000;
  console.log(`[Sync] Auto-sync every ${SYNC_INTERVAL} minutes`);

  // Do initial sync
  setTimeout(() => runFullSync(), 1000);

  syncInterval = setInterval(() => {
    runFullSync();
  }, intervalMs);
}

async function runFullSync() {
  if (!tokenManager.hasToken()) {
    console.log('[Sync] Skipping — no DoorDash token');
    return;
  }

  serverStats.syncs++;
  console.log(`[Sync] #${serverStats.syncs} starting...`);

  try {
    const result = await Tools.syncAll(doorDashClient, cache, UID);
    lastSyncResult = result;

    if (result.success) {
      const profile = result.profile?.platinum || {};
      const today = result.today || {};
      console.log(`[Sync] ✅ Complete (${result._duration}ms)`);
      console.log(`[Sync]    Today: $${today.earnings?.toFixed(2) || '?'} | ${today.deliveries || '?'} deliveries`);
      console.log(`[Sync]    AR: ${profile.acceptanceRate ?? '?'}% | CR: ${profile.completionRate ?? '?'}% | ⭐ ${profile.customerRating ?? '?'}`);
    } else {
      console.log(`[Sync] ❌ Failed: ${result.error}`);
      if (result.error === 'AUTH_EXPIRED') {
        console.log('[Sync] 🔑 Token expired — run "token:capture" to update');
        tokenManager.clearToken();
      }
    }
  } catch (e) {
    serverStats.errors++;
    console.log(`[Sync] ❌ Error: ${e.message}`);
  }
}

// ===== HTTP Server (REST API for mobile app) =====
async function handleRequest(req, res) {
  serverStats.requests++;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const params = Object.fromEntries(url.searchParams);

  let body = '';
  if (req.method === 'POST') {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => resolve(data));
    });
  }
  const postBody = body ? JSON.parse(body || '{}') : {};

  try {
    let result;

    switch (path) {
      // ===== REST API Endpoints =====

      case '/health':
        result = {
          status: 'ok',
          uptime: Math.floor((Date.now() - new Date(serverStartTime).getTime()) / 1000) + 's',
          started: serverStartTime,
          tokenConfigured: tokenManager.hasToken(),
          firebaseConfigured: cache.isReady(),
          cache: cache.getStats(),
          api: doorDashClient.getStats(),
          syncs: serverStats.syncs,
          requests: serverStats.requests,
          lastSync: lastSyncResult?.syncedAt || null,
          lastSyncSuccess: lastSyncResult?.success ?? null,
        };
        break;

      case '/sync/profile':
        if (!tokenManager.hasToken()) throw new Error('No DoorDash token configured');
        result = await Tools.syncProfile(doorDashClient, cache, UID);
        break;

      case '/sync/today':
        if (!tokenManager.hasToken()) throw new Error('No DoorDash token configured');
        result = await Tools.syncToday(doorDashClient, cache, UID);
        break;

      case '/sync/earnings':
        if (!tokenManager.hasToken()) throw new Error('No DoorDash token configured');
        result = await Tools.syncEarnings(doorDashClient, cache, UID, {
          startDate: params.startDate,
          endDate: params.endDate,
        });
        break;

      case '/sync/deliveries':
        if (!tokenManager.hasToken()) throw new Error('No DoorDash token configured');
        result = await Tools.syncDeliveries(doorDashClient, cache, UID, {
          limit: parseInt(params.limit || '50'),
          offset: parseInt(params.offset || '0'),
        });
        break;

      case '/sync/all':
        if (!tokenManager.hasToken()) throw new Error('No DoorDash token configured');
        result = await Tools.syncAll(doorDashClient, cache, UID);
        break;

      case '/predict':
        if (!tokenManager.hasToken()) throw new Error('No DoorDash token configured');
        result = await Tools.predictHotZones(doorDashClient, cache, UID, {
          dayOfWeek: parseInt(params.day) || undefined,
          hour: parseInt(params.hour) || undefined,
        });
        break;

      case '/stats':
        result = await Tools.getSyncStats(doorDashClient, cache);
        break;

      case '/token':
        if (req.method === 'POST') {
          const token = postBody.token;
          if (!token) throw new Error('Token required');
          tokenManager.setToken(token);
          doorDashClient.setToken(token);
          result = { success: true, message: 'Token updated' };
        } else {
          result = { configured: tokenManager.hasToken(), source: tokenManager.source };
        }
        break;

      case '/sync/run':
        if (!tokenManager.hasToken()) throw new Error('No DoorDash token configured');
        await runFullSync();
        result = { success: true, message: 'Sync triggered', result: lastSyncResult };
        break;

      default:
        if (path === '/' || path === '') {
          result = {
            name: 'DashMaxx MCP Server',
            version: '1.0.0',
            endpoints: {
              'GET /health': 'Server health',
              'GET /stats': 'Sync stats',
              'GET /sync/profile': 'Dasher profile + ratings',
              'GET /sync/today': 'Today earnings',
              'GET /sync/earnings?startDate=&endDate=': 'Earnings by range',
              'GET /sync/deliveries?limit=&offset=': 'Delivery history',
              'GET /sync/all': 'Full sync all data',
              'GET /predict?day=&hour=': 'AI zone predictions',
              'POST /token': 'Set auth token',
              'POST /sync/run': 'Trigger manual sync',
              'GET /': 'This help',
            },
          };
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
    }

    res.writeHead(200);
    res.end(JSON.stringify(result, null, 2));
  } catch (e) {
    serverStats.errors++;
    console.log(`[HTTP] Error on ${path}: ${e.message}`);
    res.writeHead(e.message === 'No DoorDash token configured' ? 401 : 500);
    res.end(JSON.stringify({
      error: e.message,
      status: e.message === 'AUTH_EXPIRED' ? 'AUTH_EXPIRED' : 'ERROR',
    }));
  }
}

// ===== Start Server =====
async function main() {
  await initialize();

  const server = createServer(handleRequest);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server listening on http://localhost:${PORT}`);
    console.log(`📋 API docs: http://localhost:${PORT}/`);
    console.log(`💓 Health:   http://localhost:${PORT}/health`);
    console.log('');
    if (!tokenManager.hasToken()) {
      console.log('⚠️  No token configured. Run:');
      console.log('   npm run token:capture');
      console.log('   OR set DD_AUTH_TOKEN in .env');
      console.log('');
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    if (syncInterval) clearInterval(syncInterval);
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[Server] Shutting down...');
    if (syncInterval) clearInterval(syncInterval);
    server.close();
    process.exit(0);
  });
}

main().catch(e => {
  console.error('[Server] Fatal:', e);
  process.exit(1);
});
