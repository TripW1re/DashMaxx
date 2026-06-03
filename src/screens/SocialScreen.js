import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../components/Card';
import ProUpsell from '../components/ProUpsell';
import { showToast } from '../components/Toast';
import { THEME } from '../utils/constants';
import { formatCurrency, formatDateFull, timeAgo } from '../utils/format';
import { calcTier } from '../utils/calculations';
import { getLocalState, saveToStorage } from '../services/localDb';

const AVATARS = ['🚗', '🚴', '🏆', '💎', '🍕', '⚡', '🔥', '👑', '🚀', '💪'];

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState(getLocalState());
  const [postText, setPostText] = useState('');
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ ...state.social.profile });

  const refresh = () => setState({ ...getLocalState() });
  const pro = state.settings.isPro;
  const totalEarnings = state.shifts.reduce((s, sh) => s + (sh.earnings || 0), 0);
  const totalDeliveries = state.shifts.reduce((s, sh) => s + (sh.deliveries || 0), 0);
  const tier = calcTier(state.platinum);
  const profile = state.social.profile;
  const sortedPosts = [...state.social.posts].sort((a, b) => b.timestamp - a.timestamp);

  const lb = [
    { name: profile.displayName || 'You', earnings: totalEarnings, deliveries: totalDeliveries, tier, streak: state.revenueShare.streakDays, avatar: profile.avatar || '🚗' },
    { name: 'PlatinumDasher', earnings: totalEarnings * 1.3, deliveries: Math.round(state.shifts.length * 1.2), tier: 'platinum', streak: 23, avatar: '🏆' },
    { name: 'SacTownRider', earnings: totalEarnings * 0.9, deliveries: Math.round(state.shifts.length * 1.4), tier: 'gold', streak: 12, avatar: '🚴' },
    { name: 'ElkGrovePro', earnings: totalEarnings * 1.1, deliveries: state.shifts.length * 1.1, tier: 'platinum', streak: 18, avatar: '💎' },
    { name: 'FolsomFlash', earnings: totalEarnings * 0.8, deliveries: Math.round(state.shifts.length * 0.9), tier: 'silver', streak: 7, avatar: '⚡' },
  ].sort((a, b) => b.earnings - a.earnings);

  const handleCreatePost = async () => {
    if (!postText.trim()) { showToast('Write something!'); return; }
    const newState = { ...state };
    const post = {
      id: Date.now().toString(),
      author: profile.displayName || 'Dasher',
      avatar: profile.avatar || '🚗',
      content: postText.trim(),
      timestamp: Date.now(),
      tips: 0,
      replies: [],
      type: 'user',
    };
    newState.social.posts = [post, ...newState.social.posts];
    newState.revenueShare.socialPosts = (newState.revenueShare.socialPosts || 0) + 1;
    await saveToStorage(newState);
    setPostText('');
    refresh();
    showToast('📤 Posted!');
  };

  const handleTip = async (postId) => {
    const newState = { ...state };
    const post = newState.social.posts.find(p => p.id === postId);
    if (post) {
      post.tips = (post.tips || 0) + 1;
      await saveToStorage(newState);
      refresh();
    }
  };

  const handleSaveProfile = async () => {
    const newState = { ...state };
    newState.social.profile = { ...profileForm, joinDate: profile.joinDate };
    await saveToStorage(newState);
    setShowEditProfile(false);
    refresh();
    showToast('Profile saved!');
  };

  if (!pro) return <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]}><ProUpsell onPress={() => {}} /></ScrollView>;

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
      {/* Profile */}
      <Card glass>
        <View style={styles.profileHeader}>
          <Text style={styles.cardTitle}>👤 Your Profile</Text>
          <TouchableOpacity onPress={() => { setProfileForm({ ...profile }); setShowEditProfile(true); }}>
            <Text style={{ color: THEME.blue, fontSize: 12 }}>✏️ Edit</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.profileRow}>
          <Text style={{ fontSize: 36 }}>{profile.avatar || '🚗'}</Text>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.profileName}>{profile.displayName || 'Dasher'}</Text>
            <Text style={styles.profileBio}>{profile.bio || ''}</Text>
            <Text style={styles.profileMeta}>Joined {formatDateFull(profile.joinDate)} · {state.shifts.length} shifts · {formatCurrency(totalEarnings)} earned</Text>
          </View>
        </View>
      </Card>

      {/* Leaderboard */}
      <Card>
        <Text style={styles.cardTitle}>🏆 Leaderboard — Sacramento Market</Text>
        <View style={styles.lbHeader}>
          <Text style={[styles.lbCell, { flex: 0.5 }]}>#</Text>
          <Text style={[styles.lbCell, { flex: 1.5 }]}>Dasher</Text>
          <Text style={[styles.lbCell, { flex: 1 }]}>Earnings</Text>
          <Text style={[styles.lbCell, { flex: 0.8 }]}>Tier</Text>
          <Text style={[styles.lbCell, { flex: 0.7 }]}>🔥</Text>
        </View>
        {lb.map((d, i) => (
          <View key={i} style={[styles.lbRow, i === 0 && { backgroundColor: THEME.surface2, borderRadius: 4 }]}>
            <Text style={[styles.lbCell, { flex: 0.5, fontWeight: '700', color: i === 0 ? THEME.gold : i < 3 ? THEME.text2 : THEME.text3 }]}>{i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</Text>
            <Text style={[styles.lbCell, { flex: 1.5 }]}>{d.avatar} {d.name}</Text>
            <Text style={[styles.lbCell, { flex: 1, color: THEME.green }]}>{formatCurrency(d.earnings)}</Text>
            <Text style={[styles.lbCell, { flex: 0.8 }]}><Text style={{ fontSize: 9, color: d.tier === 'platinum' ? THEME.platinum : d.tier === 'gold' ? THEME.gold : THEME.text2 }}>{d.tier}</Text></Text>
            <Text style={[styles.lbCell, { flex: 0.7 }]}>{d.streak > 0 ? `🔥${d.streak}d` : ''}</Text>
          </View>
        ))}
      </Card>

      {/* Feed */}
      <Card>
        <View style={styles.feedHeader}>
          <Text style={styles.cardTitle}>💬 Dasher Feed</Text>
          <Text style={{ color: THEME.text3, fontSize: 11 }}>{sortedPosts.length} posts</Text>
        </View>
        <View style={styles.postInput}>
          <TextInput
            style={styles.textArea}
            placeholder="What's happening in your zone? Share tips, hot spots, hidden tip orders..."
            placeholderTextColor={THEME.text3}
            value={postText}
            onChangeText={setPostText}
            multiline
          />
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleCreatePost}>
            <Text style={styles.btnPrimaryText}>📤 Post</Text>
          </TouchableOpacity>
        </View>
        {sortedPosts.slice(0, 20).map(p => (
          <View key={p.id} style={styles.postCard}>
            <View style={styles.postHeader}>
              <Text style={{ fontSize: 20 }}>{p.avatar || '🚗'}</Text>
              <View style={{ marginLeft: 6, flex: 1 }}>
                <Text style={styles.postAuthor}>{p.author} <Text style={{ color: THEME.text3, fontSize: 10 }}>{p.type === 'system' ? '📢' : ''} · {timeAgo(p.timestamp)}</Text></Text>
                <Text style={styles.postContent}>{p.content}</Text>
              </View>
            </View>
            <View style={styles.postActions}>
              <TouchableOpacity onPress={() => handleTip(p.id)}>
                <Text style={styles.actionBtn}>🔥 {p.tips || 0}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </Card>

      {/* Edit Profile Modal */}
      <Modal visible={showEditProfile} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>✏️ Edit Profile</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Display Name</Text>
              <TextInput style={styles.input} value={profileForm.displayName} onChangeText={v => setProfileForm({ ...profileForm, displayName: v })} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Bio</Text>
              <TextInput style={styles.input} value={profileForm.bio} onChangeText={v => setProfileForm({ ...profileForm, bio: v })} multiline />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Avatar</Text>
              <View style={styles.avatarRow}>
                {AVATARS.map(e => (
                  <TouchableOpacity key={e} style={[styles.avatarBtn, profileForm.avatar === e && styles.avatarBtnActive]} onPress={() => setProfileForm({ ...profileForm, avatar: e })}>
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={() => setShowEditProfile(false)}><Text style={styles.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={handleSaveProfile}><Text style={styles.btnPrimaryText}>Save</Text></TouchableOpacity>
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
  profileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  profileName: { fontSize: 16, fontWeight: '600', color: THEME.text },
  profileBio: { fontSize: 11, color: THEME.text2, marginTop: 2 },
  profileMeta: { fontSize: 10, color: THEME.text3, marginTop: 4 },
  lbHeader: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: THEME.border },
  lbRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: THEME.border, alignItems: 'center' },
  lbCell: { fontSize: 11, color: THEME.text },
  feedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  postInput: { marginBottom: 10 },
  textArea: { backgroundColor: THEME.surface2, borderRadius: 8, padding: 10, color: THEME.text, fontSize: 13, height: 60, borderWidth: 1, borderColor: THEME.border, marginBottom: 6, textAlignVertical: 'top' },
  btn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, alignItems: 'center' },
  btnPrimary: { backgroundColor: THEME.accent },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  btnSecondary: { backgroundColor: THEME.surface2, borderWidth: 1, borderColor: THEME.border },
  btnSecondaryText: { color: THEME.text, fontSize: 12 },
  postCard: { backgroundColor: THEME.surface2, borderRadius: 8, padding: 10, marginBottom: 6 },
  postHeader: { flexDirection: 'row' },
  postAuthor: { fontSize: 12, fontWeight: '600', color: THEME.text },
  postContent: { fontSize: 12, color: THEME.text, marginTop: 2 },
  postActions: { flexDirection: 'row', marginTop: 8, gap: 12 },
  actionBtn: { fontSize: 11, color: THEME.text2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: THEME.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: THEME.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: THEME.text, marginBottom: 14 },
  inputGroup: { marginBottom: 12 },
  inputLabel: { color: THEME.text2, fontSize: 12, marginBottom: 4 },
  input: { backgroundColor: THEME.surface2, borderRadius: 8, padding: 10, color: THEME.text, fontSize: 14, borderWidth: 1, borderColor: THEME.border },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  avatarBtn: { padding: 4, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  avatarBtnActive: { borderColor: THEME.accent },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
