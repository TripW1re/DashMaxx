import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../components/Card';
import ProgressBar from '../components/ProgressBar';
import ProUpsell from '../components/ProUpsell';
import { showToast } from '../components/Toast';
import { THEME, PLATINUM_TARGETS } from '../utils/constants';
import { calcTier } from '../utils/calculations';
import { getLocalState, saveToStorage } from '../services/localDb';

export default function PlatinumScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState(getLocalState());
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState({ ...state.platinum });

  const refresh = () => setState({ ...getLocalState() });

  const p = state.platinum;
  const t = PLATINUM_TARGETS;
  const tier = calcTier(p);
  const targets = [
    { label: 'Acceptance Rate', value: p.acceptanceRate, target: t.ar, pct: Math.min(100, (p.acceptanceRate / t.ar) * 100), color: p.acceptanceRate >= t.ar ? THEME.green : THEME.accent },
    { label: 'Completion Rate', value: p.completionRate, target: t.cr, pct: Math.min(100, (p.completionRate / t.cr) * 100), color: p.completionRate >= t.cr ? THEME.green : THEME.accent },
    { label: 'Customer Rating', value: p.customerRating, target: t.rating, pct: Math.min(100, (p.customerRating / t.rating) * 100), color: p.customerRating >= t.rating ? THEME.green : THEME.accent },
    { label: 'Deliveries This Period', value: p.deliveriesThisPeriod, target: t.deliveries, pct: Math.min(100, (p.deliveriesThisPeriod / t.deliveries) * 100), color: p.deliveriesThisPeriod >= t.deliveries ? THEME.green : THEME.accent },
  ];
  const overall = Math.round(targets.reduce((s, t) => s + t.pct, 0) / targets.length);

  if (!state.settings.isPro) return <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]}><ProUpsell onPress={() => {}} /></ScrollView>;

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
      <Card glass style={{ alignItems: 'center' }}>
        <View style={[styles.tierBadge, { backgroundColor: tier === 'platinum' ? 'rgba(165,243,252,0.15)' : tier === 'gold' ? 'rgba(234,179,8,0.15)' : tier === 'silver' ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.08)' }]}>
          <Text style={[styles.tierText, { color: tier === 'platinum' ? THEME.platinum : tier === 'gold' ? THEME.gold : tier === 'silver' ? '#cbd5e1' : THEME.text2 }]}>
            {tier === 'platinum' ? '💎' : tier === 'gold' ? '🥇' : tier === 'silver' ? '🥈' : '🥉'} {tier.charAt(0).toUpperCase() + tier.slice(1)}
          </Text>
        </View>
        <Text style={styles.currentStatus}>Current Status</Text>
        <TouchableOpacity style={styles.editBtn} onPress={() => { setForm({ ...p }); setEditModal(true); }}><Text style={styles.editBtnText}>✏️ Update Stats</Text></TouchableOpacity>
      </Card>

      <Card>
        <View style={styles.headerRow}>
          <Text style={styles.cardTitle}>🎯 Metrics vs Targets</Text>
          <Text style={[styles.overallScore, { color: overall >= 80 ? THEME.green : overall >= 50 ? THEME.yellow : THEME.red }]}>{overall}%</Text>
        </View>
        {targets.map((m, i) => (
          <View key={i} style={{ marginBottom: 10 }}>
            <View style={styles.targetRow}>
              <Text style={styles.targetLabel}>{m.label}</Text>
              <Text style={styles.targetValues}>
                <Text style={{ color: m.value >= m.target ? THEME.green : THEME.text }}>{m.value}</Text>
                <Text style={{ color: THEME.text3 }}> / {m.target}</Text>
              </Text>
            </View>
            <ProgressBar value={m.pct} color={m.color} height={8} />
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>🏆 All-Time Deliveries at Platinum</Text>
        <Text style={styles.platDeliveries}>{p.deliveriesAtPlatinum || 0}</Text>
        <Text style={{ color: THEME.text3, fontSize: 11 }}>Every delivery at Platinum status counts toward legacy.</Text>
      </Card>

      <Modal visible={editModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>✏️ Update Platinum Stats</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>AR %</Text>
              <TextInput style={styles.input} value={String(form.acceptanceRate)} onChangeText={v => setForm({ ...form, acceptanceRate: parseFloat(v) || 0 })} keyboardType="decimal" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CR %</Text>
              <TextInput style={styles.input} value={String(form.completionRate)} onChangeText={v => setForm({ ...form, completionRate: parseFloat(v) || 0 })} keyboardType="decimal" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Rating</Text>
              <TextInput style={styles.input} value={String(form.customerRating)} onChangeText={v => setForm({ ...form, customerRating: parseFloat(v) || 0 })} keyboardType="decimal" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Deliveries</Text>
              <TextInput style={styles.input} value={String(form.deliveriesThisPeriod)} onChangeText={v => setForm({ ...form, deliveriesThisPeriod: parseInt(v) || 0 })} keyboardType="number-pad" />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={() => setEditModal(false)}><Text style={styles.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={async () => {
                const newState = { ...state };
                newState.platinum = { ...form };
                await saveToStorage(newState);
                setEditModal(false);
                refresh();
                showToast('✅ Stats updated!');
              }}><Text style={styles.btnPrimaryText}>Save</Text></TouchableOpacity>
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
  tierBadge: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, marginBottom: 6 },
  tierText: { fontSize: 18, fontWeight: '800' },
  currentStatus: { fontSize: 12, color: THEME.text2, marginBottom: 8 },
  editBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: THEME.surface2, borderRadius: 6, borderWidth: 1, borderColor: THEME.border },
  editBtnText: { fontSize: 12, color: THEME.blue },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overallScore: { fontSize: 18, fontWeight: '800' },
  targetRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  targetLabel: { fontSize: 12, color: THEME.text },
  targetValues: { fontSize: 12 },
  platDeliveries: { fontSize: 32, fontWeight: '800', color: THEME.platinum, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: THEME.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: THEME.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: THEME.text, marginBottom: 14 },
  inputGroup: { marginBottom: 10 },
  inputLabel: { color: THEME.text2, fontSize: 12, marginBottom: 4 },
  input: { backgroundColor: THEME.surface2, borderRadius: 8, padding: 10, color: THEME.text, fontSize: 14, borderWidth: 1, borderColor: THEME.border },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  btnPrimary: { backgroundColor: THEME.accent },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  btnSecondary: { backgroundColor: THEME.surface2, borderWidth: 1, borderColor: THEME.border },
  btnSecondaryText: { color: THEME.text, fontSize: 13 },
});
