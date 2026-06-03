import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { THEME } from '../utils/constants';

let toastRef = null;

export function showToast(msg) {
  if (toastRef) toastRef(msg);
}

export default function ToastProvider({ children }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const msgRef = useRef('');

  useEffect(() => {
    toastRef = (msg) => {
      msgRef.current = msg;
      opacity.setValue(1);
      Animated.timing(opacity, { toValue: 0, duration: 2000, useNativeDriver: true }).start();
    };
    return () => { toastRef = null; };
  }, []);

  return (
    <>
      {children}
      <Animated.View style={[styles.toast, { opacity }]}>
        <Text style={styles.text}>{msgRef.current}</Text>
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
