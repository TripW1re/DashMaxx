/**
 * DashMaxx CLI — Command-line sync tool
 *
 * Usage:
 *   node src/cli.js --sync-all     # Full data sync
 *   node src/cli.js --today        # Today only
 *   node src/cli.js --profile      # Profile + ratings
 *   node src/cli.js --predict      # AI zone predictions
 *   node src/cli.js --stats        # Sync health stats
 *   node src/cli.js --serve        # Start HTTP server
 *   node src/cli.js --help         # This help
 */
import 'dotenv/config';
import { DoorDashClient } from './clients/doorDashClient.js';
import { TokenManager } from './lib/tokenManager.js';
import { CacheLayer } from './lib/cache.js';
import * as Tools from './tools/index.js';

const UID = 'dashmaxx-cli';
const args = process.argv.slice(2);

async function main() {
  const tokenManager = new TokenManager();
  const client = new DoorDashClient(null);
  const cache = new CacheLayer();

  const tokenResult = await tokenManager.initialize();
  if (!tokenResult.token) {
    console.log('❌ No DoorDash token found.');
    console.log('   Run: node src/auth/capture.js');
    console.log('   Or set DD_AUTH_TOKEN in .env');
    process.exit(1);
  }

  client.setToken(tokenResult.token);
  await cache.initialize(null); // local cache only for CLI

  const flag = args[0] || '--sync-all';

  switch (flag) {
    case '--sync-all': {
      console.log('🔄 Full sync...');
      const result = await Tools.syncAll(client, cache, UID);
      printResult(result);
      break;
    }
    case '--today': {
      console.log('📅 Today...');
      const result = await Tools.syncToday(client, cache, UID);
      printResult(result);
      break;
    }
    case '--profile': {
      console.log('👤 Profile...');
      const result = await Tools.syncProfile(client, cache, UID);
      printResult(result);
      break;
    }
    case '--predict': {
      console.log('🔮 Hot zones...');
      const result = await Tools.predictHotZones(client, cache, UID);
      printResult(result);
      break;
    }
    case '--stats': {
      const result = await Tools.getSyncStats(client, cache);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case '--serve': {
      console.log('Starting server...');
      const { createServer } = await import('http');
      const { default: serverModule } = await import('./index.js');
      // index.js auto-starts, just run it
      break;
    }
    case '--help':
    default:
      console.log('DashMaxx CLI — Real-time DoorDash data sync\n');
      console.log('Usage:');
      console.log('  node src/cli.js --sync-all     Full data sync');
      console.log('  node src/cli.js --today        Today only');
      console.log('  node src/cli.js --profile      Profile + ratings');
      console.log('  node src/cli.js --predict      AI zone predictions');
      console.log('  node src/cli.js --stats        Sync health stats');
      console.log('  node src/cli.js --serve        Start HTTP server');
      console.log('  node src/cli.js --help         This help\n');
  }
}

function printResult(result) {
  if (!result) { console.log('No result'); return; }
  if (result.error) { console.log(`❌ ${result.error}`); return; }
  console.log(JSON.stringify(result, null, 2));
  if (result._duration) console.log(`\n⏱️  ${result._duration}ms`);
  if (result.syncedAt) console.log(`🕐 ${result.syncedAt}`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
