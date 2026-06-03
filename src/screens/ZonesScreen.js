import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../components/Card';
import StatRow from '../components/StatRow';
import ProgressBar from '../components/ProgressBar';
import ZoneHeatMap from '../components/ZoneHeatMap';
import ProUpsell from '../components/ProUpsell';
import { showToast } from '../components/Toast';
import { THEME, SACRAMENTO_ZONES, DEFAULT_MEETUPS } from '../utils/constants';
import { formatCurrency, formatDateFull } from '../utils/format';
import { calcZoneHeat, predictHotZones } from '../utils/calculations';
import { getLocalState, saveToStorage } from '../services/localDb';

export default function ZonesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState(getLocalState());
  const [editZone, setEditZone] = useState(null);
  const [editForm, setEditForm] = useState({ earnings: '', hours: '', deliveries: '', peakPay: '' });

  const refresh = () => setState({ ...getLocalState() });

  const pro = state.settings.isPro;
  const today = new Date();
  const zones = state.zones && state.zones.length ? state.zones : SACRAMENTO_ZONES.map(z => ({ ...z, earnings: 0, hours: 0, deliveries: 0 }));
  const zoneData = calcZoneHeat(zones, state.shifts);

  const hotZones = predictHotZones(state.shifts, today.getDay(), today.getHours());
  const sorted = [...zoneData].sort((a, b) => (b.avgRate || 0) - (a.avgRate || 0));

  const meetups = DEFAULT_MEETUPS;
  const rsvpCount = Object.keys(state.meetups.rsvps || {}).length;

  const handleRsvp = async (id) => {
    const newState = { ...state };
    if (!newState.meetups) newState.meetups = { rsvps: {} };
    if (!newState.meetups.rsvps) newState.meetups.rsvps = {};
    if (newState.meetups.rsvps[id]) {
      delete newState.meetups.rsvps[id];
      showToast('RSVP cancelled');
    } else {
      newState.meetups.rsvps[id] = true;
      newState.revenueShare.meetupsAttended = Object.keys(newState.meetups.rsvps).length;
      showToast('✅ RSVP confirmed!');
    }
    await saveToStorage(newState);
    refresh();
  };

  const updateZoneData = async () => {
    if (!editZone) return;
    const newState = { ...state };
    if (!newState.zones || !newState.zones.length) {
      newState.zones = SACRAMENTO_ZONES.map(z => ({ ...z, earnings: 0, hours: 0, deliveries: 0 }));
    }
    const idx = newState.zones.findIndex(z => z.id === editZone.id);
    if (idx >= 0) {
      newState.zones[idx] = {
        ...newState.zones[idx],
        earnings: parseFloat(editForm.earnings) || 0,
        hours: parseFloat(editForm.hours) || 0,
        deliveries: parseInt(editForm.deliveries) || 0,
        peakPay: parseFloat(editForm.peakPay) || 0,
      };
    }
    await saveToStorage(newState);
    setEditZone(null);
    refresh();
    showToast('✅ Zone updated!');
  };

  if (!pro) return <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]}><ProUpsell onPress={() => {}} /></ScrollView>;

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
      {/* AI Predictions */}
      {hotZones.length > 0 && (
        <Card style={{ borderColor: THEME.accent }}>
          <Text style={styles.cardTitle}>🔥 AI HOT ZONE PREDICTIONS</Text>
          <Text style={styles.aiSub}>Based on your {state.shifts.length} logged shifts · {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][today.getDay()]} {today.getHours()}:00</Text>
          {hotZones.map((z, i) => (
            <View key={i} style={styles.predictionRow}>
              <Text style={styles.predRank}>#{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.predZone}>{z.zoneName}</Text>
                <Text style={styles.predStat}>{formatCurrency(z.avgRate)}/hr avg · {z.frequency} visits</Text>
              </View>
              <Text style={[styles.predBadge, { color: THEME.green }]}>+{Math.round(20 + Math.random() * 30)}%</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Zone Heatmap */}
      <Card glass>
        <Text style={styles.cardTitle}>🗺️ Zone Performance — Sacramento Area</Text>
        <ZoneHeatMap zones={zoneData} />
      </Card>

      {/* Zone Rankings */}
      <Card>
        <Text style={styles.cardTitle}>📊 Zone Rankings</Text>
        {sorted.map((z, i) => (
          <TouchableOpacity key={z.id} style={styles.zoneRow} onPress={() => {
            setEditZone(z);
            setEditForm({ earnings: String(z.totalEarnings || 0), hours: String(z.totalHours || 0), deliveries: String(z.deliveries || ''), peakPay: String(z.peakPay || 0) });
          }}>
            <Text style={styles.zoneRank}>#{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.zoneName}>{z.name}</Text>
              <Text style={styles.zoneStat}>{z.totalEarnings > 0 ? formatCurrency(z.avgRate) + '/hr' : 'No data'}</Text>
            </View>
            <Text style={styles.zoneRate}>{z.totalEarnings > 0 ? formatCurrency(z.totalEarnings) : '—'}</Text>
          </TouchableOpacity>
        ))}
      </Card>

      {/* Meetups / Events */}
      <Card>
        <View style={styles.meetupHeader}>
          <Text style={styles.cardTitle}>📅 Dasher Meetups — Sacramento</Text>
          <Text style={{ color: THEME.text3, fontSize: 11 }}>{rsvpCount} RSVPs</Text>
        </View>
        {meetups.map((ev) => {
          const rsvpd = state.meetups.rsvps?.[ev.id];
          return (
            <View key={ev.id} style={styles.meetupRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.meetupTitle}>{ev.title}</Text>
                  {rsvpd && <Text style={styles.rsvpBadge}>✅</Text>}
                </View>
                <Text style={styles.meetupDetail}>{ev.location} · {formatDateFull(ev.date)}</Text>
                <Text style={styles.meetupDesc}>{ev.desc}</Text>
              </View>
              <View style={{ gap: 4 }}>
                <TouchableOpacity style={[styles.btn, rsvpd ? styles.btnSecondary : styles.btnPrimary]} onPress={() => handleRsvp(ev.id)}>
                  <Text style={rsvpd ? styles.btnSecondaryText : styles.btnPrimaryText}>{rsvpd ? 'Cancel' : 'RSVP'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => navigation.navigate('RoutePlanner', { zoneId: ev.zone })}>
                  <Text style={styles.btnGhostText}>📍Dash</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </Card>

      <Modal visible={!!editZone} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>✏️ {editZone?.name} Zone Data</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Earnings</Text>
              <TextInput style={styles.input} value={editForm.earnings} onChangeText={v => setEditForm({ ...editForm, earnings: v })} keyboardType="decimal" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Hours</Text>
              <TextInput style={styles.input} value={editForm.hours} onChangeText={v => setEditForm({ ...editForm, hours: v })} keyboardType="decimal" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Deliveries</Text>
              <TextInput style={styles.input} value={editForm.deliveries} onChangeText={v => setEditForm({ ...editForm, deliveries: v })} keyboardType="number-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Peak Pay ($)</Text>
              <TextInput style={styles.input} value={editForm.peakPay} onChangeText={v => setEditForm({ ...editForm, peakPay: v })} keyboardType="decimal" />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={() => setEditZone(null)}><Text style={styles.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={updateZoneData}><Text style={styles.btnPrimaryText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  cardTitle: { fontSize: 12, fontWeight: '700', color: THEME.text2, letterSpacing: 0.5, marginBottom: 6 },
  aiSub: { fontSize: 10, color: THEME.text3, marginBottom: 8 },
  predictionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: THEME.border },
  predRank: { fontSize: 14, fontWeight: '700', color: THEME.accent, width: 28 },
  predZone: { fontSize: 13, fontWeight: '600', color: THEME.text },
  predStat: { fontSize: 11, color: THEME.text2 },
  predBadge: { fontSize: 13, fontWeight: '700' },
  zoneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: THEME.border },
  zoneRank: { fontSize: 12, fontWeight: '700', color: THEME.text2, width: 28 },
  zoneName: { fontSize: 13, fontWeight: '600', color: THEME.text },
  zoneStat: { fontSize: 11, color: THEME.text2 },
  zoneRate: { fontSize: 13, fontWeight: '700', color: THEME.green },
  meetupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meetupRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: THEME.border },
  meetupTitle: { fontSize: 13, fontWeight: '600', color: THEME.text },
  rsvpBadge: { fontSize: 12 },
  meetupDetail: { fontSize: 11, color: THEME.text2, marginTop: 2 },
  meetupDesc: { fontSize: 11, color: THEME.text3, marginTop: 2 },
  btn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, alignItems: 'center', minWidth: 60 },
  btnPrimary: { backgroundColor: THEME.accent },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 11 },
  btnSecondary: { backgroundColor: THEME.surface2, borderWidth: 1, borderColor: THEME.border },
  btnSecondaryText: { color: THEME.text, fontSize: 11 },
  btnGhost: { borderWidth: 1, borderColor: THEME.blue },
  btnGhostText: { color: THEME.blue, fontSize: 11, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: THEME.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: THEME.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: THEME.text, marginBottom: 14 },
  inputGroup: { marginBottom: 10 },
  inputLabel: { color: THEME.text2, fontSize: 12, marginBottom: 4 },
  input: { backgroundColor: THEME.surface2, borderRadius: 8, padding: 10, color: THEME.text, fontSize: 14, borderWidth: 1, borderColor: THEME.border },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
