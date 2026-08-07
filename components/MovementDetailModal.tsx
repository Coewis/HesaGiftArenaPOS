// components/MovementDetailModal.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, StyleSheet, ActivityIndicator, Image, TouchableOpacity, ScrollView } from 'react-native';
import { getSupabaseClient } from '@/template';
import { Colors } from '@/constants/theme';

export default function MovementDetailModal({ visible, onClose, movementId }:{ visible:boolean; onClose:()=>void; movementId?:string }){
  const [loading, setLoading] = useState(false);
  const [movement, setMovement] = useState<any>(null);
  const [product, setProduct] = useState<any>(null);

  useEffect(() => {
    if (!visible || !movementId) return;
    (async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient();
        const { data: mv } = await supabase.from('stock_movements').select('*').eq('id', movementId).maybeSingle();
        setMovement(mv);
        if (mv?.product_id) {
          const { data: p } = await supabase.from('products').select('id, name, sku, imageUrl, price, quantity').eq('id', mv.product_id).maybeSingle();
          setProduct(p);
        }
      } catch (err) {
        console.warn('movement detail error', err);
      } finally { setLoading(false); }
    })();
  }, [visible, movementId]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Movement Details</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.close}>Close</Text></TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator /> : (
            <ScrollView>
              {product ? (
                <View style={styles.productRow}>
                  {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.image} /> : <View style={[styles.image, { backgroundColor: '#f0f0f0' }]} />}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.prodName}>{product.name}</Text>
                    <Text style={styles.prodSku}>{product.sku}</Text>
                    <Text style={styles.prodQty}>Current Qty: {product.quantity}</Text>
                  </View>
                </View>
              ) : null}

              {movement ? (
                <View style={styles.details}>
                  <Text style={styles.row}><Text style={styles.label}>Type: </Text>{movement.source_type}</Text>
                  <Text style={styles.row}><Text style={styles.label}>Change: </Text>{movement.change > 0 ? `+${movement.change}` : movement.change}</Text>
                  <Text style={styles.row}><Text style={styles.label}>Before: </Text>{movement.qty_before}</Text>
                  <Text style={styles.row}><Text style={styles.label}>After: </Text>{movement.qty_after}</Text>
                  <Text style={styles.row}><Text style={styles.label}>By: </Text>{movement.created_by}</Text>
                  <Text style={styles.row}><Text style={styles.label}>When: </Text>{new Date(movement.created_at).toLocaleString()}</Text>
                  {movement.source_id && <Text style={styles.row}><Text style={styles.label}>Ref ID: </Text>{movement.source_id}</Text>}
                </View>
              ) : <Text style={{ padding: 12 }}>No details available.</Text>}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  card: { width: '92%', maxHeight: '80%', backgroundColor: Colors.background, borderRadius: 12, padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  close: { color: Colors.skyBlue, fontWeight: '700' },
  productRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  image: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#eee' },
  prodName: { fontWeight: '700' },
  prodSku: { color: '#666', marginTop: 4 },
  prodQty: { color: Colors.gold, marginTop: 6, fontWeight: '700' },
  details: { paddingTop: 8 },
  row: { paddingVertical: 6 },
  label: { fontWeight: '700', color: '#333' }
});
