import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../components/Card';
import ProUpsell from '../components/ProUpsell';
import { showToast } from '../components/Toast';
import { THEME } from '../utils/constants';
import { formatCurrency, formatDateFull, timeAgo } from '../utils/format';
import { calcTier } from '../utils/calculations';
import { getLocalState, saveToStorage, subscribeToState } from '../services/localDb';
import {
  isSocialReady, ensureSocialAuth, subscribeToFeed, createPost, tipPost,
  subscribeToLeaderboard, publishProfile,
} from '../services/socialService';

const AVATARS = ['🚗', '🚴', '🏆', '💎', '🍕', '⚡', '🔥', '👑', '🚀', '💪'];

export default function SocialScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState(getLocalState());
  const [postText, setPostText] = useState('');
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ ...state.social.profile });
  const [live, setLive] = useState(false);            // Firestore connected
  const [remotePosts, setRemotePosts] = useState([]); // feed from Firestore
  const [leaderboard, setLeaderboard] = useState(null); // null = not loaded yet
  const [feedError, setFeedError] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => subscribeToState(() => setState({ ...getLocalState() })), []);

  const migrateLocalPosts = async (st) => {
    const posts = [...(st.social.posts || [])].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    for (const p of posts) {
      try {
        await createPost({ author: p.author, avatar: p.avatar, content: p.content });
      } catch {}
    }
    const newState = getLocalState();
    newState.settings.socialMigrated = true;
    await saveToStorage(newState);
  };

  const publishOwnProfile = async () => {
    const st = getLocalState();
    const totalEarnings = st.shifts.reduce((s, sh) => s + (sh.earnings || 0), 0);
    const totalDeliveries = st.shifts.reduce((s, sh) => s + (sh.deliveries || 0), 0);
    try {
      await publishProfile({
        displayName: st.social.profile.displayName,
        avatar: st.social.profile.avatar,
        bio: st.social.profile.bio,
        earnings: totalEarnings,
        deliveries: totalDeliveries,
        tier: calcTier(st.platinum),
        streakDays: st.revenueShare.streakDays || 0,
      });
    } catch {}
  };

  // ===== Live community layer =====
  useEffect(() => {
    if (!isSocialReady()) return;
    let unsubFeed = null;
    let unsubLb = null;

    (async () => {
      try {
        const uid = await ensureSocialAuth();
        if (!uid) return;
        setLive(true);

        unsubFeed = subscribeToFeed(posts => {
          setRemotePosts(posts);
          setFeedError(false);
          // One-time migration of legacy local posts to the community feed
          const st = getLocalState();
          if (st.social.posts?.length && !st.settings.socialMigrated) {
            migrateLocalPosts(st);
          }
        }, () => setFeedError(true));

        unsubLb = subscribeToLeaderboard(rows => {
          setLeaderboard(rows);
        }, () => { /* keep local-only leaderboard */ });

        publishOwnProfile();
      } catch {
        setLive(false);
      }
    })();

    return () => {
      unsubFeed?.();
      unsubLb?.();
    };
  }, []);

  const refresh = () => setState({ ...getLocalState() });
  const pro = state.settings.isPro;
  const totalEarnings = state.shifts.reduce((s, sh) => s + (sh.earnings || 0), 0);
  const totalDeliveries = state.shifts.reduce((s, sh) => s + (sh.deliveries || 0), 0);
  const tier = calcTier(state.platinum);
  const profile = state.social.profile;

  const feedPosts = live
    ? remotePosts
    : [...state.social.posts].sort((a, b) => b.timestamp - a.timestamp);

  // Leaderboard rows: real community rows when live, own row otherwise
  const lbRows = (() => {
    const own = {
      id: 'you',
      name: profile.displayName || 'You',
      earnings: totalEarnings,
      deliveries: totalDeliveries,
      tier,
      streak: state.revenueShare.streakDays || 0,
      avatar: profile.avatar || '🚗',
    };
    if (live && leaderboard?.length) {
      const hasOwn = leaderboard.some(r => r.name === own.name && r.earnings === own.earnings);
      const rows = hasOwn ? [...leaderboard] : [own, ...leaderboard];
      return rows.sort((a, b) => b.earnings - a.earnings).map(r => ({ ...r, isYou: false }));
    }
    return [own];
  })();

  const handleCreatePost = async () => {
    const text = postText.trim();
    if (!text) { showToast('Write something!'); return; }
    if (text.length > 500) { showToast('⚠️ Posts are limited to 500 characters'); return; }
    setPosting(true);
    try {
      if (live) {
        await createPost({ author: profile.displayName, avatar: profile.avatar, content: text });
        // Update local counters
        const newState = getLocalState();
        newState.revenueShare.socialPosts = (newState.revenueShare.socialPosts || 0) + 1;
        await saveToStorage(newState);
        setPostText('');
        refresh();
        showToast('📤 Posted to the community!');
      } else {
        const newState = { ...state };
        const post = {
          id: 'local-' + Date.now().toString(36),
          author: profile.displayName || 'Dasher',
          avatar: profile.avatar || '🚗',
          content: text,
          timestamp: Date.now(),
          tips: 0,
          type: 'user',
        };
        newState.social.posts = [post, ...newState.social.posts];
        newState.revenueShare.socialPosts = (newState.revenueShare.socialPosts || 0) + 1;
        await saveToStorage(newState);
        setPostText('');
        refresh();
        showToast('📤 Posted! (offline mode — saved on device)');
      }
    } catch (e) {
      showToast('❌ Could not post: ' + (e?.message === 'AUTH_UNAVAILABLE' ? 'sign-in unavailable' : e?.message || 'unknown error'));
    }
    setPosting(false);
  };

  const handleTip = async (postId) => {
    try {
      if (live) {
        await tipPost(postId, 1);
        return; // snapshot updates the feed
      }
      const newState = { ...state };
      const post = newState.social.posts.find(p => p.id === postId);
      if (post) {
        post.tips = (post.tips || 0) + 1;
        await saveToStorage(newState);
        refresh();
      }
    } catch {
      showToast('⚠️ Tip failed — try again');
    }
  };

  const handleSaveProfile = async () => {
    const displayName = (profileForm.displayName || '').trim().slice(0, 40);
    const bio = (profileForm.bio || '').trim().slice(0, 200);
    if (!displayName) { showToast('⚠️ Display name is required'); return; }
    const newState = { ...state };
    newState.social.profile = { ...profileForm, displayName, bio, joinDate: profile.joinDate };
    await saveToStorage(newState);
    setShowEditProfile(false);
    refresh();
    if (live) publishOwnProfile();
    showToast('Profile saved!');
  };

  if (!pro) return <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]}><ProUpsell onPress={() => navigation?.navigate('Settings')} /></ScrollView>;

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top + 8 }]} contentContainerStyle={{ padding: 12, paddingBottom: 100 }}>
      {/* Connection mode banner */}
      {!live && isSocialReady() && (
        <View style={styles.modeBanner}>
          <Text style={styles.modeText}>📡 Connecting to community...</Text>
        </View>
      )}
      {!isSocialReady() && (
        <View style={[styles.modeBanner, { borderColor: THEME.yellow }]}>
          <Text style={[styles.modeText, { color: THEME.yellow }]}>💾 Offline mode — configure Firebase to join the community feed</Text>
        </View>
      )}

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
        {lbRows.map((d, i) => (
          <View key={d.id} style={[styles.lbRow, d.isYou && { backgroundColor: THEME.surface2, borderRadius: 4 }]}>
            <Text style={[styles.lbCell, { flex: 0.5, fontWeight: '700', color: i === 0 ? THEME.gold : i < 3 ? THEME.text2 : THEME.text3 }]}>{i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</Text>
            <Text style={[styles.lbCell, { flex: 1.5 }]}>{d.avatar} {d.name}</Text>
            <Text style={[styles.lbCell, { flex: 1, color: THEME.green }]}>{formatCurrency(d.earnings)}</Text>
            <Text style={[styles.lbCell, { flex: 0.8 }]}><Text style={{ fontSize: 9, color: d.tier === 'platinum' ? THEME.platinum : d.tier === 'gold' ? THEME.gold : THEME.text2 }}>{d.tier}</Text></Text>
            <Text style={[styles.lbCell, { flex: 0.7 }]}>{d.streak > 0 ? `🔥${d.streak}d` : ''}</Text>
          </View>
        ))}
        {!live && (
          <Text style={styles.lbNote}>Connect Firebase to see the full Sacramento leaderboard.</Text>
        )}
      </Card>

      {/* Feed */}
      <Card>
        <View style={styles.feedHeader}>
          <Text style={styles.cardTitle}>💬 Dasher Feed</Text>
          <Text style={{ color: THEME.text3, fontSize: 11 }}>{feedPosts.length} posts</Text>
        </View>
        <View style={styles.postInput}>
          <TextInput
            style={styles.textArea}
            placeholder="What's happening in your zone? Share tips, hot spots, hidden tip orders..."
            placeholderTextColor={THEME.text3}
            value={postText}
            onChangeText={setPostText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity style={[styles.btn, styles.btnPrimary, posting && { opacity: 0.6 }]} onPress={handleCreatePost} disabled={posting}>
            <Text style={styles.btnPrimaryText}>{posting ? '⏳ Posting...' : '📤 Post'}</Text>
          </TouchableOpacity>
        </View>
        {feedPosts.length === 0 ? (
          <Text style={styles.feedEmpty}>
            {live
              ? 'No posts yet — be the first to share a tip with your zone!'
              : 'No posts yet. Share your first tip below, or connect Firebase for the community feed.'}
          </Text>
        ) : feedPosts.slice(0, 20).map(p => (
          <View key={p.id} style={styles.postCard}>
            <View style={styles.postHeader}>
              <Text style={{ fontSize: 20 }}>{p.avatar || '🚗'}</Text>
              <View style={{ marginLeft: 6, flex: 1 }}>
                <Text style={styles.postAuthor}>{p.author} <Text style={{ color: THEME.text3, fontSize: 10 }}>· {timeAgo(p.timestamp)}</Text></Text>
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
        {feedError && (
          <Text style={styles.feedError}>⚠️ Community feed unavailable right now — your posts are safe on device.</Text>
        )}
      </Card>

      {/* Edit Profile Modal */}
      <Modal visible={showEditProfile} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>✏️ Edit Profile</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Display Name</Text>
              <TextInput style={styles.input} value={profileForm.displayName} onChangeText={v => setProfileForm({ ...profileForm, displayName: v })} maxLength={40} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Bio</Text>
              <TextInput style={styles.input} value={profileForm.bio} onChangeText={v => setProfileForm({ ...profileForm, bio: v })} multiline maxLength={200} />
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
  modeBanner: { backgroundColor: THEME.surface2, borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: THEME.blue },
  modeText: { fontSize: 11, color: THEME.blue, fontWeight: '600' },
  profileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  profileName: { fontSize: 16, fontWeight: '600', color: THEME.text },
  profileBio: { fontSize: 11, color: THEME.text2, marginTop: 2 },
  profileMeta: { fontSize: 10, color: THEME.text3, marginTop: 4 },
  lbHeader: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: THEME.border },
  lbRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: THEME.border, alignItems: 'center' },
  lbCell: { fontSize: 11, color: THEME.text },
  lbNote: { fontSize: 10, color: THEME.text3, textAlign: 'center', marginTop: 8 },
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
  feedEmpty: { fontSize: 12, color: THEME.text3, textAlign: 'center', paddingVertical: 16, fontStyle: 'italic' },
  feedError: { fontSize: 11, color: THEME.red, textAlign: 'center', paddingVertical: 8 },
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
