import React from 'react';
import { View, StyleSheet } from 'react-native';
import { THEME } from '../utils/constants';

export default function ProgressBar({ value, max = 100, color = THEME.accent, height = 6 }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <View style={[styles.track, { height }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: THEME.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
