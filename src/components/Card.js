import React from 'react';
import { View, StyleSheet } from 'react-native';
import { THEME } from '../utils/constants';

export default function Card({ children, style, glass }) {
  return (
    <View style={[styles.card, glass && styles.glass, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  glass: {
    backgroundColor: 'rgba(30,38,64,0.6)',
    backdropFilter: 'blur(10px)',
  },
});
