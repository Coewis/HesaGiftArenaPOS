// app/(tabs)/purchase-orders.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, StyleSheet, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { createPO } from '@/services/poService';
import { getSupabaseClient } from '@/template';
import { receiveGRN } from '@/services/grnService';

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

  // PO view/receive modal state
  const [selectedPO, setSelectedPO] = useState<any | null>(null);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [receiveItems, setReceiveItems] = useState<any[]>([]);
  const [processingReceive, setProcessingReceive] = useState(false);

  useEffect(() => {
    loadPOs();
  }, []);

  const loadPOs = async () => {
    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('purchase_orders').select('*, purchase_order_items(*)').order('created_at', { ascending: false }).limit(100);
      setOrders(data || []);
    } catch (err) { console.warn('loadPOs error', err); }
  };

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
      loadPOs();
    } catch (err:any) {
      console.warn('create po err', err);
      Alert.alert('Error', 'Could not create PO. See console');
    } finally { setCreating(false); }
  };

  const openPO = (po:any) => {
    setSelectedPO(po);
    setViewModalVisible(true);
  };

  const openReceiveModal = () => {
    if (!selectedPO) return;
    // Build receiveItems with qty_received default to ordered qty
    const ri = (selectedPO.purchase_order_items || []).map((it:any) => ({ id: it.id, product_id: it.product_id, sku: it.sku, name: it.name, ordered_qty: it.qty, qty_received: it.qty, unit_cost: it.unit_cost }));
    setReceiveItems(ri);
    setReceiveModalVisible(true);
  };

  const updateReceivedQty = (idx:number, val:string) => {
    setReceiveItems(prev => prev.map((it,i) => i === idx ? { ...it, qty_received: parseInt(val) || 0 } : it));
  };

  const submitReceive = async () => {
    if (!selectedPO) return;
    setProcessingReceive(true);
    try {
      // Prepare items payload matching rpc_receive_grn expectation: [{product_id, qty, unit_cost, sku, name}]
      const payload = receiveItems.map(it => ({ product_id: it.product_id, qty: it.qty_received, unit_cost: it.unit_cost, sku: it.sku, name: it.name }));
      const userId = (await import('@/template')).getCurrentUserId ? (await import('@/template')).getCurrentUserId() : 'system';
      const res = await receiveGRN({ po_id: selectedPO.id, items: payload, received_by: userId });
      Alert.alert('GRN Created', JSON.stringify(res));
      setReceiveModalVisible(false);
      setViewModalVisible(false);
      loadPOs();
    } catch (err:any) {
      console.warn('receive grn err', err);
      Alert.alert('Error', 'Could not receive GRN. See console');
    } finally { setProcessingReceive(false); }
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
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.reference || item.id}</Text>
            <Text style={{ color: '#666' }}>{item.status} · {new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => openPO(item)} style={styles.viewBtn}><Text>View</Text></TouchableOpacity>
          </View>
        </View>
      )} />

      {/* Create PO Modal */}
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

      {/* View PO Modal */}
      <Modal visible={viewModalVisible} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.modalTitle}>PO Detail</Text>
                <TouchableOpacity onPress={() => { setViewModalVisible(false); setSelectedPO(null); }}><Text>Close</Text></TouchableOpacity>
              </View>
              {selectedPO ? (
                <View>
                  <Text style={{ fontWeight: '700', marginTop: 8 }}>{selectedPO.reference || selectedPO.id}</Text>
                  <Text style={{ color: '#666', marginBottom: 8 }}>{selectedPO.status} · Created: {new Date(selectedPO.created_at).toLocaleString()}</Text>
                  <Text style={{ fontWeight: '700', marginTop: 8 }}>Items</Text>
                  {(selectedPO.purchase_order_items || []).map((it:any, idx:number) => (
                    <View key={it.id || idx} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={{ fontWeight: '700' }}>{it.name}</Text>
                        <Text style={{ color: '#666' }}>{it.sku}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text>Qty: {it.qty}</Text>
                        <Text>Unit: UGX {it.unit_cost}</Text>
                      </View>
                    </View>
                  ))}

                  <View style={{ marginTop: 12 }}>
                    <TouchableOpacity style={[styles.receiveBtn, { backgroundColor: Colors.success }]} onPress={openReceiveModal}><Text style={{ color: '#fff' }}>Receive Goods</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.receiveBtn, { marginTop: 8, backgroundColor: Colors.warning }]} onPress={() => Alert.alert('Send PO', 'Mark PO as sent (not implemented)') }><Text>Mark Sent</Text></TouchableOpacity>
                  </View>
                </View>
              ) : <ActivityIndicator />}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Receive Modal */}
      <Modal visible={receiveModalVisible} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView>
              <Text style={styles.modalTitle}>Receive Goods for PO</Text>
              {receiveItems.map((it, idx) => (
                <View key={it.id || idx} style={{ marginTop: 8 }}>
                  <Text style={{ fontWeight: '700' }}>{it.name}</Text>
                  <Text style={{ color: '#666' }}>Ordered: {it.ordered_qty}</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={String(it.qty_received)} onChangeText={(v) => updateReceivedQty(idx, v)} />
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setReceiveModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalSave, processingReceive && { opacity: 0.7 }]} onPress={submitReceive}><Text style={{ color: '#fff' }}>{processingReceive ? 'Processing...' : 'Submit Receive'}</Text></TouchableOpacity>
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
  modalSave: { padding: 10, backgroundColor: Colors.gold, borderRadius: 8 },
  viewBtn: { padding: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 6 },
  receiveBtn: { padding: 12, borderRadius: 8, alignItems: 'center' }
});
