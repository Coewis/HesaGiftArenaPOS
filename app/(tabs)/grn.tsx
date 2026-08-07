// app/(tabs)/grn.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

export default function GRNScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <Text style={styles.title}>Goods Received Notes (GRN)</Text>
      <Text style={styles.subtitle}>Receive shipments and reconcile with purchase orders here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#666', marginTop: 8 }
});
