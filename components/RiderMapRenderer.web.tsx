// Web fallback for rider map — react-native-maps not available on web
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '@/constants/theme';
import type { RiderMapRendererProps } from './RiderMapRenderer.native';

export default function RiderMapRenderer({ markers }: RiderMapRendererProps) {
  return (
    <View style={styles.fallback}>
      <MaterialIcons name="map" size={56} color={Colors.textMuted} />
      <Text style={styles.title}>Live Map — Mobile Only</Text>
      <Text style={styles.sub}>
        {markers.length > 0
          ? `${markers.length} rider${markers.length !== 1 ? 's' : ''} being tracked`
          : 'Open on the OnSpace mobile app to see live rider locations'}
      </Text>
      {markers.map(m => (
        <View key={m.id} style={styles.markerRow}>
          <View style={[styles.dot, { backgroundColor: m.color || Colors.gold }]} />
          <Text style={styles.markerTitle}>{m.title}</Text>
          {m.description ? <Text style={styles.markerDesc}>{m.description}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.navyCard, gap: Spacing.md, padding: 40,
  },
  title: { fontSize: Typography.lg, fontWeight: '700', color: Colors.textMuted, textAlign: 'center' },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  markerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  markerTitle: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: '600' },
  markerDesc: { fontSize: 10, color: Colors.textMuted },
});
