// app/(tabs)/suppliers.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

export default function SuppliersScreen() {
  const insets = useSafeAreaInsets();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    // TODO: load suppliers from Supabase
    (async () => {
      setLoading(true);
      try {
        // placeholder - replace with real supabase client call
        setSuppliers([{ id: 's1', name: 'Acme Supplies', phone: '0700123456' }]);
      } catch (err) {}
      setLoading(false);
    })();
  }, []);

  const saveSupplier = async () => {
    if (!newName.trim()) return;
    // TODO: call supabase to create supplier
    const s = { id: `sup_${Date.now()}`, name: newName.trim(), phone: newPhone.trim() };
    setSuppliers(prev => [s, ...prev]);
    setNewName(''); setNewPhone(''); setShowNew(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <View style={styles.header}>
        <Text style={styles.title}>Suppliers</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowNew(true)}>
          <MaterialIcons name="add" size={20} color={Colors.navy} />
          <Text style={styles.addBtnText}>New Supplier</Text>
        </TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator /> : (
        <FlatList data={suppliers} keyExtractor={i => i.id} renderItem={({ item }) => (
          <TouchableOpacity style={styles.row}>
            <View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.phone}>{item.phone}</Text>
            </View>
          </TouchableOpacity>
        )} />
      )}

      <Modal visible={showNew} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Supplier</Text>
            <TextInput style={styles.input} placeholder="Supplier name" value={newName} onChangeText={setNewName} />
            <TextInput style={styles.input} placeholder="Phone" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowNew(false)} style={styles.modalCancel}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={saveSupplier} style={styles.modalSave}><Text style={{ color: '#fff' }}>Save</Text></TouchableOpacity>
            </View>
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
  row: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 16, fontWeight: '600' },
  phone: { color: '#666' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: { width: '90%', backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginTop: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  modalCancel: { padding: 8 },
  modalSave: { padding: 8, backgroundColor: Colors.skyBlue, borderRadius: 8 }
});
