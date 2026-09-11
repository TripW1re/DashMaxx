import React, { useState, useEffect } from 'react';
import { StatusBar, LogBox, View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import TabNavigator from './src/navigation/TabNavigator';
import ConnectDoorDashScreen from './src/screens/ConnectDoorDashScreen';
import ToastProvider from './src/components/Toast';
import { THEME } from './src/utils/constants';
import { loadFromStorage, getLocalState, saveToStorage } from './src/services/localDb';
import { isSocialReady, publishProfile } from './src/services/socialService';

LogBox.ignoreLogs(['Reanimated', 'Non-serializable values']);

const RootStack = createNativeStackNavigator();

const DarkTheme = {
  dark: true,
  colors: {
    primary: THEME.accent,
    background: THEME.bg,
    card: THEME.surface,
    text: THEME.text,
    border: THEME.border,
    notification: THEME.accent,
  },
};

// Deep links: dashmaxx://... and https://dashmaxx.app/ref/CODE
const linking = {
  prefixes: ['dashmaxx://', 'https://dashmaxx.app', 'https://www.dashmaxx.app'],
  config: {
    screens: {
      Main: { screens: { Home: '' } },
      ConnectDoorDash: 'connect',
    },
  },
  subscribe(listener) {
    const sub = Linking.addEventListener('url', ({ url }) => listener(url));
    return () => sub.remove();
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url) applyReferralFromUrl(url);
    return url;
  },
};

// Apply a referral code from a deep link (e.g. /ref/DASH-ABC123)
const applyReferralFromUrl = async (url) => {
  try {
    const match = String(url).match(/\/ref\/([A-Za-z0-9-]+)/);
    if (!match) return;
    const code = match[1];
    const state = getLocalState();
    if (state.settings.appliedReferralCode) return;
    state.settings.appliedReferralCode = code;
    state.revenueShare.referrals += 1;
    await saveToStorage(state);
  } catch {}
};

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await loadFromStorage();
      // Fire-and-forget: publish the local profile to the community layer
      if (isSocialReady()) {
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
            tier: st.platinum.acceptanceRate >= 70 ? 'gold' : 'basic',
            streakDays: st.revenueShare.streakDays || 0,
          });
        } catch {}
      }
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={THEME.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <NavigationContainer theme={DarkTheme} linking={linking}>
          <StatusBar barStyle="light-content" backgroundColor={THEME.bg} />
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Main" component={TabNavigator} />
            <RootStack.Screen
              name="ConnectDoorDash"
              component={ConnectDoorDashScreen}
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
          </RootStack.Navigator>
        </NavigationContainer>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: THEME.bg, alignItems: 'center', justifyContent: 'center' },
});
