import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME } from '../utils/constants';

const ZONE_COLORS = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];

export default function ZoneHeatMap({ zones }) {
  const maxEarnings = Math.max(...zones.map(z => z.totalEarnings || 0), 1);

  return (
    <View style={styles.container}>
      {zones.map((zone, idx) => {
        const intensity = Math.min(1, (zone.totalEarnings || 0) / maxEarnings);
        const colorIdx = Math.min(4, Math.floor(intensity * 5));
        return (
          <View key={zone.id} style={[styles.zone, { backgroundColor: ZONE_COLORS[colorIdx] + '30' }]}>
            <Text style={styles.name}>{zone.name}</Text>
            <Text style={styles.stat}>${(zone.avgRate || 0).toFixed(1)}/hr</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  zone: {
    width: '23%', borderRadius: 8, padding: 8, alignItems: 'center',
    borderWidth: 1, borderColor: THEME.border,
  },
  name: { fontSize: 9, color: THEME.text, fontWeight: '600', textAlign: 'center' },
  stat: { fontSize: 10, color: THEME.green, fontWeight: '700', marginTop: 2 },
});
