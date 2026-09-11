# DashMaxx — Waze for DoorDash Dashers

<p align="center">
  <img src="assets/expo-qr.png" width="200" alt="Scan with Expo Go" />
  <br/>
  <em>Scan with Expo Go on iOS</em>
</p>

AI-powered routing, real-time earnings tracking, zone heat maps, and community for Sacramento dashers.

## Architecture

```
DoorDash API ←→ MCP Server (cloud) ←→ Firestore cache + AI predictions
                     ↓                          ↓
              DashMaxx Mobile App ←→ Firebase Auth (anonymous) + Firestore
                                                     ↓
                                           Community feed, leaderboard, RSVPs
```

- **Mobile App**: React Native (Expo SDK 56) — iOS first, Android ready
- **MCP Server**: Node.js data pipeline — connects to DoorDash API, caches to Firestore, serves predictions
- **Firebase**: Auth (anonymous), Firestore (cache + community), Cloud Functions (AI predictions)
- **WebView Auto-Connect**: In-app DoorDash login with automatic Bearer token capture — the token is sent to your MCP server and never stored on the device

## Screens

| Screen | Purpose |
|--------|---------|
| Home | KPI dashboard with live DoorDash sync status + pull-to-refresh |
| Earnings | Rev share breakdown, shift log with validation, referral earnings |
| Platinum | Dasher metrics vs Platinum targets |
| Zones | Heat map, zone meetups with live RSVP counts, AI predictions (live DoorDash or local data) |
| Social | Community feed, real leaderboard (Firestore), profiles, tips |
| Route Planner | Zone-to-zone routing with real map, GPS distance, GPX export, copy coordinates |
| Settings | DoorDash connection (auto-connect or manual token), MCP URL + API key, backups |

## Quick Start

### Prerequisites
- Node.js 20+ (22+ recommended)
- Expo Go (iOS App Store)
- DoorDash Dasher account

### 1. Run the app
```bash
cd DashMaxx
npm install
npx expo start
# Scan QR code with Expo Go
```

### 2. Run the MCP server (local dev)
```bash
cd DashMaxx/mcp-server
npm install
cp .env.example .env
# Add your DoorDash token and (optionally) DD_API_KEY to .env
npm start
```

### 3. Connect DoorDash
Open Settings → Configure → **Auto-Connect** → log into `dasher.doordash.com` → the app captures the token and sends it to your MCP server. Nothing DoorDash-related is stored on the phone.

## MCP Server API

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server health + cache stats (public) |
| `GET /stats` | Sync stats |
| `GET /sync/profile` | Dasher profile + ratings |
| `GET /sync/today` | Today's earnings (live from DoorDash) |
| `GET /sync/earnings?startDate=&endDate=` | Earnings by date range |
| `GET /sync/deliveries?limit=&offset=` | Delivery history |
| `GET /sync/all` | Full sync (profile + today + earnings + deliveries) |
| `GET /predict?day=&hour=` | AI zone predictions |
| `POST /token` | Set DoorDash Bearer token (validated) |
| `POST /sync/run` | Trigger manual sync |

**Security**: set `DD_API_KEY` on the server and the same value in the app (Settings → Configure → MCP API Key). When set, every endpoint except `/health` and `/` requires the `x-api-key` header. The server also rate-limits requests per IP and validates all inputs.

## Testing

```bash
npm test               # app unit tests (Jest + jest-expo)
npm run test:mcp       # MCP server tests (node:test)
npm run lint           # ESLint via expo lint
npm run bundle:check   # iOS production bundle export
npm run validate:firebase  # Firebase config validation
```

## Deployment

### MCP Server (Railway — Free)
```bash
npm install -g @railway/cli
railway login
cd mcp-server
railway up
```
Set `DD_AUTH_TOKEN` and (recommended) `DD_API_KEY` env vars in the Railway dashboard.

### Firebase Setup
1. Create project at [console.firebase.google.com](https://console.firebase.google.com/)
2. Enable Auth (Anonymous sign-in), Firestore, Cloud Functions
3. Update the `extra` values in `app.json` with your Firebase config (or set `EXPO_PUBLIC_FIREBASE_*` env vars)
4. Deploy security rules: `firebase deploy --only firestore:rules`
5. Deploy functions: `cd functions && npm install && firebase deploy --only functions`

Without Firebase configuration the app runs fully offline (local data, local feed) — nothing breaks.

### App Store (Future)
```bash
npm install -g eas-cli
eas build --platform ios --profile production
```

## Tech Stack

- **Framework**: React Native with Expo SDK 56
- **Navigation**: React Navigation (native stack + bottom tabs)
- **State**: AsyncStorage (local-first) + Firestore (community + cache)
- **Maps**: react-native-maps (Apple Maps on iOS / Google Maps on Android via Expo Go)
- **Backend**: Node.js MCP Server + Firebase Cloud Functions
- **Auth**: Anonymous Firebase Auth + DoorDash token kept server-side only

## Data Privacy

- DoorDash credentials are captured once and held **only** on your MCP server
- Export/import backups never include auth tokens
- Firestore security rules scope all private data to the authenticated user
