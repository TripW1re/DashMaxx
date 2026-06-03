import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../components/Card';
import StatRow from '../components/StatRow';
import ProgressBar from '../components/ProgressBar';
import ProUpsell from '../components/ProUpsell';
import { showToast } from '../components/Toast';
import { THEME, REVENUE_TIERS, SACRAMENTO_ZONES } from '../utils/constants';
import { formatCurrency, formatDate, today } from '../utils/format';
import { calcRevenueShare } from '../utils/calculations';
import { getLocalState, saveToStorage } from '../services/localDb';

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState(getLocalState());
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ date: today(), earnings: '', hours: '', deliveries: '', mileage: '', zone: SACRAMENTO_ZONES[0].id });

  const refresh = () => { setState({ ...getLocalState() }); };

  const pro = state.settings.isPro;
  const totalEarnings = state.shifts.reduce((s, sh) => s + (sh.earnings || 0), 0);
  const totalHours = state.shifts.reduce((s, sh) => s + (sh.hours || 0), 0);
  const totalDeliveries = state.shifts.reduce((s, sh) => s + (sh.deliveries || 0), 0);
  const avgRate = totalHours > 0 ? totalEarnings / totalHours : 0;
  const totalMileage = state.shifts.reduce((s, sh) => s + (sh.mileage || 0), 0);
  const netEarnings = totalEarnings - totalMileage * 0.67;
  const sorted = [...state.shifts].sort((a, b) => b.date.localeCompare(a.date));

  const { currentTier, estimatedPayout } = calcRevenueShare(state.revenueShare, pro);
  const currentTierIdx = REVENUE_TIERS.findIndex(t => t.tier === state.revenueShare.tier);
  const nextTier = REVENUE_TIERS[currentTierIdx + 1];
  const tierProgress = [
    { label: 'Referrals', current: state.revenueShare.referrals, target: nextTier?.reqRef || 0 },
    { label: 'Shifts Logged', current: state.revenueShare.shiftsLogged, target: nextTier?.reqShifts || 0 },
    { label: 'Day Streak 🔥', current: state.revenueShare.streakDays, target: nextTier?.reqStreak || 0 },
    { label: 'Social Posts', current: state.revenueShare.socialPosts, target: nextTier?.reqPosts || 0 },
    { label: 'Meetups Attended', current: state.revenueShare.meetupsAttended, target: nextTier?.reqMeetups || 0 },
  ].filter(m => m.target > 0);

  const handleSave = async () => {
    const shift = {
      date: form.date,
      earnings: parseFloat(form.earnings) || 0,
      hours: parseFloat(form.hours) || 0,
      deliveries: parseInt(form.deliveries) || 0,
      mileage: parseFloat(form.mileage) || 0,
      zone: form.zone,
    };
    if (!shift.earnings && !shift.hours) { showToast('Enter at least earnings or hours'); return; }
    const newState = { ...state };
    newState.shifts = [...newState.shifts, shift];
    newState.revenueShare.shiftsLogged += 1;
    newState.revenueShare.monthEarnings = (newState.revenueShare.monthEarnings || 0) + shift.earnings;
    await saveToStorage(newState);
    setShowModal(false);
    setForm({ date: today(), earnings: '', hours: '', deliveries: '', mileage: '', zone: SACRAMENTO_ZONES[0].id });
    refresh();
    showToast('✅ Shift saved!');
  };

  const handleDelete = async (idx) => {
    const newState = { ...state };
    const removed = newState.shifts[idx];
    newState.shifts = newState.shifts.filter((_, i) => i !== idx);
    if (removed) newState.revenueShare.monthEarnings = Math.max(0, (newState.revenueShare.monthEarnings || 0) - (removed.earnings || 0));
    await saveToStorage(newState);
    refresh();
  };

  const handleAddReferral = async () => {
    const newState = { ...state };
    newState.revenueShare.referrals += 1;
    newState.settings.referralEarnings = (newState.settings.referralEarnings || 0) + 2.99;
    await saveToStorage(newState);
    refresh();
    showToast('🎉 Referral added! You earn 30% commission');
  };

  if (!pro) return <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]}><ProUpsell onPress={() => {}} /></ScrollView>;

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
      <Card glass>
        <Text style={styles.cardTitle}>💰 Lifetime Totals</Text>
        <StatRow items={[
          { value: formatCurrency(totalEarnings), label: 'Gross', color: THEME.green },
          { value: formatCurrency(netEarnings), label: 'Net (est.)', color: netEarnings > 0 ? THEME.green : THEME.red },
          { value: totalDeliveries.toString(), label: 'Deliveries' },
          { value: formatCurrency(avgRate), label: 'Avg $/hr' },
        ]} />
      </Card>

      <TouchableOpacity style={styles.revShareBanner}>
        <Text style={styles.revTitle}>💎 Revenue Share — {currentTier.label}</Text>
        <Text style={styles.revSub}>You've earned <Text style={{ fontWeight: '700' }}>{formatCurrency(state.revenueShare.monthEarnings)}</Text> this month · <Text style={{ fontWeight: '700' }}>{currentTier.share}%</Text> share tier</Text>
        <View style={styles.payoutBox}>
          <Text style={styles.payoutAmount}>{formatCurrency(estimatedPayout)}</Text>
          <Text style={styles.payoutLabel}>Estimated next payout</Text>
        </View>
      </TouchableOpacity>

      <Card>
        <Text style={styles.cardTitle}>📊 Tier Progress — {nextTier ? `Next: ${nextTier.label}` : '🏆 Max Tier Reached!'}</Text>
        {nextTier ? tierProgress.map((m, i) => (
          <View key={i} style={{ marginBottom: 8 }}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>{m.label}</Text>
              <Text style={[styles.progressCount, { color: m.current >= m.target ? THEME.green : THEME.text2 }]}>{m.current} / {m.target}</Text>
            </View>
            <ProgressBar value={m.current} max={m.target} color={m.current >= m.target ? THEME.green : THEME.accent} />
          </View>
        )) : <Text style={{ color: THEME.gold, fontSize: 16, textAlign: 'center' }}>🏆 YOU'RE AT MAX TIER! {formatCurrency(estimatedPayout)} estimated this month</Text>}
        <Text style={styles.tierNote}>{nextTier ? `Reach ${nextTier.label} to unlock ${nextTier.share}% revenue share` : 'You earn the maximum 50% revenue share!'}</Text>
      </Card>

      <TouchableOpacity style={[styles.btn, styles.btnPrimary, { marginBottom: 8 }]} onPress={() => setShowModal(true)}>
        <Text style={styles.btnPrimaryText}>+ Log New Shift</Text>
      </TouchableOpacity>

      {state.shifts.length === 0 ? (
        <Card><Text style={{ textAlign: 'center', color: THEME.text2, padding: 20 }}>No shifts logged yet. Start tracking!</Text></Card>
      ) : (
        <Card>
          <View style={styles.shiftHeader}>
            <Text style={styles.cardTitle}>📋 Shift History</Text>
            <Text style={styles.shiftCount}>{state.shifts.length} entries</Text>
          </View>
          {sorted.slice(0, 50).map((s, i) => (
            <View key={i} style={styles.shiftRow}>
              <Text style={styles.shiftDate}>{formatDate(s.date)}</Text>
              <Text style={[styles.shiftEarnings, { color: THEME.green }]}>{formatCurrency(s.earnings)}</Text>
              <Text style={styles.shiftSmall}>{s.hours?.toFixed(1)}h</Text>
              <Text style={styles.shiftSmall}>{s.hours > 0 ? formatCurrency(s.earnings / s.hours) + '/hr' : '-'}</Text>
              <Text style={styles.shiftSmall}>{s.deliveries || 0} del</Text>
              <TouchableOpacity onPress={() => handleDelete(i)}><Text style={{ color: THEME.red, fontSize: 16 }}>×</Text></TouchableOpacity>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <Text style={styles.cardTitle}>🤝 Referral Program</Text>
        <Text style={styles.referralCode}>dashmaxx.app/ref/{state.settings.referralCode}</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={() => { showToast('📋 Copied!'); }}><Text style={styles.btnSecondaryText}>📋 Copy Link</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={handleAddReferral}><Text style={styles.btnPrimaryText}>+ Add Referral</Text></TouchableOpacity>
        </View>
        <Text style={styles.referralNote}>{state.revenueShare.referrals} referrals · 30% lifetime commission on each subscription</Text>
      </Card>

      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>📝 Log Shift</Text>
            <TextInput style={styles.input} placeholder="Date (YYYY-MM-DD)" placeholderTextColor={THEME.text3} value={form.date} onChangeText={v => setForm({ ...form, date: v })} />
            <TextInput style={styles.input} placeholder="Earnings ($)" placeholderTextColor={THEME.text3} value={form.earnings} onChangeText={v => setForm({ ...form, earnings: v })} keyboardType="decimal" />
            <TextInput style={styles.input} placeholder="Hours" placeholderTextColor={THEME.text3} value={form.hours} onChangeText={v => setForm({ ...form, hours: v })} keyboardType="decimal" />
            <TextInput style={styles.input} placeholder="Deliveries" placeholderTextColor={THEME.text3} value={form.deliveries} onChangeText={v => setForm({ ...form, deliveries: v })} keyboardType="number-pad" />
            <TextInput style={styles.input} placeholder="Mileage" placeholderTextColor={THEME.text3} value={form.mileage} onChangeText={v => setForm({ ...form, mileage: v })} keyboardType="decimal" />
            <Text style={{ color: THEME.text2, fontSize: 12, marginBottom: 4 }}>Zone</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {SACRAMENTO_ZONES.map(z => (
                <TouchableOpacity key={z.id} style={[styles.zoneChip, form.zone === z.id && styles.zoneChipActive]} onPress={() => setForm({ ...form, zone: z.id })}>
                  <Text style={[styles.zoneChipText, form.zone === z.id && { color: '#fff' }]}>{z.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={() => setShowModal(false)}><Text style={styles.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={handleSave}><Text style={styles.btnPrimaryText}>Save</Text></TouchableOpacity>
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
  revShareBanner: { backgroundColor: THEME.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: THEME.accent },
  revTitle: { fontSize: 16, fontWeight: '700', color: THEME.accent },
  revSub: { fontSize: 12, color: THEME.text2, marginTop: 2 },
  payoutBox: { alignItems: 'center', marginTop: 8 },
  payoutAmount: { fontSize: 24, fontWeight: '800', color: THEME.green },
  payoutLabel: { fontSize: 11, color: THEME.text3 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressLabel: { fontSize: 12, color: THEME.text },
  progressCount: { fontSize: 12 },
  tierNote: { fontSize: 10, color: THEME.text3, marginTop: 6 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  btnPrimary: { backgroundColor: THEME.accent },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  btnSecondary: { backgroundColor: THEME.surface2, borderWidth: 1, borderColor: THEME.border },
  btnSecondaryText: { color: THEME.text, fontSize: 13 },
  shiftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftCount: { fontSize: 11, color: THEME.text3 },
  shiftRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: THEME.border },
  shiftDate: { fontSize: 12, color: THEME.text2, width: 50 },
  shiftEarnings: { fontSize: 13, fontWeight: '700', width: 60 },
  shiftSmall: { fontSize: 11, color: THEME.text2, width: 50, textAlign: 'right' },
  referralCode: { fontSize: 13, color: THEME.accent, fontWeight: '600', marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 6 },
  referralNote: { fontSize: 10, color: THEME.text3, marginTop: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: THEME.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: THEME.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: THEME.text, marginBottom: 14 },
  input: { backgroundColor: THEME.surface2, borderRadius: 8, padding: 10, color: THEME.text, fontSize: 14, marginBottom: 8, borderWidth: 1, borderColor: THEME.border },
  zoneChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: THEME.surface2, marginRight: 6, borderWidth: 1, borderColor: THEME.border },
  zoneChipActive: { backgroundColor: THEME.accent, borderColor: THEME.accent },
  zoneChipText: { fontSize: 12, color: THEME.text2 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
