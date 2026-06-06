# DashMaxx — Troubleshooting Guide

For senior devs and technical staff. Quick reference for known issues and fixes.

## Common Issues

### 1. "Port 8081 is being used by another process"
**Cause:** Previous Expo/Metro process didn't shut down cleanly.
**Fix:**
```bash
npm run prestart
# OR manually:
netstat -ano | findstr :8081
taskkill /F /PID <pid>
```

### 2. "Cannot find module 'babel-preset-expo'"
**Cause:** SDK upgrade missed the babel preset.
**Fix:**
```bash
npm install babel-preset-expo
```

### 3. "Invalid Version" during npm install (npm 10.x bug)
**Cause:** npm 10.9.x has a deduplication bug with `@expo/image-utils`.
**Fix:** Use Yarn or older npm:
```bash
npm install --legacy-peer-deps --no-optional
# OR
yarn install
```

### 4. Expo Go says "Update SDK to 54.0.0" (or similar)
**Cause:** App SDK version is older than what Expo Go supports.
**Fix:** Update `expo` and all `expo-*` packages in package.json to match latest:
```bash
npx expo install --fix
```

### 5. "Module not found: Can't resolve 'Momo's...'" (or similar syntax error)
**Cause:** Apostrophe in single-quoted JS string (e.g. `Momo's`).
**Fix:** Use double quotes or escape: `"Momo's"` or `'Momo\\'s'`

### 6. MCP server returns 500 on /sync/today
**Cause:** DoorDash token missing or expired (24h TTL).
**Fix:** Re-capture token via in-app WebView auto-connect, or:
```bash
curl -X POST https://artistic-reflection-production.up.railway.app/token \
  -H "Content-Type: application/json" \
  -d '{"token":"DDV1_..."}'
```

### 7. iPhone can't connect to Expo on Wi-Fi
**Cause:** Windows Firewall blocking port 8081.
**Fix:** Allow Node.js through Windows Firewall when prompted, or:
```powershell
New-NetFirewallRule -DisplayName "Expo Metro" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow
```

### 8. QR code in README points to wrong IP
**Cause:** Local IP changes when reconnecting to Wi-Fi.
**Fix:** Regenerate after each session:
```bash
npm run qr
```

## Verifying the Build

```bash
npm run bundle:check
```
Should output: `iOS Bundled Xms App.js (N modules)` with no errors.

## Quick Health Checks

| What | Command |
|------|---------|
| Metro running | `curl http://localhost:8081` |
| MCP server alive | `curl https://artistic-reflection-production.up.railway.app/health` |
| Firebase config valid | `npm run validate:firebase` |
| Port 8081 free | `npm run prestart` |

## Architecture Reference

```
iPhone (Expo Go)
    ↓ exp://192.168.1.69:8081
Metro Bundler (localhost:8081)
    ↓ JS bundle
DashMaxx app (React Native)
    ↓ fetch()
MCP Server (Railway, HTTPS)
    ↓ Bearer token
DoorDash GraphQL API
    ↓ real data
Firestore cache ← → Realtime sync to app
```

## File Map

| Path | Purpose |
|------|---------|
| `App.js` | Root, sets up Stack navigator + ConnectDoorDash modal |
| `src/navigation/TabNavigator.js` | Bottom tabs (Home/Earnings/Platinum/Zones/Social/Route/Settings) |
| `src/screens/HomeScreen.js` | KPI dashboard |
| `src/screens/ConnectDoorDashScreen.js` | WebView auto-connect (token capture) |
| `src/screens/SettingsScreen.js` | MCP URL, manual token paste, Auto-Connect button |
| `src/services/mcpClient.js` | Talks to MCP server, merges DoorDash data into local state |
| `src/services/localDb.js` | AsyncStorage wrapper (works offline) |
| `mcp-server/src/index.js` | MCP server entry, REST API |
| `mcp-server/src/clients/doorDashClient.js` | TLS-fingerprinted DoorDash GraphQL client |
| `mcp-server/src/lib/tokenManager.js` | Token storage (env, file, runtime) |
| `functions/index.js` | Cloud Functions for AI predictions (deferred) |
| `scripts/prestart.js` | Frees port 8081 |
| `scripts/generate-qr.js` | Generates QR for current IP |
| `scripts/validate-firebase.js` | Validates Firebase config |
