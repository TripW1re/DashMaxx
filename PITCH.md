# DashMaxx — Investor Demo Script (5 minutes)

## Opening (30 sec)

> "DashMaxx is Waze for DoorDash dashers. We turn raw delivery data into better decisions: where to dash, when to dash, and how to maximize earnings. What used to be a spreadsheet now lives in your pocket."

## Live Demo Flow (3.5 min)

### Step 1 — Open the App (15 sec)
- Open GitHub on laptop: https://github.com/TripW1re/DashMaxx
- Scan QR with iPhone camera → Expo Go opens DashMaxx
- *"One scan. No App Store. No install friction."*

### Step 2 — The Problem (30 sec)
- Open **Earnings** tab
- Show typical dasher pain: guesswork, manual tracking, no benchmarks
- *"Today, dashers earn $15-25/hr blind. They don't know which zones pay best, when, or why."*

### Step 3 — Connect to DoorDash (45 sec)
- Open **Settings** tab
- Tap **"Auto-Connect DoorDash"**
- WebView opens dasher.doordash.com — log in with real account
- The app **silently captures the auth token** and posts to our secure backend
- *"Zero friction onboarding. No copy-paste. No IT support needed."*

### Step 4 — Live Data (60 sec)
- Go back to **Home** → shows live earnings, weekly trend
- Tap **Platinum** → shows real metrics vs targets (acceptance, completion, rating)
- Tap **Zones** → AI-predicted hot zones for current time, with map
- *"This is real data. No mockups. The same data their boss sees, visualized for them."*

### Step 5 — The Differentiator (60 sec)
- Open **Route Planner** → input two zones → AI suggests route with GPX export
- Open **Social** → leaderboard shows top dashers, community feed
- *"It's not just tracking. It's routing, AI, and community. We turn solo work into a team sport."*

## The Ask (30 sec)

> "We need $XXX to ship to the App Store and expand beyond Sacramento.
> - 1M dashers in the US × $5/mo Pro subscription = $60M ARR
> - 0.1% market share in 12 months = 1,000 paying users = $60k ARR
> - 1% market share = 10,000 users = $600k ARR
> - 5% market share in 24 months = 50,000 users = $3M ARR"

## Closing (30 sec)

> "This is live. This is real. This is the future of gig work. Questions?"

---

## Backup Talking Points (if asked)

**Q: How do you get the data?**
A: We capture the Dasher's auth token via an in-app WebView login, then proxy requests to DoorDash's GraphQL API from our secure backend. The mobile app never sees raw credentials.

**Q: What about privacy?**
A: We never store PII on our servers. The token is encrypted at rest, scoped per user, and the user can disconnect at any time.

**Q: Why not just be a Chrome extension?**
A: Mobile-first. Dashers are in their car, not at a desk. The phone is the right form factor for real-time decisions.

**Q: What about Uber Eats, Instacart, etc.?**
A: Same architecture. We start with DoorDash because it's the largest. Adding more platforms is a 2-week integration.

**Q: What's the moat?**
A: Network effects on the social layer, plus 18 months of historical data feeding the AI prediction engine. The more dashers use it, the better the predictions get.
