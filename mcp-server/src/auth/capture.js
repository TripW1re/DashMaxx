/**
 * DashMaxx Token Capture Tool
 *
 * Guides the user through capturing their DoorDash auth token
 * and stores it securely for the MCP server to use.
 *
 * Usage:
 *   node src/auth/capture.js
 */
import { TokenManager } from '../lib/tokenManager.js';

async function main() {
  const tokenManager = new TokenManager();

  // Check if token already exists
  const existing = await tokenManager.initialize();
  if (existing.token) {
    console.log(`✅ Token already configured (source: ${existing.source})`);
    console.log(`   Token: ${existing.token.substring(0, 20)}...${existing.token.substring(existing.token.length - 10)}`);
    const rl = (await import('readline')).createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await new Promise(r => rl.question('Replace it? (y/N): ', rl.close.bind(rl)));
    if (answer.toLowerCase() !== 'y') {
      console.log('Token unchanged.');
      process.exit(0);
    }
  }

  const token = await tokenManager.promptForToken();
  if (token) {
    console.log(`\n✅ Token saved!`);
    console.log(`   Path: ${new URL('../../.dd-token', import.meta.url).pathname}`);
    console.log('\nNow start the server:');
    console.log('   npm start');
    console.log('\nOr run a one-time sync:');
    console.log('   node src/cli.js --sync-all');
  } else {
    console.log('\nNo token captured. You can paste it later in .dd-token');
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
