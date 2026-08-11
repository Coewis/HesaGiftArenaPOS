// components/POAuditList.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { getSupabaseClient } from '@/template';

export default function POAuditList({ poId }:{ poId?: string }){
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!poId) return;
    (async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('po_audit').select('*').eq('purchase_order_id', poId).order('created_at', { ascending: false }).limit(100);
      setItems(data || []);
    })();
  }, [poId]);

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontWeight: '700', marginBottom: 8 }}>Activity</Text>
      <FlatList data={items} keyExtractor={i=>i.id} renderItem={({item})=> (
        <View style={styles.row}>
          <Text style={styles.action}>{item.action}</Text>
          <Text style={styles.meta}>{item.comment || ''}</Text>
          <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
        </View>
      )} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8, borderBottomWidth:1, borderBottomColor:'#f0f0f0' },
  action: { fontWeight: '700' },
  meta: { color:'#666', marginTop:4 },
  time: { color:'#999', marginTop:4 }
});
