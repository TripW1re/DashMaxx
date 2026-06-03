import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../components/Card';
import StatRow from '../components/StatRow';
import ProgressBar from '../components/ProgressBar';
import { THEME, TRIAL_DAYS } from '../utils/constants';
import { formatCurrency, formatDate, today } from '../utils/format';
import { calcTier, calcKpiScores } from '../utils/calculations';
import { getLocalState, saveToStorage } from '../services/localDb';

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState(getLocalState());
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setState(getLocalState());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const s = state;
  const pro = s.settings.isPro;
  const daysLeft = Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - s.settings.trialStart) / 86400000));

  const todayShifts = s.shifts.filter(sh => sh.date === today());
  const todayEarnings = todayShifts.reduce((sum, sh) => sum + (sh.earnings || 0), 0);
  const todayHours = todayShifts.reduce((sum, sh) => sum + (sh.hours || 0), 0);
  const todayDeliveries = todayShifts.reduce((sum, sh) => sum + (sh.deliveries || 0), 0);
  const hourlyRate = todayHours > 0 ? todayEarnings / todayHours : 0;
  const totalEarnings = s.shifts.reduce((sum, sh) => sum + (sh.earnings || 0), 0);
  const totalShifts = s.shifts.length;

  const tier = calcTier(s.platinum);
  const scores = calcKpiScores(s.shifts, s.social.posts, s.revenueShare.meetupsAttended, pro, daysLeft, tier);

  const handleLogShift = () => navigation.navigate('Earnings');

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
      {!pro && (
        <TouchableOpacity style={styles.trialBanner} onPress={() => navigation.navigate('Settings')}>
          <Text style={styles.trialTitle}>⭐ {daysLeft} Day{daysLeft !== 1 ? 's' : ''} Free Trial</Text>
          <Text style={styles.trialDesc}>Unlock Revenue Share, Social, KPI & all Pro features</Text>
        </TouchableOpacity>
      )}

      <Card style={{ borderColor: scores.platformHealth > 70 ? THEME.green : scores.platformHealth > 40 ? THEME.yellow : THEME.red, borderWidth: 2 }}>
        <View style={styles.kpiHeader}>
          <Text style={styles.cardTitle}>📊 SHAREHOLDER KPI DASHBOARD</Text>
          <View style={[styles.badge, { backgroundColor: scores.platformHealth > 70 ? THEME.greenBg : scores.platformHealth > 40 ? 'rgba(234,179,8,0.12)' : THEME.redBg }]}>
            <Text style={[styles.badgeText, { color: scores.platformHealth > 70 ? THEME.green : scores.platformHealth > 40 ? THEME.yellow : THEME.red }]}>{scores.platformHealth}/100</Text>
          </View>
        </View>
        <View style={styles.scoreContainer}>
          <Text style={[styles.mainScore, { color: scores.platformHealth > 70 ? THEME.green : scores.platformHealth > 40 ? THEME.yellow : THEME.red }]}>{scores.platformHealth}</Text>
          <Text style={styles.scoreLabel}>Platform Health Score</Text>
          <ProgressBar value={scores.platformHealth} color={scores.platformHealth > 70 ? THEME.green : scores.platformHealth > 40 ? THEME.yellow : THEME.red} height={8} />
        </View>
        <StatRow items={[
          { value: scores.growthScore, label: 'Growth', color: THEME.blue },
          { value: scores.revenueScore, label: 'Revenue', color: THEME.green },
          { value: scores.engagementScore, label: 'Engage', color: THEME.yellow },
          { value: scores.communityScore, label: 'Community', color: THEME.purple },
          { value: scores.retentionScore, label: 'Retention', color: THEME.blue },
          { value: scores.platRate, label: 'Plat Rate', color: THEME.gold },
        ]} />
      </Card>

      <Card style={{ borderColor: THEME.gold }}>
        <Text style={styles.cardTitle}>🚀 EXIT VALUATION PROJECTION</Text>
        <View style={styles.exitRow}>
          <View style={styles.exitItem}>
            <Text style={[styles.exitValue, { color: THEME.green }]}>{formatCurrency(scores.acquisitionValue)}</Text>
            <Text style={styles.exitLabel}>Projected @ {scores.projectedUsers} users</Text>
          </View>
          <View style={styles.exitDivider} />
          <View style={styles.exitItem}>
            <Text style={[styles.exitValue, { color: THEME.gold }]}>{formatCurrency(scores.yourShare)}</Text>
            <Text style={styles.exitLabel}>Your share</Text>
          </View>
          <View style={styles.exitDivider} />
          <View style={styles.exitItem}>
            <Text style={[styles.exitValue, { color: THEME.accent }]}>{scores.projectedUsers}</Text>
            <Text style={styles.exitLabel}>Users</Text>
          </View>
        </View>
        <Text style={styles.exitNote}>🍕 Every referral brings us closer to acquisition.</Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>📊 Today's Stats</Text>
        <StatRow items={[
          { value: formatCurrency(todayEarnings), label: 'Earnings', color: THEME.green },
          { value: todayDeliveries.toString(), label: 'Deliveries' },
          { value: todayHours.toFixed(1) + 'h', label: 'Active' },
          { value: formatCurrency(hourlyRate), label: '$/hr', color: hourlyRate > 20 ? THEME.green : hourlyRate > 15 ? THEME.yellow : THEME.red },
        ]} />
      </Card>

      <Card>
        <View style={styles.tierRow}>
          <Text style={styles.cardTitle}>⭐ Platinum Status</Text>
          <View style={[styles.badge, { backgroundColor: tier === 'platinum' ? 'rgba(165,243,252,0.12)' : tier === 'gold' ? 'rgba(234,179,8,0.12)' : 'rgba(148,163,184,0.12)' }]}>
            <Text style={[styles.badgeText, { color: tier === 'platinum' ? THEME.platinum : tier === 'gold' ? THEME.gold : THEME.text2 }]}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</Text>
          </View>
        </View>
        <Text style={styles.platStats}>AR: {s.platinum.acceptanceRate}% · CR: {s.platinum.completionRate}% · ⭐ {s.platinum.customerRating}</Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>🎯 Quick Actions</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleLogShift}><Text style={styles.btnPrimaryText}>+ Log Shift</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => navigation.navigate('Earnings')}><Text style={styles.btnSecondaryText}>Revenue Share</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => navigation.navigate('Social')}><Text style={styles.btnSecondaryText}>Community</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => navigation.navigate('Zones')}><Text style={styles.btnSecondaryText}>Meetups</Text></TouchableOpacity>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  trialBanner: { backgroundColor: THEME.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: THEME.accent },
  trialTitle: { fontSize: 16, fontWeight: '700', color: THEME.accent },
  trialDesc: { fontSize: 12, color: THEME.text2, marginTop: 2 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: THEME.text2, letterSpacing: 0.5, marginBottom: 6 },
  kpiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  scoreContainer: { alignItems: 'center', paddingVertical: 8 },
  mainScore: { fontSize: 42, fontWeight: '800' },
  scoreLabel: { fontSize: 11, color: THEME.text2, marginBottom: 4 },
  exitRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 8 },
  exitItem: { alignItems: 'center' },
  exitValue: { fontSize: 18, fontWeight: '700' },
  exitLabel: { fontSize: 10, color: THEME.text3, marginTop: 2 },
  exitDivider: { width: 1, height: 40, backgroundColor: THEME.border },
  exitNote: { fontSize: 10, color: THEME.text3, textAlign: 'center', marginTop: 6 },
  tierRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  platStats: { fontSize: 12, color: THEME.text2, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  btnPrimary: { backgroundColor: THEME.accent },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  btnSecondary: { backgroundColor: THEME.surface2, borderWidth: 1, borderColor: THEME.border },
  btnSecondaryText: { color: THEME.text, fontSize: 12 },
});
