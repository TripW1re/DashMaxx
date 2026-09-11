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
import { isValidToken, toBearerToken, sanitizeLimit, sanitizeOffset, isValidDateParam } from './lib/validation.js';
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
  console.log(`║  🔐 API key auth: ${API_KEY ? 'ENABLED (x-api-key required)' : 'DISABLED — set DD_API_KEY in production'}`);
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

// Optional API key auth. When DD_API_KEY is set, every endpoint except
// /health and / requires the `x-api-key` header to match. This protects
// the token + data endpoints when the server is deployed publicly.
const API_KEY = process.env.DD_API_KEY || '';

// Simple per-IP rate limiter (token bucket).
const RATE_LIMIT_PER_MINUTE = 120;
const rateBuckets = new Map();
setInterval(() => rateBuckets.clear(), 60 * 1000).unref?.();

function rateLimited(ip) {
  if (!ip) return false;
  const count = (rateBuckets.get(ip) || 0) + 1;
  rateBuckets.set(ip, count);
  return count > RATE_LIMIT_PER_MINUTE;
}

function isAuthorized(req) {
  if (!API_KEY) return true;
  return req.headers['x-api-key'] === API_KEY;
}

async function readBody(req, maxBytes = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  serverStats.requests++;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const params = Object.fromEntries(url.searchParams);

  // Rate limit (applies to everything except OPTIONS)
  const ip = req.socket?.remoteAddress || '';
  if (rateLimited(ip)) {
    res.writeHead(429);
    res.end(JSON.stringify({ error: 'Too many requests', status: 'RATE_LIMITED' }));
    return;
  }

  // Auth gate for everything except health/help endpoints
  const isPublic = path === '/health' || path === '/' || path === '';
  if (!isPublic && !isAuthorized(req)) {
    serverStats.errors++;
    res.writeHead(401);
    res.end(JSON.stringify({ error: 'Unauthorized — provide x-api-key', status: 'UNAUTHORIZED' }));
    return;
  }

  let postBody = {};
  try {
    const body = req.method === 'POST' ? await readBody(req) : '';
    postBody = body ? JSON.parse(body) : {};
  } catch (e) {
    serverStats.errors++;
    res.writeHead(e.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400);
    res.end(JSON.stringify({ error: e.message === 'PAYLOAD_TOO_LARGE' ? 'Payload too large' : 'Invalid JSON body', status: 'BAD_REQUEST' }));
    return;
  }

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
        if (params.startDate && !isValidDateParam(params.startDate)) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid startDate — use YYYY-MM-DD', status: 'BAD_REQUEST' }));
          return;
        }
        if (params.endDate && !isValidDateParam(params.endDate)) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid endDate — use YYYY-MM-DD', status: 'BAD_REQUEST' }));
          return;
        }
        result = await Tools.syncEarnings(doorDashClient, cache, UID, {
          startDate: params.startDate,
          endDate: params.endDate,
        });
        break;

      case '/sync/deliveries':
        if (!tokenManager.hasToken()) throw new Error('No DoorDash token configured');
        result = await Tools.syncDeliveries(doorDashClient, cache, UID, {
          limit: sanitizeLimit(params.limit, 50, 100),
          offset: sanitizeOffset(params.offset, 0),
        });
        break;

      case '/sync/all':
        if (!tokenManager.hasToken()) throw new Error('No DoorDash token configured');
        result = await Tools.syncAll(doorDashClient, cache, UID);
        break;

      case '/predict':
        if (!tokenManager.hasToken()) throw new Error('No DoorDash token configured');
        result = await Tools.predictHotZones(doorDashClient, cache, UID, {
          dayOfWeek: Number.isInteger(parseInt(params.day)) ? Math.min(6, Math.max(0, parseInt(params.day))) : undefined,
          hour: Number.isInteger(parseInt(params.hour)) ? Math.min(23, Math.max(0, parseInt(params.hour))) : undefined,
        });
        break;

      case '/stats':
        result = await Tools.getSyncStats(doorDashClient, cache);
        break;

      case '/token':
        if (req.method === 'POST') {
          const rawToken = postBody.token;
          if (!isValidToken(rawToken)) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid token — must be a non-empty bearer string (20-4096 chars, no spaces)', status: 'BAD_REQUEST' }));
            return;
          }
          const token = rawToken.trim().replace(/^Bearer\s+/i, '');
          tokenManager.setToken(token);
          doorDashClient.setToken(token);
          // Kick a sync after the token is set so data is ready immediately
          setTimeout(() => { runFullSync().catch(() => {}); }, 250);
          result = { success: true, message: 'Token updated', configured: true };
        } else {
          result = { configured: tokenManager.hasToken() };
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
