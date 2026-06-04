import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../components/Card';
import { showToast } from '../components/Toast';
import { THEME, TRIAL_DAYS, PLATINUM_TARGETS } from '../utils/constants';
import { formatCurrency, daysSince } from '../utils/format';
import { getLocalState, saveToStorage, resetLocalState } from '../services/localDb';
import { checkConnection, setMcpUrl, setDoorDashToken, syncAllFromDoorDash, getMcpUrl, startBackgroundSync, isConnected } from '../services/mcpClient';

const generateReferralCode = () => 'DASH-' + Math.random().toString(36).substring(2, 8).toUpperCase();

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState(getLocalState());
  const [showReset, setShowReset] = useState(false);
  const [showDoorDash, setShowDoorDash] = useState(false);
  const [ddToken, setDdToken] = useState('');
  const [mcpUrlInput, setMcpUrlInput] = useState('https://artistic-reflection-production.up.railway.app');
  const [mcpConnected, setMcpConnected] = useState(false);
  const [mcpStatus, setMcpStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(state.settings.lastDoorDashSync || null);

  const refresh = () => { const s = getLocalState(); setState({ ...s }); setLastSync(s.settings?.lastDoorDashSync || null); };

  useEffect(() => {
    (async () => {
      const url = await getMcpUrl();
      setMcpUrlInput(url);
      const health = await checkConnection();
      setMcpConnected(health.connected);
      setMcpStatus(health);
    })();
  }, []);

  const daysLeft = Math.max(0, TRIAL_DAYS - daysSince(state.settings.trialStart));
  const pro = state.settings.isPro;

  const togglePro = async () => {
    const newState = { ...state };
    newState.settings.isPro = !newState.settings.isPro;
    if (newState.settings.isPro) newState.settings.trialStart = Date.now();
    await saveToStorage(newState);
    refresh();
    showToast(newState.settings.isPro ? '🎉 Pro activated!' : 'Pro deactivated');
  };

  const updateTarget = async (key, value) => {
    const newState = { ...state };
    newState.settings.platinumTargets[key] = value;
    await saveToStorage(newState);
    refresh();
  };

  const handleReset = async () => {
    await resetLocalState();
    setShowReset(false);
    refresh();
    showToast('🗑️ All data cleared');
  };

  const handleConnectDoorDash = async () => {
    setSyncing(true);
    try {
      // Set MCP server URL
      await setMcpUrl(mcpUrlInput);
      // Send DoorDash token to MCP server
      const tokenToSend = ddToken.trim().replace('Bearer ', '');
      if (tokenToSend) {
        try { await setDoorDashToken(tokenToSend); } catch {}
      }
      // Check connection
      const health = await checkConnection();
      setMcpConnected(health.connected);
      if (health.connected) {
        // Start sync
        const result = await syncAllFromDoorDash();
        if (result.success) {
          setLastSync(new Date().toISOString());
          await startBackgroundSync(5);
          showToast('✅ DoorDash connected! Dashboard synced.');
        } else {
          showToast('⚠️ Connected but sync failed: ' + (result.error || 'unknown'));
        }
      } else {
        showToast('⚠️ MCP server not reachable at ' + mcpUrlInput);
      }
      setMcpStatus(health);
    } catch (e) {
      showToast('❌ Connection failed: ' + e.message);
    }
    setSyncing(false);
    setShowDoorDash(false);
    refresh();
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const result = await syncAllFromDoorDash();
      if (result.success) {
        setLastSync(new Date().toISOString());
        showToast('✅ Sync complete! ' + (result._duration || '') + 'ms');
      } else {
        showToast('⚠️ Sync issue: ' + (result.error || 'unknown'));
      }
      refresh();
    } catch (e) {
      showToast('❌ Sync failed: ' + e.message);
    }
    setSyncing(false);
  };

  const handleExport = () => { showToast('📄 Export via MCP server'); };
  const handleImport = () => { showToast('📂 Import via MCP server'); };

  const syncTime = lastSync ? new Date(lastSync).toLocaleTimeString() : null;

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
      <Card glass>
        <Text style={styles.cardTitle}>⚙️ Settings</Text>
      </Card>

      {/* DoorDash Connection Status */}
      <Card style={{ borderColor: mcpConnected ? THEME.green : THEME.red, borderWidth: 1 }}>
        <View style={styles.ddHeader}>
          <Text style={styles.cardTitle}>🚚 DOORDASH LIVE CONNECTION</Text>
          <View style={[styles.statusDot, { backgroundColor: mcpConnected ? THEME.green : THEME.red }]} />
        </View>
        {mcpConnected ? (
          <View>
            <Text style={{ color: THEME.green, fontSize: 14, fontWeight: '700' }}>✅ MCP Server Connected</Text>
            <Text style={{ color: THEME.text2, fontSize: 11, marginTop: 2 }}>
              {syncTime ? `Last sync: ${syncTime}` : 'Ready to sync'}
              {mcpStatus?.api?.successes != null ? ` · ${mcpStatus.api.successes} API calls` : ''}
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={handleManualSync} disabled={syncing}>
                <Text style={styles.btnPrimaryText}>{syncing ? '⏳ Syncing...' : '🔄 Sync Now'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={() => navigation?.navigate('ConnectDoorDash')}>
                <Text style={styles.btnSecondaryText}>⚙️ Configure</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View>
            <Text style={{ color: THEME.red, fontSize: 14, fontWeight: '700' }}>❌ Not Connected</Text>
            <Text style={{ color: THEME.text2, fontSize: 11, marginTop: 2 }}>Set up MCP server to pull live DoorDash data</Text>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary, { marginTop: 8 }]} onPress={() => navigation?.navigate('ConnectDoorDash')}>
              <Text style={styles.btnPrimaryText}>🔗 Connect DoorDash</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>{pro ? '💎 Pro Member' : '⭐ Free Trial'}</Text>
        <View style={styles.trialRow}>
          {pro ? (
            <Text style={{ color: THEME.gold, fontSize: 16, fontWeight: '700' }}>🎉 Unlimited access</Text>
          ) : (
            <Text style={{ color: THEME.accent, fontSize: 16, fontWeight: '700' }}>{daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining</Text>
          )}
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={togglePro}>
          <Text style={styles.btnPrimaryText}>{pro ? 'Deactivate Pro' : 'Activate Pro (Testing)'}</Text>
        </TouchableOpacity>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>🎯 Platinum Targets</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>AR %</Text>
          <TextInput style={styles.input} value={String(state.settings.platinumTargets?.ar || PLATINUM_TARGETS.ar)} onChangeText={v => updateTarget('ar', parseFloat(v) || 0)} keyboardType="decimal" />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>CR %</Text>
          <TextInput style={styles.input} value={String(state.settings.platinumTargets?.cr || PLATINUM_TARGETS.cr)} onChangeText={v => updateTarget('cr', parseFloat(v) || 0)} keyboardType="decimal" />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Rating</Text>
          <TextInput style={styles.input} value={String(state.settings.platinumTargets?.rating || PLATINUM_TARGETS.rating)} onChangeText={v => updateTarget('rating', parseFloat(v) || 0)} keyboardType="decimal" />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Deliveries</Text>
          <TextInput style={styles.input} value={String(state.settings.platinumTargets?.deliveries || PLATINUM_TARGETS.deliveries)} onChangeText={v => updateTarget('deliveries', parseInt(v) || 0)} keyboardType="number-pad" />
        </View>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>📦 Data</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={handleExport}><Text style={styles.btnSecondaryText}>📤 Export</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={handleImport}><Text style={styles.btnSecondaryText}>📂 Import</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: THEME.redBg, borderWidth: 1, borderColor: THEME.red }]} onPress={() => setShowReset(true)}>
            <Text style={{ color: THEME.red, fontWeight: '600', fontSize: 12 }}>🗑️ Clear</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>📋 Referral Code</Text>
        <Text style={styles.referralCode}>{state.settings.referralCode || generateReferralCode()}</Text>
        <Text style={{ color: THEME.text3, fontSize: 11, marginTop: 4 }}>Share this code with other dashers to earn 30% commission</Text>
      </Card>

      {/* DoorDash Config Modal (manual fallback) */}
      <Modal visible={showDoorDash} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>🔗 DoorDash Configuration</Text>
            <Text style={{ color: THEME.text2, fontSize: 12, marginBottom: 12 }}>
              Auto-connect is the easiest way. Tap below to log in to DoorDash right in the app.
            </Text>

            <TouchableOpacity style={[styles.btn, styles.btnPrimary, { marginBottom: 12 }]} onPress={() => { setShowDoorDash(false); navigation?.navigate('ConnectDoorDash'); }}>
              <Text style={styles.btnPrimaryText}>🔐 Auto-Connect (Recommended)</Text>
            </TouchableOpacity>

            <Text style={{ color: THEME.text3, fontSize: 11, textAlign: 'center', marginBottom: 12 }}>— OR manual setup —</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>MCP Server URL</Text>
              <TextInput style={styles.input} value={mcpUrlInput} onChangeText={setMcpUrlInput} placeholder="http://localhost:3100" placeholderTextColor={THEME.text3} autoCapitalize="none" />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>DoorDash Auth Token (manual)</Text>
              <TextInput style={[styles.input, { height: 80 }]} value={ddToken} onChangeText={setDdToken} placeholder="Paste your Bearer token" placeholderTextColor={THEME.text3} multiline autoCapitalize="none" />
            </View>

            <TouchableOpacity style={styles.helpBtn} onPress={() => showToast('Use Auto-Connect instead — it captures the token automatically')}>
              <Text style={{ color: THEME.blue, fontSize: 11 }}>💡 Tip: Use Auto-Connect above</Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={() => setShowDoorDash(false)}>
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={handleConnectDoorDash} disabled={syncing}>
                <Text style={styles.btnPrimaryText}>{syncing ? '⏳ Connecting...' : 'Manual Connect'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reset Modal */}
      <Modal visible={showReset} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>🗑️ Clear All Data?</Text>
            <Text style={{ color: THEME.text2, fontSize: 13, marginBottom: 14 }}>This will delete all shifts, posts, and settings. Cannot be undone.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={() => setShowReset(false)}><Text style={styles.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: THEME.red }]} onPress={handleReset}><Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Delete All</Text></TouchableOpacity>
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
  trialRow: { marginBottom: 10 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  btnPrimary: { backgroundColor: THEME.accent },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  btnSecondary: { backgroundColor: THEME.surface2, borderWidth: 1, borderColor: THEME.border },
  btnSecondaryText: { color: THEME.text, fontSize: 12 },
  inputGroup: { marginBottom: 10 },
  inputLabel: { color: THEME.text2, fontSize: 12, marginBottom: 4 },
  input: { backgroundColor: THEME.surface2, borderRadius: 8, padding: 10, color: THEME.text, fontSize: 14, borderWidth: 1, borderColor: THEME.border },
  actions: { flexDirection: 'row', gap: 6, marginTop: 6 },
  referralCode: { fontSize: 16, fontWeight: '700', color: THEME.accent },
  ddHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  helpBtn: { marginBottom: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: THEME.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: THEME.border, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: THEME.text, marginBottom: 6 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
