import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { THEME } from '../utils/constants';

export default function ProUpsell({ onPress }) {
  return (
    <View style={styles.banner}>
      <Text style={styles.title}>⭐ Pro Feature</Text>
      <Text style={styles.desc}>Subscribe to unlock this and all other features</Text>
      <TouchableOpacity style={styles.button} onPress={onPress}>
        <Text style={styles.buttonText}>View Plans</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: THEME.surface, borderRadius: 12, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: THEME.accent, margin: 16,
  },
  title: { fontSize: 20, fontWeight: '700', color: THEME.accent, marginBottom: 6 },
  desc: { fontSize: 13, color: THEME.text2, textAlign: 'center', marginBottom: 14 },
  button: {
    backgroundColor: THEME.accent, paddingVertical: 10, paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
