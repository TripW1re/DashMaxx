export const THEME = {
  bg: '#0a0e1a',
  surface: '#131827',
  surface2: '#1a2035',
  card: '#1e2640',
  card2: '#252e4a',
  border: '#2a3555',
  text: '#e8ecf4',
  text2: '#8892b0',
  text3: '#5a6488',
  accent: '#ff6b35',
  accent2: '#ff8a5c',
  green: '#22c55e',
  greenBg: 'rgba(34,197,94,0.12)',
  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.12)',
  yellow: '#eab308',
  gold: '#f59e0b',
  blue: '#3b82f6',
  purple: '#a855f7',
  platinum: '#a5f3fc',
};

export const TRIAL_DAYS = 14;
export const SUBSCRIPTION_PRICE = 9.99;

export const SACRAMENTO_ZONES = [
  { id: 'downtown', name: 'Downtown Sac', lat: 38.5816, lng: -121.4944, peakPay: 4.0 },
  { id: 'midtown', name: 'Midtown', lat: 38.5757, lng: -121.4788, peakPay: 3.5 },
  { id: 'elk-grove', name: 'Elk Grove', lat: 38.4088, lng: -121.3716, peakPay: 3.0 },
  { id: 'folsom', name: 'Folsom', lat: 38.6780, lng: -121.1755, peakPay: 2.5 },
  { id: 'roseville', name: 'Roseville', lat: 38.7521, lng: -121.2880, peakPay: 2.0 },
  { id: 'natomas', name: 'Natomas', lat: 38.6495, lng: -121.5026, peakPay: 3.0 },
  { id: 'east-sac', name: 'East Sac', lat: 38.5700, lng: -121.4500, peakPay: 3.5 },
  { id: 'south-sac', name: 'South Sac', lat: 38.5100, lng: -121.4900, peakPay: 2.5 },
];

export const REVENUE_TIERS = [
  { tier: 'bronze', label: 'Bronze', reqRef: 5, reqShifts: 10, reqStreak: 0, reqPosts: 0, reqMeetups: 0, share: 10 },
  { tier: 'silver', label: 'Silver', reqRef: 15, reqShifts: 30, reqStreak: 7, reqPosts: 0, reqMeetups: 0, share: 20 },
  { tier: 'gold', label: 'Gold', reqRef: 30, reqShifts: 60, reqStreak: 14, reqPosts: 5, reqMeetups: 0, share: 30 },
  { tier: 'platinum', label: 'Platinum', reqRef: 50, reqShifts: 100, reqStreak: 30, reqPosts: 15, reqMeetups: 3, share: 50 },
];

export const PLATINUM_TARGETS = { ar: 70, cr: 95, rating: 4.7, deliveries: 100 };

export const DEFAULT_MEETUPS = [
  { id: 'm1', title: 'Tuesday Lunch Rush Strategy', zone: 'downtown', location: 'Temple Coffee, 9th & K St', date: '2026-06-09T11:30', desc: 'Share lunch rush tips over coffee' },
  { id: 'm2', title: 'South Sac Dinner Blitz', zone: 'south-sac', location: "Momo's Pizza, Florin Rd", date: '2026-06-11T17:00', desc: 'Dinner rush — learn peak zone tactics' },
  { id: 'm3', title: 'Elk Grove Weekend Warriors', zone: 'elk-grove', location: 'Sac Brew Bike, Elk Grove Blvd', date: '2026-06-14T10:00', desc: 'Weekend optimization and route planning' },
  { id: 'm4', title: 'Roseville Mall Mastery', zone: 'roseville', location: 'The Falls Event Center', date: '2026-06-18T14:00', desc: 'Mall orders — stack efficiently' },
  { id: 'm5', title: 'Folsom Lake Night Run', zone: 'folsom', location: 'Lake Park Brewery', date: '2026-06-21T20:00', desc: 'Late-night dashing — safety + earnings' },
  { id: 'm6', title: 'Midtown Brunch Social', zone: 'midtown', location: 'Tower Cafe, Broadway', date: '2026-06-28T09:00', desc: 'Brunch orders and networking' },
];
