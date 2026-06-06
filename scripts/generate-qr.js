#!/usr/bin/env node
/**
 * generate-qr: Generate a QR code PNG for the running Expo dev server.
 * Run after `npm start` is up. Updates assets/expo-qr.png.
 */
const QRCode = require('qrcode');
const os = require('os');
const path = require('path');

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name]) {
      if (i.family === 'IPv4' && !i.internal) {
        // Prefer Wi-Fi/Ethernet interfaces
        if (name.match(/wi-fi|ethernet|wlan|eth|en0/i)) return i.address;
      }
    }
  }
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name]) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}

const port = process.env.EXPO_PORT || 8081;
const ip = process.env.EXPO_IP || getLocalIP();
const url = `exp://${ip}:${port}`;
const out = path.join(__dirname, '..', 'assets', 'expo-qr.png');

QRCode.toFile(out, url, {
  type: 'png', width: 512, margin: 2,
  color: { dark: '#00ff88', light: '#0a0e1a' },
}, (err) => {
  if (err) {
    console.error('Failed:', err);
    process.exit(1);
  }
  console.log(`✓ QR code written to ${out}`);
  console.log(`  URL: ${url}`);
  console.log(`  Scan with Expo Go on iPhone (must be on same Wi-Fi).`);
});
