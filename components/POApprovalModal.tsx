// components/POApprovalModal.tsx
import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Colors } from '@/constants/theme';
import { approvePO, rejectPO, addPOComment } from '@/services/approvalService';

export default function POApprovalModal({ visible, onClose, poId, userId, onUpdated }:{ visible:boolean; onClose:()=>void; poId?:string; userId?:string; onUpdated?:()=>void }){
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);

  const doApprove = async () => {
    if (!poId || !userId) return Alert.alert('Missing info');
    setProcessing(true);
    try {
      await approvePO(poId, userId, comment || null);
      onUpdated && onUpdated();
      onClose();
    } catch (err) { Alert.alert('Error', 'Could not approve PO'); }
    finally { setProcessing(false); }
  };

  const doReject = async () => {
    if (!poId || !userId) return Alert.alert('Missing info');
    setProcessing(true);
    try {
      await rejectPO(poId, userId, comment || null);
      onUpdated && onUpdated();
      onClose();
    } catch (err) { Alert.alert('Error', 'Could not reject PO'); }
    finally { setProcessing(false); }
  };

  const doComment = async () => {
    if (!poId || !userId || !comment.trim()) return Alert.alert('Enter a comment');
    setProcessing(true);
    try {
      await addPOComment(poId, userId, comment.trim());
      setComment('');
      onUpdated && onUpdated();
    } catch (err) { Alert.alert('Error', 'Could not post comment'); }
    finally { setProcessing(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}><Text style={styles.title}>PO Approval</Text><TouchableOpacity onPress={onClose}><Text style={styles.close}>Close</Text></TouchableOpacity></View>
          <TextInput style={styles.input} placeholder="Comment (optional)" value={comment} onChangeText={setComment} multiline />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: Colors.success }]} onPress={doApprove} disabled={processing}><Text style={styles.btnText}>Approve</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: Colors.danger }]} onPress={doReject} disabled={processing}><Text style={styles.btnText}>Reject</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.commentBtn} onPress={doComment}><Text style={{ color: Colors.skyBlue }}>Post Comment</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' },
  card: { width: '92%', backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  close: { color: Colors.skyBlue },
  input: { borderWidth:1, borderColor:'#eee', borderRadius:8, padding:8, marginTop:12, minHeight:80 },
  actions: { flexDirection:'row', gap:8, marginTop:12 },
  btn: { flex:1, padding:12, borderRadius:8, alignItems:'center' },
  btnText: { color:'#fff', fontWeight:'700' },
  commentBtn: { marginTop:8, alignItems:'center' }
});
