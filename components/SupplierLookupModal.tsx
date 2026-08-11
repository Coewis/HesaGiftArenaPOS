// components/SupplierLookupModal.tsx
import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, TextInput, FlatList, TouchableOpacity } from 'react-native';
import { getSupabaseClient } from '@/template';
import { Colors } from '@/constants/theme';

export default function SupplierLookupModal({ visible, onClose, onSelect }:{ visible:boolean; onClose:()=>void; onSelect:(s:any)=>void }){
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async (q:string) => {
    setTerm(q);
    if (!q || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const ilike = `%${q}%`;
      const { data } = await supabase.from('suppliers').select('id,name,phone,email,address').or(`name.ilike.${ilike},phone.ilike.${ilike}`).limit(50);
      setResults(data || []);
    } catch (err) { console.warn('supplier search', err); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <View style={styles.header}><Text style={styles.title}>Lookup Supplier</Text><TouchableOpacity onPress={onClose}><Text style={styles.close}>Close</Text></TouchableOpacity></View>
        <TextInput placeholder="Search by name or phone" style={styles.input} value={term} onChangeText={search} autoFocus />
        <FlatList data={results} keyExtractor={i=>i.id} renderItem={({item})=> (
          <TouchableOpacity style={styles.row} onPress={()=>{ onSelect(item); onClose(); }}>
            <View style={{ flex:1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.phone || item.email}</Text>
            </View>
            <Text style={styles.addr}>{item.address ? item.address.slice(0,20) : ''}</Text>
          </TouchableOpacity>
        )} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, padding:12, backgroundColor: Colors.background },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  title: { fontSize:18, fontWeight:'700' },
  close: { color: Colors.skyBlue, fontWeight:'700' },
  input: { borderWidth:1, borderColor:'#eee', borderRadius:8, padding:10, marginBottom:8 },
  row: { flexDirection:'row', alignItems:'center', padding:10, borderBottomWidth:1, borderBottomColor:'#f0f0f0' },
  name: { fontWeight:'700' },
  meta: { color:'#666', marginTop:4 },
  addr: { color:'#666', width:100, textAlign:'right' }
});
