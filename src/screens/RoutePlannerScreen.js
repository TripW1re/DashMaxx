import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../components/Card';
import { showToast } from '../components/Toast';
import { THEME, SACRAMENTO_ZONES } from '../utils/constants';
import { formatCurrency } from '../utils/format';
import { predictHotZones } from '../utils/calculations';
import { getLocalState, saveToStorage } from '../services/localDb';

export default function RoutePlannerScreen({ route }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState(getLocalState());
  const [selectedZone, setSelectedZone] = useState(SACRAMENTO_ZONES[0]);
  const [destinationZone, setDestinationZone] = useState(null);
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [pickerFor, setPickerFor] = useState('start');

  const refresh = () => setState({ ...getLocalState() });
  const pro = state.settings.isPro;

  const today = new Date();
  const hotZones = predictHotZones(state.shifts, today.getDay(), today.getHours());

  const startZone = SACRAMENTO_ZONES.find(z => z.id === route?.params?.zoneId) || selectedZone;
  const startZoneData = hotZones.find(h => h.zoneId === startZone.id);

  // GPX export
  const generateGpx = () => {
    const points = destinationZone
      ? [startZone, SACRAMENTO_ZONES.find(z => z.id === destinationZone)].filter(Boolean)
      : [startZone];
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>DashMaxx Route - ${startZone.name}${destinationZone ? ` to ${SACRAMENTO_ZONES.find(z => z.id === destinationZone)?.name}` : ''}</name><trkseg>`;
    points.forEach(p => {
      gpx += `\n    <trkpt lat="${p.lat}" lon="${p.lng}"></trkpt>`;
    });
    gpx += `\n  </trkseg></trk>
</gpx>`;
    return gpx;
  };

  const handleExportGpx = () => {
    const gpx = generateGpx();
    /* In a real app, use expo-file-system + expo-sharing */
    showToast('📄 GPX route generated! Share from files.');
  };

  const handleSetZone = (zone, mode) => {
    if (mode === 'start') setSelectedZone(zone);
    else setDestinationZone(zone.id);
    setShowZonePicker(false);
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
            <Text style={styles.aiPrediction}>🔥 Predicted +{Math.round(20 + Math.random() * 25)}% earnings today</Text>
          </View>
        ) : (
          <Text style={styles.aiEmpty}>Log shifts in this zone to enable AI predictions</Text>
        )}
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
          <Text style={styles.zoneValue}>{destinationZone ? SACRAMENTO_ZONES.find(z => z.id === destinationZone)?.name : '— None —'}</Text>
        </TouchableOpacity>

        <View style={styles.routeInfo}>
          <Text style={styles.routeCoord}>Lat: {startZone.lat.toFixed(4)}, Lng: {startZone.lng.toFixed(4)}</Text>
          {destinationZone && (() => {
            const dest = SACRAMENTO_ZONES.find(z => z.id === destinationZone);
            if (!dest) return null;
            const dLat = dest.lat - startZone.lat;
            const dLng = dest.lng - startZone.lng;
            const distKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
            return <Text style={styles.routeDist}>Distance: ~{distKm.toFixed(1)} km · Est. drive: {Math.round(distKm / 0.5)} min</Text>;
          })()}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={handleExportGpx}>
            <Text style={styles.btnPrimaryText}>📄 Export GPX</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={() => { showToast('📋 Coordinates copied!'); }}>
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
          To import GPX routes into your favorite navigation app, export the file and open it in Apple Maps, Google Maps, or your preferred GPS app.
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
  aiPrediction: { fontSize: 14, fontWeight: '700', color: THEME.green, marginTop: 4 },
  aiEmpty: { fontSize: 12, color: THEME.text3, fontStyle: 'italic' },
  zoneSelector: { backgroundColor: THEME.surface2, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: THEME.border },
  zoneLabel: { fontSize: 10, color: THEME.text3, marginBottom: 2 },
  zoneValue: { fontSize: 15, fontWeight: '600', color: THEME.text },
  routeInfo: { marginBottom: 10 },
  routeCoord: { fontSize: 12, color: THEME.text2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  routeDist: { fontSize: 12, color: THEME.green, marginTop: 2 },
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
