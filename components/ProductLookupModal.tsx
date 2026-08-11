// components/ProductLookupModal.tsx
import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, TextInput, FlatList, TouchableOpacity, Image } from 'react-native';
import { getSupabaseClient } from '@/template';
import { Colors } from '@/constants/theme';

export default function ProductLookupModal({ visible, onClose, onSelect }:{ visible:boolean; onClose:()=>void; onSelect:(p:any)=>void }){
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
      const { data } = await supabase.from('products').select('id,sku,name,price,quantity,imageUrl').or(`name.ilike.${ilike},sku.ilike.${ilike}`).limit(50);
      setResults(data || []);
    } catch (err) { console.warn('product search', err); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <View style={styles.header}><Text style={styles.title}>Lookup Product</Text><TouchableOpacity onPress={onClose}><Text style={styles.close}>Close</Text></TouchableOpacity></View>
        <TextInput placeholder="Search by name or SKU" style={styles.input} value={term} onChangeText={search} autoFocus />
        <FlatList data={results} keyExtractor={i=>i.id} renderItem={({item})=> (
          <TouchableOpacity style={styles.row} onPress={()=>{ onSelect(item); onClose(); }}>
            {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.img} /> : <View style={styles.imgPlaceholder} />}
            <View style={{ flex:1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sku}>{item.sku} · UGX {item.price}</Text>
            </View>
            <Text style={styles.qty}>{item.quantity}</Text>
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
  img: { width:48, height:48, borderRadius:6, marginRight:10 },
  imgPlaceholder: { width:48, height:48, borderRadius:6, marginRight:10, backgroundColor:'#f0f0f0' },
  name: { fontWeight:'700' },
  sku: { color:'#666', marginTop:4 },
  qty: { width:40, textAlign:'right', color:'#666' }
});
