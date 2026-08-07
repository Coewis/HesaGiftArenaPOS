// app/(tabs)/purchase-orders.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';

export default function PurchaseOrders() {
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    // TODO: load purchase orders from Supabase
    setOrders([]);
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Purchase Orders</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowNew(true)}>
          <MaterialIcons name="add" size={20} color={Colors.navy} />
          <Text style={styles.addBtnText}>Create PO</Text>
        </TouchableOpacity>
      </View>
      <FlatList data={orders} keyExtractor={i => i.id} renderItem={({ item }) => (
        <View style={styles.row}><Text style={styles.name}>{item.reference || item.id}</Text><Text style={styles.status}>{item.status}</Text></View>
      )} />

      <Modal visible={showNew} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalCard}><Text>Create PO - Coming Soon</Text></View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.gold, padding: 8, borderRadius: 8 },
  addBtnText: { color: Colors.navy, fontWeight: '700' },
  row: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  name: { fontWeight: '600' },
  status: { color: '#666' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: { width: '90%', backgroundColor: '#fff', borderRadius: 12, padding: 16 }
});
