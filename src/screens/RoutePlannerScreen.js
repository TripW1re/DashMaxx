import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Card from '../components/Card';
import { showToast } from '../components/Toast';
import { THEME, SACRAMENTO_ZONES } from '../utils/constants';
import { formatCurrency } from '../utils/format';
import { predictHotZones } from '../utils/calculations';
import { getLocalState, subscribeToState } from '../services/localDb';

const haversineKm = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
};

export default function RoutePlannerScreen({ route }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState(getLocalState());
  const [selectedZone, setSelectedZone] = useState(SACRAMENTO_ZONES[0]);
  const [destinationZone, setDestinationZone] = useState(null);
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [pickerFor, setPickerFor] = useState('start');
  const [userLocation, setUserLocation] = useState(null);
  const [locStatus, setLocStatus] = useState('idle'); // idle | loading | granted | denied
  const [exporting, setExporting] = useState(false);

  useEffect(() => subscribeToState(() => setState({ ...getLocalState() })), []);

  useEffect(() => {
    (async () => {
      setLocStatus('loading');
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          setLocStatus('denied');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus('granted');
      } catch {
        setLocStatus('denied');
      }
    })();
  }, []);

  const today = new Date();
  const hotZones = predictHotZones(state.shifts, today.getDay(), today.getHours());

  const startZone = SACRAMENTO_ZONES.find(z => z.id === route?.params?.zoneId) || selectedZone;
  const destZone = SACRAMENTO_ZONES.find(z => z.id === destinationZone) || null;
  const startZoneData = hotZones.find(h => h.zoneId === startZone.id);

  // Deterministic AI delta: zone rate vs. your overall average
  const overallAvg = (() => {
    const allHours = state.shifts.reduce((s, sh) => s + (sh.hours || 0), 0);
    const allEarn = state.shifts.reduce((s, sh) => s + (sh.earnings || 0), 0);
    return allHours > 0 ? allEarn / allHours : 0;
  })();
  const aiDelta = startZoneData && overallAvg ? Math.round(((startZoneData.avgRate - overallAvg) / overallAvg) * 100) : null;

  // Distance estimates
  const userDist = userLocation ? haversineKm(userLocation, startZone) : null;
  const legDist = destZone ? haversineKm(startZone, destZone) : null;

  // GPX generation + export (real file → share sheet)
  const generateGpx = () => {
    const points = destZone ? [startZone, destZone] : [startZone];
    const name = `DashMaxx Route - ${startZone.name}${destZone ? ` to ${destZone.name}` : ''}`;
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="DashMaxx" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n    <name>${name}</name>\n    <trkseg>`;
    points.forEach(p => {
      gpx += `\n      <trkpt lat="${p.lat}" lon="${p.lng}"><name>${p.name}</name></trkpt>`;
    });
    gpx += `\n    </trkseg>\n  </trk>\n</gpx>\n`;
    return gpx;
  };

  const handleExportGpx = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const gpx = generateGpx();
      const file = new FileSystem.File(FileSystem.Paths.cache, 'dashmaxx-route.gpx');
      file.create({ overwrite: true });
      file.write(gpx);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/gpx+xml',
          dialogTitle: 'Export DashMaxx route',
        });
      } else {
        await Clipboard.setStringAsync(gpx);
        showToast('📄 GPX copied — sharing not available on this device');
      }
    } catch (e) {
      showToast('❌ Export failed: ' + (e?.message || 'unknown error'));
    }
    setExporting(false);
  };

  const handleCopyCoords = async () => {
    const coords = destZone
      ? `${startZone.name}: ${startZone.lat},${startZone.lng}\n${destZone.name}: ${destZone.lat},${destZone.lng}`
      : `${startZone.name}: ${startZone.lat},${startZone.lng}`;
    await Clipboard.setStringAsync(coords);
    showToast('📋 Coordinates copied!');
  };

  const handleSetZone = (zone, mode) => {
    if (mode === 'start') setSelectedZone(zone);
    else setDestinationZone(zone.id);
    setShowZonePicker(false);
  };

  const mapRegion = {
    latitude: (startZone.lat + (destZone?.lat ?? startZone.lat)) / 2,
    longitude: (startZone.lng + (destZone?.lng ?? startZone.lng)) / 2,
    latitudeDelta: Math.max(0.15, Math.abs(startZone.lat - (destZone?.lat ?? startZone.lat)) * 2 + 0.1),
    longitudeDelta: Math.max(0.15, Math.abs(startZone.lng - (destZone?.lng ?? startZone.lng)) * 2 + 0.1),
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
      {/* AI Route Insights */}
      <Card style={{ borderColor: THEME.accent }}>
        <Text style={styles.cardTitle}>🧠 AI ROUTE INTELLIGENCE</Text>
        {startZoneData ? (
          <View>
            <Text style={styles.aiTitle}>📍 {startZone.name}</Text>
            <Text style={styles.aiLine}>{formatCurrency(startZoneData.avgRate)}/hr avg · {startZoneData.frequency} visits · ${startZoneData.peakPay} peak pay</Text>
            <Text style={[styles.aiPrediction, { color: (aiDelta ?? 0) >= 0 ? THEME.green : THEME.red }]}>
              🔥 Predicted {(aiDelta ?? 0) >= 0 ? '+' : ''}{aiDelta ?? 0}% vs. your average today
            </Text>
          </View>
        ) : (
          <Text style={styles.aiEmpty}>Log shifts in this zone to enable AI predictions</Text>
        )}
      </Card>

      {/* Map */}
      <Card glass style={{ padding: 0, overflow: 'hidden' }}>
        <View style={styles.mapWrap}>
          <MapView
            style={styles.map}
            initialRegion={mapRegion}
            region={mapRegion}
            showsUserLocation={locStatus === 'granted'}
            loadingEnabled
          >
            {SACRAMENTO_ZONES.map(z => (
              <Marker
                key={z.id}
                coordinate={{ latitude: z.lat, longitude: z.lng }}
                pinColor={z.id === startZone.id ? THEME.accent : z.id === destinationZone ? THEME.green : THEME.blue}
                title={z.name}
                description={`Peak pay +$${z.peakPay.toFixed(1)}`}
              />
            ))}
            {destZone && (
              <Polyline
                coordinates={[{ latitude: startZone.lat, longitude: startZone.lng }, { latitude: destZone.lat, longitude: destZone.lng }]}
                strokeColor={THEME.accent}
                strokeWidth={3}
                lineDashPattern={[6, 4]}
              />
            )}
          </MapView>
        </View>
        <Text style={styles.mapHint}>Tap a pin for zone details</Text>
      </Card>

      {/* Route Planner */}
      <Card glass>
        <Text style={styles.cardTitle}>📍 Route Planner</Text>

        <TouchableOpacity style={styles.zoneSelector} onPress={() => { setPickerFor('start'); setShowZonePicker(true); }}>
          <Text style={styles.zoneLabel}>Start Zone</Text>
          <Text style={styles.zoneValue}>{startZone.name}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.zoneSelector} onPress={() => { setPickerFor('dest'); setShowZonePicker(true); }}>
          <Text style={styles.zoneLabel}>Destination (optional)</Text>
          <Text style={styles.zoneValue}>{destZone ? destZone.name : '— None —'}</Text>
        </TouchableOpacity>

        <View style={styles.routeInfo}>
          <Text style={styles.routeCoord}>Lat: {startZone.lat.toFixed(4)}, Lng: {startZone.lng.toFixed(4)}</Text>
          {locStatus === 'granted' && userDist != null && (
            <Text style={styles.routeDist}>📍 You are ~{userDist < 1 ? (userDist * 1000).toFixed(0) + ' m' : userDist.toFixed(1) + ' km'} from {startZone.name}</Text>
          )}
          {locStatus === 'denied' && (
            <Text style={styles.routeHint}>Enable location permission to see your distance to zones</Text>
          )}
          {destZone && (
            <Text style={styles.routeDist}>Distance: ~{legDist.toFixed(1)} km · Est. drive: {Math.round(legDist / 0.75)} min</Text>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={handleExportGpx} disabled={exporting}>
            <Text style={styles.btnPrimaryText}>{exporting ? '⏳ Exporting...' : '📄 Export GPX'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={handleCopyCoords}>
            <Text style={styles.btnSecondaryText}>📋 Copy Coords</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Hot Zones Quick Select */}
      <Card>
        <Text style={styles.cardTitle}>🔥 Hot Zones — Tap to Plan Route</Text>
        <View style={styles.presetGrid}>
          {SACRAMENTO_ZONES.map(z => (
            <TouchableOpacity
              key={z.id}
              style={[styles.presetBtn, startZone.id === z.id && styles.presetActive]}
              onPress={() => setSelectedZone(z)}
            >
              <Text style={[styles.presetName, startZone.id === z.id && styles.presetNameActive]}>{z.name}</Text>
              <Text style={styles.presetPay}>+${z.peakPay.toFixed(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* iOS/Android Setup Guide */}
      <Card>
        <Text style={styles.cardTitle}>ℹ️ Route Data Usage</Text>
        <Text style={styles.setupText}>
          DashMaxx uses your location to show nearby zones and plan optimal delivery routes.
          Your route data stays private and is only used to improve earnings predictions.
        </Text>
        <Text style={styles.setupText}>
          Export a GPX file to open the route in Apple Maps, Google Maps, or any GPS navigation app that supports GPX import.
        </Text>
      </Card>

      {/* Zone Picker Modal */}
      <Modal visible={showZonePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Select {pickerFor === 'start' ? 'Start' : 'Destination'} Zone</Text>
            <ScrollView>
              {SACRAMENTO_ZONES.map(z => (
                <TouchableOpacity key={z.id} style={styles.pickerRow} onPress={() => handleSetZone(z, pickerFor === 'start' ? 'start' : 'dest')}>
                  <Text style={styles.pickerName}>{z.name}</Text>
                  <Text style={styles.pickerPay}>+${z.peakPay.toFixed(1)} peak</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary, { marginTop: 10 }]} onPress={() => setShowZonePicker(false)}>
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  cardTitle: { fontSize: 12, fontWeight: '700', color: THEME.text2, letterSpacing: 0.5, marginBottom: 6 },
  aiTitle: { fontSize: 18, fontWeight: '700', color: THEME.text },
  aiLine: { fontSize: 12, color: THEME.text2, marginTop: 4 },
  aiPrediction: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  aiEmpty: { fontSize: 12, color: THEME.text3, fontStyle: 'italic' },
  mapWrap: { height: 240, borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden' },
  map: { flex: 1 },
  mapHint: { fontSize: 10, color: THEME.text3, textAlign: 'center', paddingVertical: 6 },
  zoneSelector: { backgroundColor: THEME.surface2, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: THEME.border },
  zoneLabel: { fontSize: 10, color: THEME.text3, marginBottom: 2 },
  zoneValue: { fontSize: 15, fontWeight: '600', color: THEME.text },
  routeInfo: { marginBottom: 10 },
  routeCoord: { fontSize: 12, color: THEME.text2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  routeDist: { fontSize: 12, color: THEME.green, marginTop: 2 },
  routeHint: { fontSize: 11, color: THEME.yellow, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6 },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center' },
  btnPrimary: { backgroundColor: THEME.accent },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  btnSecondary: { backgroundColor: THEME.surface2, borderWidth: 1, borderColor: THEME.border },
  btnSecondaryText: { color: THEME.text, fontSize: 12 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  presetBtn: { backgroundColor: THEME.surface2, borderRadius: 8, padding: 8, width: '30%', alignItems: 'center', borderWidth: 1, borderColor: THEME.border },
  presetActive: { borderColor: THEME.accent, backgroundColor: THEME.card },
  presetName: { fontSize: 11, color: THEME.text, fontWeight: '600' },
  presetNameActive: { color: THEME.accent },
  presetPay: { fontSize: 10, color: THEME.green, marginTop: 2 },
  setupText: { fontSize: 12, color: THEME.text2, lineHeight: 18, marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: THEME.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: THEME.border, maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: THEME.text, marginBottom: 14 },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: THEME.border },
  pickerName: { fontSize: 14, color: THEME.text, fontWeight: '600' },
  pickerPay: { fontSize: 12, color: THEME.green },
});
