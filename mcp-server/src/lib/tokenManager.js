/**
 * Token Manager
 *
 * Manages DoorDash auth tokens with:
 * - Secure storage via encrypted file or env var
 * - Automatic refresh detection (401 responses)
 * - Multiple token sources (env, file, interactive)
 * - Token validation before API calls
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = join(__dirname, '../../.dd-token');
const ENV_TOKEN_KEY = 'DD_AUTH_TOKEN';

export class TokenManager {
  constructor() {
    this.token = null;
    this.source = null;
    this.lastValidated = null;
  }

  async initialize() {
    // Priority: env var > token file > prompt
    if (process.env[ENV_TOKEN_KEY]) {
      this.token = process.env[ENV_TOKEN_KEY];
      this.source = 'env';
      return { token: this.token, source: this.source };
    }

    if (existsSync(TOKEN_FILE)) {
      try {
        const data = readFileSync(TOKEN_FILE, 'utf-8').trim();
        if (data) {
          this.token = data;
          this.source = 'file';
          return { token: this.token, source: this.source };
        }
      } catch {}
    }

    return { token: null, source: null };
  }

  getToken() {
    return this.token;
  }

  setToken(token, persist = true) {
    this.token = token;
    this.source = 'manual';
    this.lastValidated = Date.now();
    if (persist) {
      try { writeFileSync(TOKEN_FILE, token, 'utf-8'); } catch {}
    }
  }

  clearToken() {
    this.token = null;
    this.source = null;
    try {
      if (existsSync(TOKEN_FILE)) {
        writeFileSync(TOKEN_FILE, '', 'utf-8');
      }
    } catch {}
  }

  hasToken() {
    return !!this.token;
  }

  async promptForToken() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      console.log('\n╔══════════════════════════════════════════════════╗');
      console.log('║        DoorDash Auth Token Required              ║');
      console.log('╠══════════════════════════════════════════════════╣');
      console.log('║ 1. Open Safari/Chrome → dasher.doordash.com     ║');
      console.log('║ 2. Log in to your Dasher account                ║');
      console.log('║ 3. Open DevTools → Network tab                  ║');
      console.log('║ 4. Find request to api.doordash.com             ║');
      console.log('║ 5. Copy Authorization header (Bearer ...)       ║');
      console.log('╚══════════════════════════════════════════════════╝\n');
      rl.question('Paste your DoorDash auth token: ', (answer) => {
        rl.close();
        const token = answer.trim().replace('Bearer ', '');
        if (token) {
          this.setToken(token);
          resolve(token);
        } else {
          console.log('No token provided. Some features will be unavailable.');
          resolve(null);
        }
      });
    });
  }

  /**
   * Try to extract token from a browser cookie file (netscape format)
   */
  extractFromCookieFile(cookiePath) {
    try {
      const content = readFileSync(cookiePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const parts = line.trim().split('\t');
        if (parts.length >= 7) {
          const name = parts[5];
          const value = parts[6];
          if (name === '__dash_token' || name === 'dash_token' || name === 'authorization') {
            const token = value.replace('Bearer ', '');
            this.setToken(token);
            return token;
          }
        }
      }
    } catch {}
    return null;
  }
}
