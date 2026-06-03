import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME } from '../utils/constants';

export default function StatRow({ items }) {
  return (
    <View style={styles.row}>
      {items.map((item, idx) => (
        <View key={idx} style={styles.item}>
          <Text style={[styles.value, item.color && { color: item.color }]}>{item.value}</Text>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4 },
  item: { alignItems: 'center' },
  value: { fontSize: 18, fontWeight: '700', color: THEME.text },
  label: { fontSize: 11, color: THEME.text2, marginTop: 2 },
});
