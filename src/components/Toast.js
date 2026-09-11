import React, { useEffect, useState } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { THEME } from '../utils/constants';

let toastRef = null;

export function showToast(msg) {
  if (toastRef) toastRef(msg);
}

export default function ToastProvider({ children }) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [message, setMessage] = useState('');

  useEffect(() => {
    toastRef = (msg) => {
      setMessage(msg);
      opacity.setValue(1);
      Animated.timing(opacity, { toValue: 0, duration: 2200, useNativeDriver: true }).start();
    };
    return () => { toastRef = null; };
  }, [opacity]);

  return (
    <>
      {children}
      <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', bottom: 100, left: 20, right: 20,
    backgroundColor: THEME.surface2, padding: 12, borderRadius: 8,
    alignItems: 'center', borderWidth: 1, borderColor: THEME.accent,
  },
  text: { color: THEME.text, fontSize: 13 },
});
