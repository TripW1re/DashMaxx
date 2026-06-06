#!/usr/bin/env node
/**
 * validate-firebase: Verify Firebase config is present and well-formed.
 * Does NOT make network calls — just checks the config is usable.
 */
const fs = require('fs');
const path = require('path');

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
const extra = appJson.expo.extra || {};

const required = [
  'firebaseApiKey',
  'firebaseAuthDomain',
  'firebaseProjectId',
  'firebaseStorageBucket',
  'firebaseMessagingSenderId',
  'firebaseAppId',
];

let ok = true;
console.log('Firebase config validation:');
for (const key of required) {
  const v = extra[key];
  if (!v || v === 'REPLACE_ME') {
    console.log(`  ❌ ${key}: MISSING or placeholder`);
    ok = false;
  } else {
    console.log(`  ✓ ${key}: ${v.substring(0, 12)}...`);
  }
}

if (ok) {
  console.log('\n✓ All Firebase config values are set.');
  console.log(`  Project: ${extra.firebaseProjectId}`);
  console.log(`  Auth:    ${extra.firebaseAuthDomain}`);
  console.log('\n  Make sure to:');
  console.log('  1. Enable Anonymous auth in Firebase console');
  console.log('  2. Create Firestore database in test mode');
  console.log('  3. The app will auto-detect and connect on first run');
} else {
  console.log('\n❌ Firebase config is incomplete. Update app.json "extra" section.');
  process.exit(1);
}
