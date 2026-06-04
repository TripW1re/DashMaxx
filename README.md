# DashMaxx — Waze for DoorDash Dashers

<p align="center">
  <img src="assets/expo-qr.png" width="200" alt="Scan with Expo Go" />
  <br/>
  <em>Scan with Expo Go on iOS</em>
</p>

AI-powered routing, real-time earnings tracking, zone heat maps, and community for Sacramento dashers.

## Architecture

```
DoorDash API ←→ MCP Server (cloud) ←→ Firebase/Firestore ←→ DashMaxx Mobile App
                     ↓
               AI Predictions (Cloud Functions)
```

- **Mobile App**: React Native (Expo) — iOS first, Android ready
- **MCP Server**: Node.js data pipeline — connects to DoorDash API, caches to Firestore
- **Firebase**: Auth, Firestore (cache + social data), Cloud Functions (AI predictions)
- **WebView Auto-Connect**: In-app DoorDash login with automatic Bearer token capture

## Screens

| Screen | Purpose |
|--------|---------|
| Home | KPI dashboard with live DoorDash sync status |
| Earnings | Rev share breakdown, shift log, referral earnings |
| Platinum | Dasher metrics vs Platinum targets |
| Zones | Heat map, zone meetups, AI predictions |
| Social | Dasher feed, leaderboard, profiles |
| Route Planner | Zone-to-zone routing, GPX export, AI route intelligence |
| Settings | DoorDash connection (auto-connect or manual token) |

## Quick Start

### Prerequisites
- Node.js 18+
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
# Add your DoorDash token to .env
npm start
```

### 3. Connect DoorDash
Open Settings → Auto-Connect → log into `dasher.doordash.com` → app auto-captures token

## MCP Server API

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server health + cache stats |
| `GET /sync/today` | Today's earnings (live from DoorDash) |
| `GET /sync/profile` | Dasher profile + ratings |
| `GET /sync/earnings` | Earnings by date range |
| `GET /sync/deliveries` | Delivery history |
| `GET /sync/all` | Full sync (profile + today + earnings) |
| `GET /predict` | AI zone predictions |
| `POST /token` | Set DoorDash Bearer token |

## Deployment

### MCP Server (Railway — Free)
```bash
npm install -g @railway/cli
railway login
cd mcp-server
railway up
```
Set `DD_AUTH_TOKEN` env var in Railway dashboard.

### Firebase Setup
1. Create project at [console.firebase.google.com](https://console.firebase.google.com/)
2. Enable Auth, Firestore, Cloud Functions
3. Replace `REPLACE_ME` values in `app.json` with your Firebase config
4. Deploy: `firebase deploy`

### App Store (Future)
```bash
npm install -g eas-cli
eas build --platform ios --profile production
```

## Tech Stack

- **Framework**: React Native with Expo SDK 52
- **Navigation**: React Navigation (native stack + bottom tabs)
- **State**: AsyncStorage (local-first) + Firebase (sync)
- **Maps**: react-native-maps with Apple Maps
- **Backend**: Node.js MCP Server + Firebase Cloud Functions
- **Auth**: Bearer token capture via WebView
