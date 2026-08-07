// components/MovementRow.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { Colors } from '@/constants/theme';

export default function MovementRow({ item, onPress }:{ item:any; onPress?: (it:any)=>void }){
  return (
    <TouchableOpacity style={styles.row} onPress={() => onPress && onPress(item)}>
      <View style={styles.left}>
        <Text style={styles.sku}>{item.product_id}</Text>
        <Text style={styles.meta}>{item.source_type} · {format(new Date(item.created_at), 'dd MMM yyyy HH:mm')}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.change, { color: item.change < 0 ? Colors.danger : Colors.success }]}>{item.change > 0 ? `+${item.change}` : String(item.change)}</Text>
        <Text style={styles.qty}>{item.qty_after}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  left: { flex: 1 },
  right: { width: 110, alignItems: 'flex-end' },
  sku: { fontSize: 13, fontWeight: '700' },
  meta: { fontSize: 12, color: '#666', marginTop: 4 },
  change: { fontSize: 14, fontWeight: '800' },
  qty: { fontSize: 12, color: '#666', marginTop: 2 }
});
