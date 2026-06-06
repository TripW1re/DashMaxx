#!/usr/bin/env node
/**
 * Prestart: free up port 8081 before launching Metro bundler.
 * Prevents "Port 8081 is being used by another process" errors.
 */
const { execSync } = require('child_process');

const port = 8081;
const isWindows = process.platform === 'win32';

console.log(`[prestart] Freeing port ${port}...`);

try {
  if (isWindows) {
    // Find and kill processes listening on the port
    const pids = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' })
      .split('\n')
      .map(line => line.trim().split(/\s+/).pop())
      .filter(pid => pid && /^\d+$/.test(pid));
    
    for (const pid of [...new Set(pids)]) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`[prestart] Killed process ${pid}`);
      } catch {}
    }
  } else {
    try {
      execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
    } catch {}
  }
  console.log(`[prestart] Port ${port} is free.`);
} catch (e) {
  // No processes found on port - that's fine
  console.log(`[prestart] Port ${port} is already free.`);
}
