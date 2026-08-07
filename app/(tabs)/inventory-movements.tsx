// Updated inventory-movements.tsx to open MovementDetailModal on row press

import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Button } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStockMovements from '@/hooks/useStockMovements';
import MovementRow from '@/components/MovementRow';
import MovementDetailModal from '@/components/MovementDetailModal';
import { exportMovementsCSV } from '@/services/inventoryService';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Colors } from '@/constants/theme';

export default function InventoryMovements() {
  const insets = useSafeAreaInsets();
  const { items, loading, loadMore, hasMore, reload } = useStockMovements({ pageSize: 50 });
  const [filterTerm, setFilterTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedMovement, setSelectedMovement] = useState<string | undefined>(undefined);
  const [detailVisible, setDetailVisible] = useState(false);

  const onExport = async () => {
    try {
      const csv = await exportMovementsCSV({ from: fromDate || undefined, to: toDate || undefined });
      const path = FileSystem.cacheDirectory + `stock-movements-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Stock Movements' });
      else alert('Export saved: ' + path);
    } catch (err) { console.warn('export error', err); alert('Export failed'); }
  };

  const openDetail = (id: string) => { setSelectedMovement(id); setDetailVisible(true); };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <View style={styles.header}>
        <Text style={styles.title}>Stock Movements</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.reloadBtn} onPress={reload}><Text>Reload</Text></TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={onExport}><Text style={{ color: '#fff' }}>Export CSV</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.filters}>
        <TextInput placeholder="Product ID / SKU" style={styles.input} value={filterTerm} onChangeText={setFilterTerm} />
        <TextInput placeholder="From (YYYY-MM-DD)" style={styles.input} value={fromDate} onChangeText={setFromDate} />
        <TextInput placeholder="To (YYYY-MM-DD)" style={styles.input} value={toDate} onChangeText={setToDate} />
      </View>

      {loading && items.length === 0 ? <ActivityIndicator /> : (
        <FlatList
          data={filterTerm ? items.filter(i => String(i.product_id).includes(filterTerm)) : items}
          keyExtractor={i => i.id}
          renderItem={({ item }) => <MovementRow item={item} onPress={() => openDetail(item.id)} />}
          onEndReached={() => { if (hasMore) loadMore(); }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loading ? <ActivityIndicator /> : null}
        />
      )}

      <MovementDetailModal visible={detailVisible} movementId={selectedMovement} onClose={() => { setDetailVisible(false); setSelectedMovement(undefined); }} />
    </View>
  );
}
