import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
import { THEME } from '../utils/constants';

import HomeScreen from '../screens/HomeScreen';
import EarningsScreen from '../screens/EarningsScreen';
import PlatinumScreen from '../screens/PlatinumScreen';
import ZonesScreen from '../screens/ZonesScreen';
import SocialScreen from '../screens/SocialScreen';
import RoutePlannerScreen from '../screens/RoutePlannerScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const TabIcon = ({ label, emoji, focused }) => (
  <View style={styles.tabItem}>
    <Text style={[styles.tabEmoji, focused && styles.tabEmojiActive]}>{emoji}</Text>
    <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
  </View>
);

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: THEME.surface,
          borderTopColor: THEME.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 6,
          paddingTop: 4,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: THEME.accent,
        tabBarInactiveTintColor: THEME.text3,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Home" emoji="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Earn" emoji="💰" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Platinum"
        component={PlatinumScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Plat" emoji="💎" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Zones"
        component={ZonesScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Zones" emoji="🗺️" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Social"
        component={SocialScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Social" emoji="💬" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="RoutePlanner"
        component={RoutePlannerScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Route" emoji="📍" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Settings" emoji="⚙️" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: 'center', justifyContent: 'center' },
  tabEmoji: { fontSize: 20, opacity: 0.5 },
  tabEmojiActive: { opacity: 1 },
  tabLabel: { fontSize: 9, color: THEME.text3, marginTop: 1 },
  tabLabelActive: { color: THEME.accent, fontWeight: '600' },
});
