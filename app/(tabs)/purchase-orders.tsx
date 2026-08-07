// Updated purchase-orders.tsx to include a Create PO flow and use services/poService

import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, StyleSheet, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { createPO } from '@/services/poService';

export default function PurchaseOrders() {
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState<{product_id:string, sku:string, name:string, qty:number, unit_cost:number}[]>([]);
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newUnitCost, setNewUnitCost] = useState('0');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // TODO: load purchase orders from Supabase
    setOrders([]);
  }, []);

  const addItem = () => {
    if (!newSku.trim() || !newName.trim()) return Alert.alert('Missing fields', 'SKU and name are required.');
    setItems(prev => [...prev, { product_id: `tmp_${Date.now()}`, sku: newSku.trim(), name: newName.trim(), qty: parseInt(newQty) || 1, unit_cost: parseFloat(newUnitCost) || 0 }]);
    setNewSku(''); setNewName(''); setNewQty('1'); setNewUnitCost('0');
  };

  const removeItem = (idx:number) => setItems(prev => prev.filter((_,i) => i !== idx));

  const handleCreatePO = async () => {
    if (!supplierId.trim()) return Alert.alert('Missing Supplier', 'Please enter supplier id (or create supplier first)');
    if (items.length === 0) return Alert.alert('No Items', 'Add at least one item to the PO');
    setCreating(true);
    try {
      const res = await createPO({ supplier_id: supplierId, items, reference: `PO-${Date.now()}` });
      Alert.alert('PO Created', JSON.stringify(res));
      setShowNew(false);
      setItems([]);
    } catch (err:any) {
      console.warn('create po err', err);
      Alert.alert('Error', 'Could not create PO. See console');
    } finally { setCreating(false); }
  };

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

      <Modal visible={showNew} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView>
              <Text style={styles.modalTitle}>Create Purchase Order</Text>
              <TextInput style={styles.input} placeholder="Supplier ID" value={supplierId} onChangeText={setSupplierId} />

              <Text style={{ marginTop: 12, fontWeight: '700' }}>Items</Text>
              {items.map((it, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700' }}>{it.name}</Text>
                    <Text style={{ color: '#666' }}>{it.sku} · Qty: {it.qty} · Unit: UGX {it.unit_cost}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeItem(idx)} style={styles.removeBtn}><MaterialIcons name="delete" size={18} color={Colors.danger} /></TouchableOpacity>
                </View>
              ))}

              <Text style={{ marginTop: 8, fontWeight: '700' }}>Add Item</Text>
              <TextInput style={styles.input} placeholder="SKU" value={newSku} onChangeText={setNewSku} />
              <TextInput style={styles.input} placeholder="Name" value={newName} onChangeText={setNewName} />
              <TextInput style={styles.input} placeholder="Qty" value={newQty} onChangeText={setNewQty} keyboardType="numeric" />
              <TextInput style={styles.input} placeholder="Unit cost" value={newUnitCost} onChangeText={setNewUnitCost} keyboardType="numeric" />
              <TouchableOpacity style={styles.addItemBtn} onPress={addItem}><Text style={{ color: '#fff' }}>Add Item</Text></TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setShowNew(false)}><Text>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalSave, creating && { opacity: 0.7 }]} onPress={handleCreatePO}><Text style={{ color: '#fff' }}>{creating ? 'Creating...' : 'Create PO'}</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
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
  modalCard: { width: '94%', maxHeight: '92%', backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginTop: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  removeBtn: { padding: 6 },
  addItemBtn: { marginTop: 8, padding: 10, backgroundColor: Colors.skyBlue, alignItems: 'center', borderRadius: 8 },
  modalCancel: { padding: 10 },
  modalSave: { padding: 10, backgroundColor: Colors.gold, borderRadius: 8 }
});
