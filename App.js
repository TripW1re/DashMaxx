import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TabNavigator from './src/navigation/TabNavigator';
import ConnectDoorDashScreen from './src/screens/ConnectDoorDashScreen';
import ToastProvider from './src/components/Toast';
import { THEME } from './src/utils/constants';
import { loadFromStorage } from './src/services/localDb';

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

export default function App() {
  useEffect(() => {
    loadFromStorage();
  }, []);

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <NavigationContainer theme={DarkTheme}>
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
