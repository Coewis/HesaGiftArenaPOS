import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  FlatList, Modal, TextInput, ActivityIndicator, Dimensions, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Location from 'expo-location';
import RiderMapRenderer from '@/components/RiderMapRenderer';
import { getSupabaseClient } from '@/template';
import { usePOS } from '@/hooks/usePOS';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/hooks/useBranch';
import { useAlert } from '@/template';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { FunctionsHttpError } from '@supabase/supabase-js';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isDesktop = SCREEN_WIDTH >= 1024;
const isTablet = SCREEN_WIDTH >= 768;
const formatUGX = (n: number) => `UGX ${n.toLocaleString()}`;

// ─── Distance & ETA helpers ─────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateETA(distKm: number): string {
  const speedKph = 25; // avg urban delivery speed
  const minutes = Math.round((distKm / speedKph) * 60);
  if (minutes < 1) return 'Arriving now';
  if (minutes < 60) return `~${minutes} min`;
  return `~${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Rider {
  id: string;
  name: string;
  phone: string;
  pin: string;
  status: 'active' | 'inactive';
  created_at: string;
}

interface RiderDelivery {
  id: string;
  order_id: string;
  rider_id: string;
  rider_name: string;
  rider_phone: string;
  status: DeliveryStatus;
  assigned_at: string;
  accepted_at?: string;
  picked_up_at?: string;
  delivered_at?: string;
  failed_at?: string;
  fail_reason?: string;
  delivery_photo_url?: string;
  delivery_otp?: string;
  otp_verified: boolean;
  notes?: string;
  // Joined order info
  order_no?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  total?: number;
}

interface RiderLocation {
  id: string;
  rider_id: string;
  delivery_id?: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updated_at: string;
}

interface RiderEarning {
  id: string;
  rider_id: string;
  rider_name: string;
  amount: number;
  type: 'delivery_fee' | 'bonus' | 'deduction';
  description: string;
  period_month: string;
  created_at: string;
}

type DeliveryStatus = 'assigned' | 'accepted' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';
type TabMode = 'deliveries' | 'riders' | 'earnings' | 'tracking' | 'performance';

interface RiderRating {
  id: string;
  rider_id: string;
  delivery_id: string;
  order_id: string;
  rating: number;
  notes?: string;
  rated_by: string;
  rated_by_role: string;
  created_at: string;
}

interface RiderPerformance {
  rider: Rider;
  totalDeliveries: number;
  successful: number;
  failed: number;
  successRate: number;
  avgDeliveryMinutes: number;
  totalEarnings: number;
  avgRating: number;
  ratingCount: number;
  ratings: RiderRating[];
}

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; color: string; icon: string }> = {
  assigned:   { label: 'Assigned',    color: Colors.skyBlue,   icon: 'assignment-ind' },
  accepted:   { label: 'Accepted',    color: '#9B59B6',         icon: 'check-circle' },
  picked_up:  { label: 'Picked Up',   color: Colors.warning,   icon: 'shopping-bag' },
  in_transit: { label: 'In Transit',  color: Colors.gold,      icon: 'local-shipping' },
  delivered:  { label: 'Delivered',   color: Colors.success,   icon: 'done-all' },
  failed:     { label: 'Failed',      color: Colors.danger,    icon: 'cancel' },
};

const NEXT_STATUS: Record<DeliveryStatus, DeliveryStatus | null> = {
  assigned:   'accepted',
  accepted:   'picked_up',
  picked_up:  'in_transit',
  in_transit: 'delivered',
  delivered:  null,
  failed:     null,
};

export default function RidersScreen() {
  const insets = useSafeAreaInsets();
  const { user, hasPermission } = useAuth();
  const { currentBranch } = useBranch();
  const { orders } = usePOS();
  const { showAlert } = useAlert();

  const [tabMode, setTabMode] = useState<TabMode>('deliveries');
  const [riders, setRiders] = useState<Rider[]>([]);
  const [deliveries, setDeliveries] = useState<RiderDelivery[]>([]);
  const [earnings, setEarnings] = useState<RiderEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter/search
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'all'>('all');
  const [riderFilter, setRiderFilter] = useState('all');
  const [searchRider, setSearchRider] = useState('');
  const [earningsMonth, setEarningsMonth] = useState(new Date().toISOString().slice(0, 7));

  // Modals
  const [showRiderModal, setShowRiderModal] = useState(false);
  const [editRider, setEditRider] = useState<Rider | null>(null);
  const [riderName, setRiderName] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  const [riderPin, setRiderPin] = useState('');
  const [savingRider, setSavingRider] = useState(false);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [assignRiderId, setAssignRiderId] = useState('');
  const [assignDeliveryFee, setAssignDeliveryFee] = useState('5000');
  const [assignNotes, setAssignNotes] = useState('');
  const [assigning, setAssigning] = useState(false);

  // GPS Tracking state
  const [riderLocations, setRiderLocations] = useState<RiderLocation[]>([]);
  const [selectedTrackingRider, setSelectedTrackingRider] = useState<string | null>(null);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const locationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef = useRef<any>(null);

  // Performance & Ratings state
  const [riderRatings, setRiderRatings] = useState<RiderRating[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [perfMonth, setPerfMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingDelivery, setRatingDelivery] = useState<RiderDelivery | null>(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingNotes, setRatingNotes] = useState('');
  const [savingRating, setSavingRating] = useState(false);

  const [showDeliveryDetail, setShowDeliveryDetail] = useState<RiderDelivery | null>(null);
  const [showOTPVerify, setShowOTPVerify] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [verifyingOTP, setVerifyingOTP] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [showFailModal, setShowFailModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const db = getSupabaseClient();

  // ─── Data Loading ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [ridersRes, deliveriesRes] = await Promise.all([
        db.from('pos_riders').select('*').order('created_at', { ascending: false }),
        db.from('pos_rider_deliveries').select('*, pos_orders(order_no, customer_name, customer_phone, customer_address, total)').order('assigned_at', { ascending: false }).limit(100),
      ]);
      if (ridersRes.data) setRiders(ridersRes.data);
      if (deliveriesRes.data) {
        setDeliveries(deliveriesRes.data.map((d: any) => ({
          ...d,
          order_no: d.pos_orders?.order_no,
          customer_name: d.pos_orders?.customer_name,
          customer_phone: d.pos_orders?.customer_phone,
          customer_address: d.pos_orders?.customer_address,
          total: d.pos_orders?.total,
        })));
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const loadEarnings = useCallback(async () => {
    try {
      const { data } = await db.from('pos_rider_earnings').select('*').eq('period_month', earningsMonth).order('created_at', { ascending: false });
      if (data) setEarnings(data);
    } catch {}
  }, [earningsMonth]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (tabMode === 'earnings') loadEarnings(); }, [tabMode, earningsMonth]);
  useEffect(() => { if (tabMode === 'performance') loadRiderRatings(); }, [tabMode, perfMonth]);

  // Poll rider locations every 30 seconds when tracking tab is active
  useEffect(() => {
    if (tabMode === 'tracking') {
      loadRiderLocations();
      locationPollRef.current = setInterval(loadRiderLocations, 30000);
    } else {
      if (locationPollRef.current) clearInterval(locationPollRef.current);
    }
    return () => { if (locationPollRef.current) clearInterval(locationPollRef.current); };
  }, [tabMode]);

  const loadRiderRatings = useCallback(async () => {
    setRatingsLoading(true);
    try {
      const monthStart = perfMonth + '-01';
      const monthEnd = perfMonth + '-31';
      const { data } = await db.from('pos_rider_ratings')
        .select('*')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd)
        .order('created_at', { ascending: false });
      if (data) setRiderRatings(data);
    } catch {}
    finally { setRatingsLoading(false); }
  }, [perfMonth]);

  const handleSaveRating = async () => {
    if (!ratingDelivery || !user) return;
    setSavingRating(true);
    try {
      const id = `rating_${Date.now()}`;
      const rating: RiderRating = {
        id,
        rider_id: ratingDelivery.rider_id,
        delivery_id: ratingDelivery.id,
        order_id: ratingDelivery.order_id,
        rating: ratingValue,
        notes: ratingNotes.trim() || undefined,
        rated_by: user.name || 'Manager',
        rated_by_role: user.role || 'Manager',
        created_at: new Date().toISOString(),
      };
      await db.from('pos_rider_ratings').insert(rating);
      setRiderRatings(prev => [rating, ...prev]);
      setShowRatingModal(false);
      setRatingNotes('');
      setRatingValue(5);
      showAlert('Rating Saved', `${ratingDelivery.rider_name} rated ${ratingValue}/5 stars.`);
    } catch { showAlert('Error', 'Could not save rating.'); }
    finally { setSavingRating(false); }
  };

  const loadRiderLocations = useCallback(async () => {
    setLoadingLocations(true);
    try {
      const { data } = await db.from('pos_rider_locations').select('*').order('updated_at', { ascending: false });
      if (data) setRiderLocations(data);
    } catch {}
    finally { setLoadingLocations(false); }
  }, []);

  const deliveryOrders = useMemo(() =>
    orders.filter(o => o.type === 'delivery' && o.status !== 'completed' && o.status !== 'cancelled')
  , [orders]);

  const filteredDeliveries = useMemo(() => {
    let list = deliveries;
    if (statusFilter !== 'all') list = list.filter(d => d.status === statusFilter);
    if (riderFilter !== 'all') list = list.filter(d => d.rider_id === riderFilter);
    return list;
  }, [deliveries, statusFilter, riderFilter]);

  const riderPerformance = useMemo((): RiderPerformance[] => {
    return riders.filter(r => r.status === 'active').map(rider => {
      const monthStart = perfMonth + '-01';
      const monthEnd = perfMonth + '-31';
      const monthDeliveries = deliveries.filter(d =>
        d.rider_id === rider.id &&
        d.assigned_at >= monthStart &&
        d.assigned_at <= monthEnd
      );
      const successful = monthDeliveries.filter(d => d.status === 'delivered').length;
      const failed = monthDeliveries.filter(d => d.status === 'failed').length;
      const total = monthDeliveries.length;

      // Average delivery time (assigned → delivered) in minutes
      const completedWithTimes = monthDeliveries.filter(d => d.status === 'delivered' && d.delivered_at);
      const avgMins = completedWithTimes.length > 0
        ? completedWithTimes.reduce((sum, d) => {
            const diff = (new Date(d.delivered_at!).getTime() - new Date(d.assigned_at).getTime()) / 60000;
            return sum + diff;
          }, 0) / completedWithTimes.length
        : 0;

      // Earnings for the month
      const riderEarningsMonth = earnings.filter(e =>
        e.rider_id === rider.id &&
        e.period_month === perfMonth
      );
      const totalEarnings = riderEarningsMonth.reduce((s, e) =>
        e.type === 'deduction' ? s - e.amount : s + e.amount, 0);

      // Ratings
      const myRatings = riderRatings.filter(r => r.rider_id === rider.id);
      const avgRating = myRatings.length > 0
        ? myRatings.reduce((s, r) => s + r.rating, 0) / myRatings.length
        : 0;

      return {
        rider,
        totalDeliveries: total,
        successful,
        failed,
        successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
        avgDeliveryMinutes: Math.round(avgMins),
        totalEarnings,
        avgRating,
        ratingCount: myRatings.length,
        ratings: myRatings.slice(0, 5),
      };
    }).sort((a, b) => b.successRate - a.successRate || b.totalDeliveries - a.totalDeliveries);
  }, [riders, deliveries, earnings, riderRatings, perfMonth]);

  const deliveredThisMonth = useMemo(() =>
    deliveries.filter(d => d.status === 'delivered' && d.assigned_at.startsWith(perfMonth)), [deliveries, perfMonth]);

  const earningsByRider = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number }> = {};
    earnings.forEach(e => {
      if (!map[e.rider_id]) map[e.rider_id] = { name: e.rider_name, total: 0, count: 0 };
      if (e.type === 'deduction') map[e.rider_id].total -= e.amount;
      else { map[e.rider_id].total += e.amount; map[e.rider_id].count += 1; }
    });
    return Object.entries(map).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);
  }, [earnings]);

  // ─── Rider CRUD ────────────────────────────────────────────────────────────
  const openAddRider = () => {
    setEditRider(null);
    setRiderName(''); setRiderPhone(''); setRiderPin('');
    setShowRiderModal(true);
  };

  const openEditRider = (rider: Rider) => {
    setEditRider(rider);
    setRiderName(rider.name); setRiderPhone(rider.phone); setRiderPin(rider.pin);
    setShowRiderModal(true);
  };

  const handleSaveRider = async () => {
    if (!riderName.trim() || !riderPhone.trim()) { showAlert('Missing Fields', 'Name and phone are required.'); return; }
    if (riderPin && (riderPin.length !== 4 || !/^\d{4}$/.test(riderPin))) { showAlert('Invalid PIN', 'PIN must be 4 digits.'); return; }
    setSavingRider(true);
    try {
      if (editRider) {
        await db.from('pos_riders').update({ name: riderName.trim(), phone: riderPhone.trim(), pin: riderPin }).eq('id', editRider.id);
        setRiders(prev => prev.map(r => r.id === editRider.id ? { ...r, name: riderName.trim(), phone: riderPhone.trim(), pin: riderPin } : r));
      } else {
        const id = `rider_${Date.now()}`;
        await db.from('pos_riders').insert({ id, name: riderName.trim(), phone: riderPhone.trim(), pin: riderPin, status: 'active' });
        setRiders(prev => [{ id, name: riderName.trim(), phone: riderPhone.trim(), pin: riderPin, status: 'active', created_at: new Date().toISOString() }, ...prev]);
      }
      setShowRiderModal(false);
      showAlert('Saved', `${riderName} ${editRider ? 'updated' : 'added'} successfully.`);
    } catch { showAlert('Error', 'Could not save rider.'); }
    finally { setSavingRider(false); }
  };

  const handleToggleRiderStatus = (rider: Rider) => {
    const newStatus = rider.status === 'active' ? 'inactive' : 'active';
    showAlert(`${newStatus === 'inactive' ? 'Deactivate' : 'Reactivate'} Rider`, `${newStatus === 'inactive' ? 'Deactivate' : 'Reactivate'} ${rider.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: newStatus === 'inactive' ? 'Deactivate' : 'Activate', style: newStatus === 'inactive' ? 'destructive' : 'default', onPress: async () => {
        await db.from('pos_riders').update({ status: newStatus }).eq('id', rider.id);
        setRiders(prev => prev.map(r => r.id === rider.id ? { ...r, status: newStatus } : r));
      }},
    ]);
  };

  // ─── Assign Delivery ────────────────────────────────────────────────────────
  const openAssignModal = (orderId: string) => {
    setSelectedOrderId(orderId); setAssignRiderId(''); setAssignDeliveryFee('5000'); setAssignNotes('');
    setShowAssignModal(true);
  };

  const handleAssignDelivery = async () => {
    if (!assignRiderId) { showAlert('Select Rider', 'Please choose a rider.'); return; }
    const rider = riders.find(r => r.id === assignRiderId);
    if (!rider) return;
    setAssigning(true);
    try {
      const delivId = `deliv_${Date.now()}`;
      const otp = String(Math.floor(1000 + Math.random() * 9000));
      await db.from('pos_rider_deliveries').insert({
        id: delivId, order_id: selectedOrderId,
        rider_id: assignRiderId, rider_name: rider.name, rider_phone: rider.phone,
        status: 'assigned', delivery_otp: otp, otp_verified: false,
        notes: assignNotes || null, assigned_at: new Date().toISOString(),
      });
      // Record earning
      const fee = parseFloat(assignDeliveryFee) || 0;
      if (fee > 0) {
        await db.from('pos_rider_earnings').insert({
          id: `earn_${Date.now()}`, rider_id: assignRiderId, rider_name: rider.name,
          delivery_id: delivId, order_id: selectedOrderId,
          amount: fee, type: 'delivery_fee',
          description: `Delivery fee for order ${selectedOrderId.slice(-6)}`,
          period_month: new Date().toISOString().slice(0, 7),
        });
      }
      // Send FCM notification to rider
      await sendRiderNotification(
        assignRiderId,
        '🚚 New Delivery Assigned!',
        `You have a new delivery. OTP: ${otp}. Check app for details.`,
        'delivery_assigned',
        { delivery_id: delivId, order_id: selectedOrderId, otp }
      );
      setShowAssignModal(false);
      showAlert('Rider Assigned', `${rider.name} assigned. OTP: ${otp}`);
      loadData();
    } catch { showAlert('Error', 'Could not assign rider.'); }
    finally { setAssigning(false); }
  };

  // ─── Update Delivery Status ─────────────────────────────────────────────────
  const handleUpdateStatus = async (delivery: RiderDelivery, newStatus: DeliveryStatus) => {
    if (newStatus === 'failed') { setShowDeliveryDetail(delivery); setShowFailModal(true); return; }
    if (newStatus === 'delivered') { setShowDeliveryDetail(delivery); setShowOTPVerify(true); return; }
    setUpdatingStatus(true);
    try {
      const now = new Date().toISOString();
      const timeField: Record<DeliveryStatus, string | null> = {
        accepted: 'accepted_at', picked_up: 'picked_up_at',
        in_transit: null, delivered: 'delivered_at', failed: 'failed_at', assigned: null,
      };
      const updateData: any = { status: newStatus, updated_at: now };
      const tf = timeField[newStatus];
      if (tf) updateData[tf] = now;
      await db.from('pos_rider_deliveries').update(updateData).eq('id', delivery.id);
      setDeliveries(prev => prev.map(d => d.id === delivery.id ? { ...d, status: newStatus, ...updateData } : d));
      if (showDeliveryDetail?.id === delivery.id) setShowDeliveryDetail(prev => prev ? { ...prev, status: newStatus } : null);
    } catch { showAlert('Error', 'Could not update status.'); }
    finally { setUpdatingStatus(false); }
  };

  const handleVerifyOTP = async () => {
    if (!showDeliveryDetail) return;
    if (otpInput !== showDeliveryDetail.delivery_otp) { showAlert('Invalid OTP', 'The OTP entered is incorrect.'); return; }
    setVerifyingOTP(true);
    try {
      const now = new Date().toISOString();
      await db.from('pos_rider_deliveries').update({ status: 'delivered', otp_verified: true, delivered_at: now, updated_at: now }).eq('id', showDeliveryDetail.id);
      setDeliveries(prev => prev.map(d => d.id === showDeliveryDetail.id ? { ...d, status: 'delivered', otp_verified: true, delivered_at: now } : d));
      setShowOTPVerify(false); setOtpInput('');
      setShowDeliveryDetail(null);
      showAlert('Delivered!', 'Delivery confirmed with OTP verification.');
    } catch { showAlert('Error', 'Could not confirm delivery.'); }
    finally { setVerifyingOTP(false); }
  };

  const handleMarkFailed = async () => {
    if (!showDeliveryDetail || !failReason.trim()) { showAlert('Reason Required', 'Please state the reason for failure.'); return; }
    setUpdatingStatus(true);
    try {
      const now = new Date().toISOString();
      await db.from('pos_rider_deliveries').update({ status: 'failed', fail_reason: failReason.trim(), failed_at: now, updated_at: now }).eq('id', showDeliveryDetail.id);
      setDeliveries(prev => prev.map(d => d.id === showDeliveryDetail.id ? { ...d, status: 'failed', fail_reason: failReason.trim() } : d));
      // Notify rider about failed delivery follow-up
      await sendRiderNotification(
        showDeliveryDetail.rider_id,
        '❌ Delivery Failed — Follow Up Required',
        `Delivery ${showDeliveryDetail.order_no || ''} marked failed: ${failReason.trim()}. Contact manager for next steps.`,
        'delivery_failed',
        { delivery_id: showDeliveryDetail.id, reason: failReason.trim() }
      );
      setShowFailModal(false); setFailReason(''); setShowDeliveryDetail(null);
      showAlert('Marked Failed', 'Delivery marked as failed.');
    } catch { showAlert('Error', 'Could not update status.'); }
    finally { setUpdatingStatus(false); }
  };

  const handleUploadProof = async (delivery: RiderDelivery) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showAlert('Permission', 'Gallery permission required.'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) return;
      setUploadingPhoto(true);
      const ext = 'jpg';
      const path = `deliveries/${delivery.id}_proof.${ext}`;
      const bytes = Uint8Array.from(atob(asset.base64), c => c.charCodeAt(0));
      const { error } = await db.storage.from('pos-product-images').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (!error) {
        const { data } = db.storage.from('pos-product-images').getPublicUrl(path);
        await db.from('pos_rider_deliveries').update({ delivery_photo_url: data.publicUrl }).eq('id', delivery.id);
        setDeliveries(prev => prev.map(d => d.id === delivery.id ? { ...d, delivery_photo_url: data.publicUrl } : d));
        showAlert('Photo Uploaded', 'Delivery proof photo saved.');
      }
    } catch { showAlert('Error', 'Could not upload photo.'); }
    finally { setUploadingPhoto(false); }
  };

  // ─── Send FCM Notification ──────────────────────────────────────────────────
  const sendRiderNotification = useCallback(async (
    riderId: string,
    title: string,
    body: string,
    notificationType: string,
    data?: Record<string, string>
  ) => {
    try {
      const { error } = await db.functions.invoke('send-rider-notification', {
        body: { rider_id: riderId, title, body, notification_type: notificationType, data },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const text = await error.context?.text();
          console.log('FCM error:', text);
        }
      }
    } catch (err) {
      console.log('sendRiderNotification error:', err);
    }
  }, []);

  // ─── Financial Report ───────────────────────────────────────────────────────
  const buildEarningsReportHTML = () => {
    const totalEarnings = earningsByRider.reduce((s, r) => s + r.total, 0);
    const totalDeliveries = earningsByRider.reduce((s, r) => s + r.count, 0);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:24px;}
.header{text-align:center;border-bottom:3px solid #22C55E;padding-bottom:16px;margin-bottom:20px;}
.brand{font-size:22px;font-weight:900;color:#16A34A;letter-spacing:2px;}
table{width:100%;border-collapse:collapse;margin:16px 0;}
th{background:#0A1F0E;color:#22C55E;padding:10px;text-align:left;}td{padding:8px 10px;border-bottom:1px solid #eee;}
.hi{font-weight:bold;color:#16A34A;}.total{font-size:18px;font-weight:900;color:#16A34A;}
</style></head><body>
<div class="header"><div class="brand">HESA GIFT ARENA</div>
<div style="font-size:17px;font-weight:bold;margin-top:8px;">RIDER EARNINGS REPORT — ${earningsMonth}</div></div>
<table><tr><th>Summary</th><th>Value</th></tr>
<tr><td>Total Riders Active</td><td class="hi">${earningsByRider.length}</td></tr>
<tr><td>Total Deliveries</td><td class="hi">${totalDeliveries}</td></tr>
<tr><td>Total Earnings Paid Out</td><td class="total">UGX ${totalEarnings.toLocaleString()}</td></tr>
</table>
<table><tr><th>#</th><th>Rider</th><th>Deliveries</th><th>Earnings</th></tr>
${earningsByRider.map((r, i) => `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.count}</td><td class="hi">UGX ${r.total.toLocaleString()}</td></tr>`).join('')}
</table>
<p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px;">HESA GIFT ARENA POS · Rider Report · ${earningsMonth}</p>
</body></html>`;
  };

  const handleShareReport = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: buildEarningsReportHTML() });
      const ok = await Sharing.isAvailableAsync();
      if (ok) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Rider Report ${earningsMonth}` });
    } catch { showAlert('Error', 'Could not generate report.'); }
  };

  // ─── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: deliveries.length,
    assigned: deliveries.filter(d => d.status === 'assigned').length,
    inProgress: deliveries.filter(d => ['accepted', 'picked_up', 'in_transit'].includes(d.status)).length,
    delivered: deliveries.filter(d => d.status === 'delivered').length,
    failed: deliveries.filter(d => d.status === 'failed').length,
    activeRiders: riders.filter(r => r.status === 'active').length,
  }), [deliveries, riders]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Rider Management</Text>
          <Text style={styles.headerSub}>{stats.activeRiders} active riders · {stats.inProgress} in transit</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => { setRefreshing(true); loadData(); }}>
            {refreshing ? <ActivityIndicator size="small" color={Colors.gold} /> : <MaterialIcons name="refresh" size={20} color={Colors.gold} />}
          </TouchableOpacity>
          {hasPermission('orders') && (
            <TouchableOpacity style={styles.addRiderBtn} onPress={openAddRider}>
              <MaterialIcons name="person-add" size={16} color={Colors.navy} />
              <Text style={styles.addRiderBtnText}>Add Rider</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab Toggle */}
      <View style={styles.tabRow}>
        {([
          { key: 'deliveries', label: 'Deliveries', icon: 'local-shipping' },
          { key: 'riders', label: 'Riders', icon: 'two-wheeler' },
          { key: 'earnings', label: 'Earnings', icon: 'payments' },
          { key: 'tracking', label: 'Live Map', icon: 'map' },
          { key: 'performance', label: 'Performance', icon: 'insights' },
        ] as { key: TabMode; label: string; icon: string }[]).map(t => (
          <TouchableOpacity key={t.key} style={[styles.tabBtn, tabMode === t.key && styles.tabBtnActive]} onPress={() => setTabMode(t.key)}>
            <MaterialIcons name={t.icon as any} size={15} color={tabMode === t.key ? Colors.navy : Colors.textMuted} />
            <Text style={[styles.tabBtnText, tabMode === t.key && styles.tabBtnTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* KPI Strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiStrip}>
        {[
          { label: 'Total', value: stats.total, color: Colors.skyBlue },
          { label: 'Assigned', value: stats.assigned, color: Colors.warning },
          { label: 'In Transit', value: stats.inProgress, color: Colors.gold },
          { label: 'Delivered', value: stats.delivered, color: Colors.success },
          { label: 'Failed', value: stats.failed, color: Colors.danger },
        ].map(k => (
          <View key={k.label} style={[styles.kpiChip, { borderColor: k.color + '40' }]}>
            <Text style={[styles.kpiChipValue, { color: k.color }]}>{k.value}</Text>
            <Text style={styles.kpiChipLabel}>{k.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* ── DELIVERIES TAB ───────────────────────────────────────────────────── */}
      {tabMode === 'deliveries' && (
        <View style={{ flex: 1 }}>
          {/* Status Filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {(['all', 'assigned', 'accepted', 'picked_up', 'in_transit', 'delivered', 'failed'] as const).map(s => {
              const cfg = s === 'all' ? null : STATUS_CONFIG[s];
              const isActive = statusFilter === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.filterChip, isActive && { backgroundColor: (cfg?.color || Colors.gold) + '20', borderColor: cfg?.color || Colors.gold }]}
                  onPress={() => setStatusFilter(s)}
                >
                  {cfg && <MaterialIcons name={cfg.icon as any} size={11} color={isActive ? cfg.color : Colors.textMuted} />}
                  <Text style={[styles.filterChipText, isActive && { color: cfg?.color || Colors.gold, fontWeight: Typography.bold }]}>
                    {s === 'all' ? 'All' : cfg?.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Unassigned Orders Banner */}
          {deliveryOrders.length > 0 && hasPermission('orders') && (
            <TouchableOpacity style={styles.unassignedBanner} onPress={() => setShowAssignModal(true)}>
              <View style={styles.unassignedLeft}>
                <MaterialIcons name="local-shipping" size={18} color={Colors.warning} />
                <View>
                  <Text style={styles.unassignedTitle}>{deliveryOrders.length} delivery order{deliveryOrders.length !== 1 ? 's' : ''} awaiting rider</Text>
                  <Text style={styles.unassignedSub}>Tap to assign a rider</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={18} color={Colors.warning} />
            </TouchableOpacity>
          )}

          {loading ? (
            <View style={styles.centered}><ActivityIndicator size="large" color={Colors.gold} /></View>
          ) : filteredDeliveries.length === 0 ? (
            <View style={styles.centered}>
              <MaterialIcons name="local-shipping" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No deliveries found</Text>
              <Text style={styles.emptySubText}>Assign riders to delivery orders to see them here</Text>
            </View>
          ) : (
            <FlatList
              data={filteredDeliveries}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const cfg = STATUS_CONFIG[item.status];
                const nextStatus = NEXT_STATUS[item.status];
                const nextCfg = nextStatus ? STATUS_CONFIG[nextStatus] : null;
                return (
                  <TouchableOpacity style={styles.deliveryCard} onPress={() => setShowDeliveryDetail(item)} activeOpacity={0.85}>
                    <View style={styles.deliveryCardTop}>
                      <View style={styles.deliveryCardLeft}>
                        <View style={[styles.statusIcon, { backgroundColor: cfg.color + '20' }]}>
                          <MaterialIcons name={cfg.icon as any} size={20} color={cfg.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.orderNo}>{item.order_no || item.order_id.slice(-8)}</Text>
                            <View style={[styles.statusPill, { backgroundColor: cfg.color + '20' }]}>
                              <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
                            </View>
                            {item.otp_verified && <MaterialIcons name="verified" size={14} color={Colors.success} />}
                          </View>
                          <Text style={styles.customerName} numberOfLines={1}>{item.customer_name || 'Customer'}</Text>
                          <Text style={styles.customerAddress} numberOfLines={1}>{item.customer_address || 'No address'}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        {item.total ? <Text style={styles.orderTotal}>{formatUGX(Number(item.total))}</Text> : null}
                        <Text style={styles.assignedTime}>{new Date(item.assigned_at).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                    </View>

                    <View style={styles.deliveryRiderRow}>
                      <View style={styles.riderChip}>
                        <MaterialIcons name="two-wheeler" size={13} color={Colors.skyBlue} />
                        <Text style={styles.riderChipText}>{item.rider_name}</Text>
                        <Text style={styles.riderChipPhone}>{item.rider_phone}</Text>
                      </View>
                      {item.delivery_photo_url && <MaterialIcons name="photo" size={14} color={Colors.success} />}
                    </View>

                    {nextStatus && nextCfg && hasPermission('orders') && (
                      <TouchableOpacity
                        style={[styles.advanceBtn, { backgroundColor: nextCfg.color + '18', borderColor: nextCfg.color + '50' }]}
                        onPress={() => handleUpdateStatus(item, nextStatus)}
                        disabled={updatingStatus}
                      >
                        <MaterialIcons name={nextCfg.icon as any} size={13} color={nextCfg.color} />
                        <Text style={[styles.advanceBtnText, { color: nextCfg.color }]}>Mark as {nextCfg.label}</Text>
                      </TouchableOpacity>
                    )}
                    {item.status === 'in_transit' && hasPermission('orders') && (
                      <TouchableOpacity
                        style={[styles.advanceBtn, { backgroundColor: Colors.danger + '18', borderColor: Colors.danger + '50', marginTop: 4 }]}
                        onPress={() => { setShowDeliveryDetail(item); setShowFailModal(true); }}
                      >
                        <MaterialIcons name="cancel" size={13} color={Colors.danger} />
                        <Text style={[styles.advanceBtnText, { color: Colors.danger }]}>Mark Failed</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ── RIDERS TAB ───────────────────────────────────────────────────────── */}
      {tabMode === 'riders' && (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {/* Search */}
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={16} color={Colors.textMuted} />
            <TextInput style={styles.searchInput} placeholder="Search riders..." placeholderTextColor={Colors.textMuted} value={searchRider} onChangeText={setSearchRider} />
          </View>

          {riders.filter(r => !searchRider || r.name.toLowerCase().includes(searchRider.toLowerCase()) || r.phone.includes(searchRider)).map(rider => {
            const riderDeliveries = deliveries.filter(d => d.rider_id === rider.id);
            const active = riderDeliveries.filter(d => ['assigned', 'accepted', 'picked_up', 'in_transit'].includes(d.status)).length;
            const completed = riderDeliveries.filter(d => d.status === 'delivered').length;
            return (
              <View key={rider.id} style={[styles.riderCard, rider.status === 'inactive' && { opacity: 0.6 }]}>
                <View style={styles.riderCardLeft}>
                  <View style={[styles.riderAvatar, { backgroundColor: rider.status === 'active' ? Colors.gold + '20' : Colors.navyLight }]}>
                    <Text style={[styles.riderAvatarText, { color: rider.status === 'active' ? Colors.gold : Colors.textMuted }]}>
                      {rider.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.riderName}>{rider.name}</Text>
                      <View style={[styles.riderStatusPill, { backgroundColor: rider.status === 'active' ? Colors.successMuted : Colors.dangerMuted }]}>
                        <View style={[styles.riderStatusDot, { backgroundColor: rider.status === 'active' ? Colors.success : Colors.danger }]} />
                        <Text style={[styles.riderStatusText, { color: rider.status === 'active' ? Colors.success : Colors.danger }]}>{rider.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.riderPhone}>{rider.phone}</Text>
                    <View style={styles.riderStats}>
                      {active > 0 && <View style={styles.riderStatChip}><MaterialIcons name="local-shipping" size={10} color={Colors.warning} /><Text style={[styles.riderStatText, { color: Colors.warning }]}>{active} active</Text></View>}
                      <View style={styles.riderStatChip}><MaterialIcons name="done-all" size={10} color={Colors.success} /><Text style={[styles.riderStatText, { color: Colors.success }]}>{completed} done</Text></View>
                    </View>
                  </View>
                </View>
                <View style={styles.riderCardActions}>
                  {hasPermission('orders') && (
                    <TouchableOpacity style={styles.riderActionBtn} onPress={() => openEditRider(rider)}>
                      <MaterialIcons name="edit" size={14} color={Colors.skyBlue} />
                    </TouchableOpacity>
                  )}
                  {hasPermission('orders') && (
                    <TouchableOpacity
                      style={[styles.riderActionBtn, { borderColor: (rider.status === 'active' ? Colors.danger : Colors.success) + '40' }]}
                      onPress={() => handleToggleRiderStatus(rider)}
                    >
                      <MaterialIcons name={rider.status === 'active' ? 'person-off' : 'person'} size={14} color={rider.status === 'active' ? Colors.danger : Colors.success} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          {riders.length === 0 && (
            <View style={styles.centered}>
              <MaterialIcons name="two-wheeler" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No riders yet</Text>
              <TouchableOpacity style={styles.emptyAddBtn} onPress={openAddRider}>
                <MaterialIcons name="person-add" size={16} color={Colors.navy} />
                <Text style={styles.emptyAddBtnText}>Add First Rider</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── TRACKING TAB ─────────────────────────────────────────────────────── */}
      {tabMode === 'tracking' && (
        <View style={{ flex: 1 }}>
          {/* Rider selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={{ maxHeight: 52, flexGrow: 0 }}>
            <TouchableOpacity
              style={[styles.filterChip, selectedTrackingRider === null && { backgroundColor: Colors.gold + '20', borderColor: Colors.gold }]}
              onPress={() => setSelectedTrackingRider(null)}
            >
              <Text style={[styles.filterChipText, selectedTrackingRider === null && { color: Colors.gold, fontWeight: Typography.bold }]}>All Riders</Text>
            </TouchableOpacity>
            {riders.filter(r => r.status === 'active').map(r => {
              const loc = riderLocations.find(l => l.rider_id === r.id);
              const isSelected = selectedTrackingRider === r.id;
              const isOnline = loc && (Date.now() - new Date(loc.updated_at).getTime()) < 5 * 60 * 1000;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.filterChip, isSelected && { backgroundColor: Colors.success + '20', borderColor: Colors.success }]}
                  onPress={() => setSelectedTrackingRider(r.id)}
                >
                  <View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: isOnline ? Colors.success : Colors.textMuted }]} />
                  <Text style={[styles.filterChipText, isSelected && { color: Colors.success, fontWeight: Typography.bold }]}>{r.name.split(' ')[0]}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[styles.filterChip, { borderColor: Colors.skyBlue + '40' }]} onPress={loadRiderLocations}>
              {loadingLocations
                ? <ActivityIndicator size={11} color={Colors.skyBlue} />
                : <MaterialIcons name="refresh" size={14} color={Colors.skyBlue} />
              }
              <Text style={[styles.filterChipText, { color: Colors.skyBlue }]}>Refresh</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Map */}
          <View style={{ flex: 1, margin: Spacing.md, borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.borderGold }}>
            <RiderMapRenderer
              mapRef={mapRef}
              initialLat={0.3476}
              initialLng={32.5825}
              markers={riderLocations
                .filter(loc => selectedTrackingRider === null || loc.rider_id === selectedTrackingRider)
                .flatMap(loc => {
                  const rider = riders.find(r => r.id === loc.rider_id);
                  const isOnline = (Date.now() - new Date(loc.updated_at).getTime()) < 5 * 60 * 1000;
                  const activeDelivery = deliveries.find(d => d.rider_id === loc.rider_id && ['accepted', 'picked_up', 'in_transit'].includes(d.status));
                  const distKm = activeDelivery?.customer_lat && activeDelivery?.customer_lng
                    ? haversineKm(loc.lat, loc.lng, Number(activeDelivery.customer_lat), Number(activeDelivery.customer_lng))
                    : null;
                  const eta = distKm !== null ? estimateETA(distKm) : null;
                  const result: any[] = [{
                    id: `rider_${loc.id}`,
                    lat: Number(loc.lat),
                    lng: Number(loc.lng),
                    title: rider?.name || 'Rider',
                    description: eta ? `ETA: ${eta} · ${distKm?.toFixed(1)}km` : `Updated: ${new Date(loc.updated_at).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}`,
                    color: isOnline ? Colors.success : '#888',
                  }];
                  if (activeDelivery?.customer_lat && activeDelivery?.customer_lng) {
                    result.push({
                      id: `cust_${loc.id}`,
                      lat: Number(activeDelivery.customer_lat),
                      lng: Number(activeDelivery.customer_lng),
                      title: activeDelivery.customer_name || 'Customer',
                      description: activeDelivery.customer_address || '',
                      color: Colors.danger,
                    });
                  }
                  return result;
                })
              }
              polylines={riderLocations
                .filter(loc => selectedTrackingRider === null || loc.rider_id === selectedTrackingRider)
                .flatMap(loc => {
                  const activeDelivery = deliveries.find(d => d.rider_id === loc.rider_id && ['accepted', 'picked_up', 'in_transit'].includes(d.status));
                  if (!activeDelivery?.customer_lat || !activeDelivery?.customer_lng) return [];
                  return [{ from: { lat: Number(loc.lat), lng: Number(loc.lng) }, to: { lat: Number(activeDelivery.customer_lat), lng: Number(activeDelivery.customer_lng) }, color: Colors.gold }];
                })
              }
            />
          </View>

          {/* Rider location cards below map */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, gap: 10 }} style={{ maxHeight: 110, flexGrow: 0 }}>
            {riders.filter(r => r.status === 'active').map(rider => {
              const loc = riderLocations.find(l => l.rider_id === rider.id);
              const isOnline = loc && (Date.now() - new Date(loc.updated_at).getTime()) < 5 * 60 * 1000;
              const activeDelivery = deliveries.find(d => d.rider_id === rider.id && ['accepted', 'picked_up', 'in_transit'].includes(d.status));
              const distKm = loc && activeDelivery?.customer_lat && activeDelivery?.customer_lng
                ? haversineKm(loc.lat, loc.lng, Number(activeDelivery.customer_lat), Number(activeDelivery.customer_lng))
                : null;
              return (
                <TouchableOpacity
                  key={rider.id}
                  style={[styles.riderLocCard, selectedTrackingRider === rider.id && { borderColor: Colors.gold }]}
                  onPress={() => {
                    setSelectedTrackingRider(rider.id === selectedTrackingRider ? null : rider.id);
                    if (loc && mapRef.current) {
                      mapRef.current.animateToRegion({ latitude: Number(loc.lat), longitude: Number(loc.lng), latitudeDelta: 0.02, longitudeDelta: 0.02 }, 800);
                    }
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOnline ? Colors.success : Colors.textMuted }]} />
                    <Text style={styles.riderLocName}>{rider.name.split(' ')[0]}</Text>
                  </View>
                  {loc ? (
                    <>
                      <Text style={styles.riderLocTime}>Updated {new Date(loc.updated_at).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}</Text>
                      {distKm !== null && <Text style={[styles.riderLocTime, { color: Colors.gold }]}>ETA: {estimateETA(distKm)}</Text>}
                      {activeDelivery && <Text style={styles.riderLocDelivery}>{STATUS_CONFIG[activeDelivery.status as DeliveryStatus]?.label || activeDelivery.status}</Text>}
                    </>
                  ) : (
                    <Text style={styles.riderLocTime}>No location data</Text>
                  )}
                </TouchableOpacity>
              );
            })}
            {riders.filter(r => r.status === 'active').length === 0 && (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No active riders</Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* ── EARNINGS TAB ─────────────────────────────────────────────────────── */}
      {tabMode === 'earnings' && (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {/* Month selector */}
          <View style={styles.monthPickerRow}>
            <TouchableOpacity style={styles.monthBtn} onPress={() => {
              const d = new Date(earningsMonth + '-01');
              d.setMonth(d.getMonth() - 1);
              setEarningsMonth(d.toISOString().slice(0, 7));
            }}>
              <MaterialIcons name="chevron-left" size={22} color={Colors.gold} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{new Date(earningsMonth + '-01').toLocaleDateString('en-UG', { year: 'numeric', month: 'long' })}</Text>
            <TouchableOpacity style={styles.monthBtn} onPress={() => {
              const d = new Date(earningsMonth + '-01');
              d.setMonth(d.getMonth() + 1);
              setEarningsMonth(d.toISOString().slice(0, 7));
            }}>
              <MaterialIcons name="chevron-right" size={22} color={Colors.gold} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareReportBtn} onPress={handleShareReport}>
              <MaterialIcons name="share" size={15} color={Colors.navy} />
              <Text style={styles.shareReportBtnText}>Report</Text>
            </TouchableOpacity>
          </View>

          {/* Summary Cards */}
          <View style={styles.earningsSummary}>
            {[
              { label: 'Total Payout', value: formatUGX(earningsByRider.reduce((s, r) => s + r.total, 0)), color: Colors.gold },
              { label: 'Deliveries', value: String(earningsByRider.reduce((s, r) => s + r.count, 0)), color: Colors.skyBlue },
              { label: 'Riders Paid', value: String(earningsByRider.length), color: Colors.success },
            ].map(k => (
              <View key={k.label} style={[styles.earningSummaryCard, { borderColor: k.color + '30' }]}>
                <Text style={[styles.earningSummaryValue, { color: k.color }]}>{k.value}</Text>
                <Text style={styles.earningSummaryLabel}>{k.label}</Text>
              </View>
            ))}
          </View>

          {/* Rider Breakdown */}
          {earningsByRider.length === 0 ? (
            <View style={styles.centered}>
              <MaterialIcons name="payments" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No earnings recorded for {earningsMonth}</Text>
            </View>
          ) : earningsByRider.map((rider, i) => (
            <View key={rider.id} style={styles.earningRiderCard}>
              <View style={styles.earningRiderTop}>
                <View style={[styles.earningRank, { backgroundColor: i === 0 ? Colors.gold : i === 1 ? '#A8A8A8' : Colors.navyLight }]}>
                  <Text style={[styles.earningRankText, { color: i < 2 ? Colors.navy : Colors.textMuted }]}>#{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.earningRiderName}>{rider.name}</Text>
                  <Text style={styles.earningRiderMeta}>{rider.count} deliveries completed</Text>
                </View>
                <Text style={styles.earningRiderTotal}>{formatUGX(rider.total)}</Text>
              </View>
              <View style={styles.earningBar}>
                <View style={[styles.earningBarFill, {
                  width: `${Math.min(100, (rider.total / (earningsByRider[0]?.total || 1)) * 100)}%`,
                  backgroundColor: i === 0 ? Colors.gold : Colors.success,
                }]} />
              </View>
            </View>
          ))}

          {/* Transaction Log */}
          {earnings.length > 0 && (
            <View style={styles.earningsLogSection}>
              <Text style={styles.logSectionTitle}>Transaction Log</Text>
              {earnings.slice(0, 20).map(e => (
                <View key={e.id} style={styles.earningLogRow}>
                  <View style={[styles.earningLogIcon, { backgroundColor: e.type === 'deduction' ? Colors.dangerMuted : Colors.successMuted }]}>
                    <MaterialIcons name={e.type === 'deduction' ? 'remove' : 'add'} size={14} color={e.type === 'deduction' ? Colors.danger : Colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.earningLogName}>{e.rider_name}</Text>
                    <Text style={styles.earningLogDesc} numberOfLines={1}>{e.description}</Text>
                  </View>
                  <Text style={[styles.earningLogAmount, { color: e.type === 'deduction' ? Colors.danger : Colors.success }]}>
                    {e.type === 'deduction' ? '-' : '+'}{formatUGX(e.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── PERFORMANCE TAB ─────────────────────────────────────────────────── */}
      {tabMode === 'performance' && (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {/* Month Selector */}
          <View style={styles.monthPickerRow}>
            <TouchableOpacity style={styles.monthBtn} onPress={() => {
              const d = new Date(perfMonth + '-01');
              d.setMonth(d.getMonth() - 1);
              setPerfMonth(d.toISOString().slice(0, 7));
            }}>
              <MaterialIcons name="chevron-left" size={22} color={Colors.gold} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{new Date(perfMonth + '-01').toLocaleDateString('en-UG', { year: 'numeric', month: 'long' })}</Text>
            <TouchableOpacity style={styles.monthBtn} onPress={() => {
              const d = new Date(perfMonth + '-01');
              d.setMonth(d.getMonth() + 1);
              setPerfMonth(d.toISOString().slice(0, 7));
            }}>
              <MaterialIcons name="chevron-right" size={22} color={Colors.gold} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareReportBtn} onPress={loadRiderRatings} disabled={ratingsLoading}>
              {ratingsLoading ? <ActivityIndicator size="small" color={Colors.navy} /> : <MaterialIcons name="refresh" size={15} color={Colors.navy} />}
              <Text style={styles.shareReportBtnText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {/* Month Overview Cards */}
          <View style={[styles.earningsSummary, { marginBottom: 4 }]}>
            {[
              { label: 'Total Deliveries', value: String(riderPerformance.reduce((s, r) => s + r.totalDeliveries, 0)), color: Colors.skyBlue },
              { label: 'Success Rate', value: riderPerformance.length > 0 ? `${Math.round(riderPerformance.reduce((s, r) => s + r.successRate, 0) / riderPerformance.length)}%` : '—', color: Colors.success },
              { label: 'Avg Rating', value: riderRatings.length > 0 ? `${(riderRatings.reduce((s, r) => s + r.rating, 0) / riderRatings.length).toFixed(1)}★` : '—', color: Colors.gold },
            ].map(k => (
              <View key={k.label} style={[styles.earningSummaryCard, { borderColor: k.color + '30' }]}>
                <Text style={[styles.earningSummaryValue, { color: k.color }]}>{k.value}</Text>
                <Text style={styles.earningSummaryLabel}>{k.label}</Text>
              </View>
            ))}
          </View>

          {/* Rate a Delivery CTA */}
          {deliveredThisMonth.length > 0 && (user?.role === 'Manager' || user?.role === 'Super Admin') && (
            <TouchableOpacity
              style={styles.rateDeliveryCTA}
              onPress={() => { setRatingDelivery(deliveredThisMonth[0]); setRatingValue(5); setRatingNotes(''); setShowRatingModal(true); }}
            >
              <MaterialIcons name="star" size={18} color={Colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rateDeliveryCTATitle}>Rate a Completed Delivery</Text>
                <Text style={styles.rateDeliveryCTASub}>{deliveredThisMonth.length} completed deliveries this month</Text>
              </View>
              <MaterialIcons name="chevron-right" size={16} color={Colors.gold} />
            </TouchableOpacity>
          )}

          {/* Per-Rider Performance Cards */}
          {riderPerformance.length === 0 ? (
            <View style={styles.centered}>
              <MaterialIcons name="insights" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No performance data yet</Text>
              <Text style={styles.emptySubText}>Performance metrics appear after deliveries are completed</Text>
            </View>
          ) : riderPerformance.map((perf, idx) => (
            <View key={perf.rider.id} style={styles.perfCard}>
              {/* Card Header */}
              <View style={styles.perfCardHeader}>
                <View style={[styles.riderAvatar, { backgroundColor: Colors.gold + '20' }]}>
                  <Text style={[styles.riderAvatarText, { color: Colors.gold }]}>
                    {perf.rider.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.perfRiderName}>{perf.rider.name}</Text>
                    {idx === 0 && perf.totalDeliveries > 0 && (
                      <View style={styles.topPerformerBadge}>
                        <MaterialIcons name="emoji-events" size={10} color={Colors.navy} />
                        <Text style={styles.topPerformerText}>Top</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.perfRiderPhone}>{perf.rider.phone}</Text>
                </View>
                {/* Star Rating Display */}
                <View style={styles.perfStarRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <MaterialIcons
                      key={star}
                      name={star <= Math.round(perf.avgRating) ? 'star' : 'star-border'}
                      size={16}
                      color={Colors.gold}
                    />
                  ))}
                </View>
              </View>

              {/* Metrics Grid */}
              <View style={styles.perfMetricsGrid}>
                <View style={styles.perfMetric}>
                  <Text style={[styles.perfMetricValue, { color: Colors.skyBlue }]}>{perf.totalDeliveries}</Text>
                  <Text style={styles.perfMetricLabel}>Deliveries</Text>
                </View>
                <View style={[styles.perfMetricDivider]} />
                <View style={styles.perfMetric}>
                  <Text style={[styles.perfMetricValue, { color: Colors.success }]}>{perf.successful}</Text>
                  <Text style={styles.perfMetricLabel}>Successful</Text>
                </View>
                <View style={styles.perfMetricDivider} />
                <View style={styles.perfMetric}>
                  <Text style={[styles.perfMetricValue, { color: Colors.danger }]}>{perf.failed}</Text>
                  <Text style={styles.perfMetricLabel}>Failed</Text>
                </View>
                <View style={styles.perfMetricDivider} />
                <View style={styles.perfMetric}>
                  <Text style={[styles.perfMetricValue, { color: perf.successRate >= 80 ? Colors.success : perf.successRate >= 50 ? Colors.warning : Colors.danger }]}>
                    {perf.successRate}%
                  </Text>
                  <Text style={styles.perfMetricLabel}>Rate</Text>
                </View>
              </View>

              {/* Progress Bar — Success Rate */}
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.perfBarLabel}>Success Rate</Text>
                  <Text style={[styles.perfBarLabel, { color: perf.successRate >= 80 ? Colors.success : Colors.warning }]}>{perf.successRate}%</Text>
                </View>
                <View style={styles.perfProgressBg}>
                  <View style={[styles.perfProgressFill, {
                    width: `${perf.successRate}%`,
                    backgroundColor: perf.successRate >= 80 ? Colors.success : perf.successRate >= 50 ? Colors.warning : Colors.danger,
                  }]} />
                </View>
              </View>

              {/* Delivery Time + Earnings + Rating */}
              <View style={styles.perfExtraRow}>
                <View style={styles.perfExtraChip}>
                  <MaterialIcons name="schedule" size={12} color={Colors.textMuted} />
                  <Text style={styles.perfExtraText}>
                    {perf.avgDeliveryMinutes > 0
                      ? perf.avgDeliveryMinutes >= 60
                        ? `${Math.floor(perf.avgDeliveryMinutes / 60)}h ${perf.avgDeliveryMinutes % 60}m avg`
                        : `${perf.avgDeliveryMinutes}m avg delivery`
                      : 'No data'}
                  </Text>
                </View>
                <View style={styles.perfExtraChip}>
                  <MaterialIcons name="payments" size={12} color={Colors.gold} />
                  <Text style={[styles.perfExtraText, { color: Colors.gold }]}>{formatUGX(perf.totalEarnings)}</Text>
                </View>
                <View style={styles.perfExtraChip}>
                  <MaterialIcons name="star" size={12} color={Colors.gold} />
                  <Text style={styles.perfExtraText}>
                    {perf.ratingCount > 0 ? `${perf.avgRating.toFixed(1)} (${perf.ratingCount})` : 'Not rated'}
                  </Text>
                </View>
              </View>

              {/* Recent Ratings */}
              {perf.ratings.length > 0 && (
                <View style={styles.recentRatingsSection}>
                  <Text style={styles.recentRatingsTitle}>Recent Ratings</Text>
                  {perf.ratings.map(r => (
                    <View key={r.id} style={styles.recentRatingRow}>
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        {[1, 2, 3, 4, 5].map(s => (
                          <MaterialIcons key={s} name={s <= r.rating ? 'star' : 'star-border'} size={13} color={Colors.gold} />
                        ))}
                      </View>
                      <Text style={styles.recentRatingBy} numberOfLines={1}>
                        {r.notes || `Rated by ${r.rated_by}`}
                      </Text>
                      <Text style={styles.recentRatingDate}>{new Date(r.created_at).toLocaleDateString('en-UG', { month: 'short', day: 'numeric' })}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Rate Button */}
              {(user?.role === 'Manager' || user?.role === 'Super Admin') && (
                <TouchableOpacity
                  style={styles.rateRiderBtn}
                  onPress={() => {
                    const latestDelivery = deliveredThisMonth.find(d => d.rider_id === perf.rider.id);
                    if (!latestDelivery) { showAlert('No Deliveries', 'No completed deliveries this month to rate.'); return; }
                    setRatingDelivery(latestDelivery);
                    setRatingValue(5);
                    setRatingNotes('');
                    setShowRatingModal(true);
                  }}
                >
                  <MaterialIcons name="star" size={14} color={Colors.navy} />
                  <Text style={styles.rateRiderBtnText}>Rate {perf.rider.name.split(' ')[0]}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── ASSIGN RIDER MODAL ────────────────────────────────────────────────── */}
      <Modal visible={showAssignModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Rider</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}><MaterialIcons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Order Picker */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Select Order *</Text>
                {deliveryOrders.length === 0 ? (
                  <View style={styles.noOrdersBanner}>
                    <MaterialIcons name="info" size={14} color={Colors.skyBlue} />
                    <Text style={styles.noOrdersText}>No unassigned delivery orders</Text>
                  </View>
                ) : deliveryOrders.map(order => (
                  <TouchableOpacity
                    key={order.id}
                    style={[styles.orderPickRow, selectedOrderId === order.id && styles.orderPickRowActive]}
                    onPress={() => setSelectedOrderId(order.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderPickNo}>{order.orderNo}</Text>
                      <Text style={styles.orderPickCustomer}>{order.customerName} · {order.customerPhone}</Text>
                      <Text style={styles.orderPickAddr} numberOfLines={1}>{order.customerAddress || 'No address'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.orderPickTotal}>{formatUGX(order.total)}</Text>
                      {selectedOrderId === order.id && <MaterialIcons name="check-circle" size={18} color={Colors.gold} />}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Rider Picker */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Select Rider *</Text>
                {riders.filter(r => r.status === 'active').map(rider => (
                  <TouchableOpacity
                    key={rider.id}
                    style={[styles.riderPickRow, assignRiderId === rider.id && styles.riderPickRowActive]}
                    onPress={() => setAssignRiderId(rider.id)}
                  >
                    <View style={[styles.riderPickAvatar, { backgroundColor: assignRiderId === rider.id ? Colors.gold + '20' : Colors.navyLight }]}>
                      <Text style={[styles.riderPickAvatarText, { color: assignRiderId === rider.id ? Colors.gold : Colors.textMuted }]}>
                        {rider.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.riderPickName, assignRiderId === rider.id && { color: Colors.gold }]}>{rider.name}</Text>
                      <Text style={styles.riderPickPhone}>{rider.phone}</Text>
                    </View>
                    {assignRiderId === rider.id && <MaterialIcons name="check-circle" size={18} color={Colors.gold} />}
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Delivery Fee (UGX)</Text>
                <View style={styles.inputWrap}>
                  <MaterialIcons name="payments" size={15} color={Colors.textMuted} />
                  <TextInput style={styles.input} placeholder="5000" placeholderTextColor={Colors.textMuted} value={assignDeliveryFee} onChangeText={setAssignDeliveryFee} keyboardType="numeric" />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Notes (optional)</Text>
                <TextInput style={[styles.inputWrap, { height: 60, textAlignVertical: 'top', paddingVertical: 10, paddingHorizontal: 12 }]} placeholder="Delivery instructions..." placeholderTextColor={Colors.textMuted} value={assignNotes} onChangeText={setAssignNotes} multiline />
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAssignModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, (assigning || !selectedOrderId || !assignRiderId) && { opacity: 0.5 }]} onPress={handleAssignDelivery} disabled={assigning || !selectedOrderId || !assignRiderId}>
                {assigning ? <ActivityIndicator color={Colors.navy} size="small" /> : <><MaterialIcons name="assignment-ind" size={16} color={Colors.navy} /><Text style={styles.confirmBtnText}>Assign Rider</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── ADD/EDIT RIDER MODAL ──────────────────────────────────────────────── */}
      <Modal visible={showRiderModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: '60%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editRider ? 'Edit Rider' : 'Add New Rider'}</Text>
              <TouchableOpacity onPress={() => setShowRiderModal(false)}><MaterialIcons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              {[
                { label: 'Full Name *', value: riderName, onChange: setRiderName, placeholder: 'Rider full name', icon: 'person' },
                { label: 'Phone Number *', value: riderPhone, onChange: setRiderPhone, placeholder: '+256 7XX XXX XXX', icon: 'phone', keyboard: 'phone-pad' as const },
                { label: 'PIN (4 digits)', value: riderPin, onChange: setRiderPin, placeholder: '4-digit PIN', icon: 'pin', keyboard: 'numeric' as const, secure: true },
              ].map(f => (
                <View key={f.label} style={styles.formGroup}>
                  <Text style={styles.formLabel}>{f.label}</Text>
                  <View style={styles.inputWrap}>
                    <MaterialIcons name={f.icon as any} size={15} color={Colors.textMuted} />
                    <TextInput style={styles.input} placeholder={f.placeholder} placeholderTextColor={Colors.textMuted} value={f.value} onChangeText={f.onChange} keyboardType={f.keyboard || 'default'} maxLength={f.label.includes('PIN') ? 4 : undefined} secureTextEntry={f.secure} />
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRiderModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, savingRider && { opacity: 0.7 }]} onPress={handleSaveRider} disabled={savingRider}>
                {savingRider ? <ActivityIndicator color={Colors.navy} size="small" /> : <><MaterialIcons name="check" size={16} color={Colors.navy} /><Text style={styles.confirmBtnText}>{editRider ? 'Update' : 'Add Rider'}</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── DELIVERY DETAIL MODAL ─────────────────────────────────────────────── */}
      <Modal visible={!!showDeliveryDetail && !showOTPVerify && !showFailModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            {showDeliveryDetail && (() => {
              const d = showDeliveryDetail;
              const cfg = STATUS_CONFIG[d.status];
              return (
                <>
                  <View style={styles.modalHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name={cfg.icon as any} size={20} color={cfg.color} />
                      <Text style={[styles.modalTitle, { color: cfg.color }]}>{d.order_no || 'Delivery'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowDeliveryDetail(null)}><MaterialIcons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
                  </View>
                  <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
                    <View style={[styles.detailStatusBanner, { backgroundColor: cfg.color + '15', borderColor: cfg.color + '40' }]}>
                      <MaterialIcons name={cfg.icon as any} size={22} color={cfg.color} />
                      <View>
                        <Text style={[styles.detailStatusLabel, { color: cfg.color }]}>{cfg.label}</Text>
                        {d.otp_verified && <Text style={{ fontSize: Typography.xs, color: Colors.success }}>OTP Verified ✓</Text>}
                      </View>
                    </View>
                    {[
                      { label: 'Customer', value: d.customer_name || '—', icon: 'person' },
                      { label: 'Phone', value: d.customer_phone || '—', icon: 'phone' },
                      { label: 'Address', value: d.customer_address || 'No address', icon: 'location-on' },
                      { label: 'Rider', value: `${d.rider_name} · ${d.rider_phone}`, icon: 'two-wheeler' },
                      { label: 'Assigned', value: new Date(d.assigned_at).toLocaleString('en-UG'), icon: 'schedule' },
                      ...(d.delivered_at ? [{ label: 'Delivered', value: new Date(d.delivered_at).toLocaleString('en-UG'), icon: 'done-all' }] : []),
                      ...(d.fail_reason ? [{ label: 'Fail Reason', value: d.fail_reason, icon: 'cancel' }] : []),
                      ...(d.notes ? [{ label: 'Notes', value: d.notes, icon: 'notes' }] : []),
                    ].map(row => (
                      <View key={row.label} style={styles.detailRow}>
                        <MaterialIcons name={row.icon as any} size={14} color={Colors.textMuted} />
                        <Text style={styles.detailRowLabel}>{row.label}:</Text>
                        <Text style={styles.detailRowValue} numberOfLines={2}>{row.value}</Text>
                      </View>
                    ))}

                    {d.delivery_photo_url && (
                      <View style={styles.proofSection}>
                        <Text style={styles.proofLabel}>Delivery Proof Photo</Text>
                        <Image source={{ uri: d.delivery_photo_url }} style={styles.proofImg} contentFit="cover" />
                      </View>
                    )}

                    {/* OTP Display */}
                    {d.status !== 'delivered' && d.status !== 'failed' && (
                      <View style={styles.otpCard}>
                        <MaterialIcons name="security" size={16} color={Colors.gold} />
                        <View>
                          <Text style={styles.otpLabel}>Delivery OTP (share with rider)</Text>
                          <Text style={styles.otpValue}>{d.delivery_otp}</Text>
                        </View>
                      </View>
                    )}

                    {/* Actions */}
                    <View style={styles.detailActions}>
                      {!d.delivery_photo_url && d.status === 'in_transit' && (
                        <TouchableOpacity style={styles.detailActionBtn} onPress={() => handleUploadProof(d)} disabled={uploadingPhoto}>
                          {uploadingPhoto ? <ActivityIndicator size="small" color={Colors.skyBlue} /> : <MaterialIcons name="photo-camera" size={16} color={Colors.skyBlue} />}
                          <Text style={[styles.detailActionText, { color: Colors.skyBlue }]}>Upload Proof</Text>
                        </TouchableOpacity>
                      )}
                      {NEXT_STATUS[d.status] && (
                        <TouchableOpacity
                          style={[styles.detailActionBtn, { backgroundColor: Colors.gold, borderColor: Colors.gold }]}
                          onPress={() => handleUpdateStatus(d, NEXT_STATUS[d.status]!)}
                          disabled={updatingStatus}
                        >
                          {updatingStatus ? <ActivityIndicator size="small" color={Colors.navy} /> : <MaterialIcons name={STATUS_CONFIG[NEXT_STATUS[d.status]!].icon as any} size={16} color={Colors.navy} />}
                          <Text style={[styles.detailActionText, { color: Colors.navy, fontWeight: Typography.bold }]}>Mark {STATUS_CONFIG[NEXT_STATUS[d.status]!].label}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── OTP VERIFY MODAL ─────────────────────────────────────────────────── */}
      <Modal visible={showOTPVerify} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: '50%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="security" size={20} color={Colors.gold} />
                <Text style={styles.modalTitle}>Verify Delivery OTP</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowOTPVerify(false); setOtpInput(''); }}><MaterialIcons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.otpInstructions}>Enter the 4-digit OTP provided by the customer to confirm delivery.</Text>
              <View style={styles.otpInputWrap}>
                <MaterialIcons name="lock" size={18} color={Colors.gold} />
                <TextInput
                  style={styles.otpInputField}
                  placeholder="0000"
                  placeholderTextColor={Colors.textMuted}
                  value={otpInput}
                  onChangeText={setOtpInput}
                  keyboardType="numeric"
                  maxLength={4}
                  autoFocus
                />
              </View>
              <View style={styles.otpDots}>
                {[0, 1, 2, 3].map(i => (
                  <View key={i} style={[styles.otpDot, i < otpInput.length && { backgroundColor: Colors.gold }]} />
                ))}
              </View>
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowOTPVerify(false); setOtpInput(''); }}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, (otpInput.length !== 4 || verifyingOTP) && { opacity: 0.5 }]}
                onPress={handleVerifyOTP}
                disabled={otpInput.length !== 4 || verifyingOTP}
              >
                {verifyingOTP ? <ActivityIndicator color={Colors.navy} size="small" /> : <><MaterialIcons name="verified" size={16} color={Colors.navy} /><Text style={styles.confirmBtnText}>Confirm Delivery</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── RATING MODAL ─────────────────────────────────────────────────────── */}
      <Modal visible={showRatingModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="star" size={22} color={Colors.gold} />
                <View>
                  <Text style={styles.modalTitle}>Rate Delivery</Text>
                  {ratingDelivery && <Text style={{ fontSize: Typography.xs, color: Colors.textMuted }}>{ratingDelivery.rider_name} · {ratingDelivery.order_no || ratingDelivery.order_id.slice(-6)}</Text>}
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowRatingModal(false)}><MaterialIcons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.formLabel}>Star Rating *</Text>
              {/* Big Star Selector */}
              <View style={styles.bigStarRow}>
                {[1, 2, 3, 4, 5].map(star => (
                  <TouchableOpacity key={star} style={styles.bigStarBtn} onPress={() => setRatingValue(star)}>
                    <MaterialIcons
                      name={star <= ratingValue ? 'star' : 'star-border'}
                      size={44}
                      color={star <= ratingValue ? Colors.gold : Colors.textMuted}
                    />
                    <Text style={[styles.bigStarLabel, star <= ratingValue && { color: Colors.gold }]}>{star}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.ratingLabelRow}>
                <Text style={styles.ratingLabelHint}>
                  {ratingValue === 1 ? '😞 Poor' : ratingValue === 2 ? '😐 Below Average' : ratingValue === 3 ? '🙂 Average' : ratingValue === 4 ? '😊 Good' : '🌟 Excellent'}
                </Text>
              </View>
              {/* Quick rating presets */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { label: 'On Time', stars: 5 }, { label: 'Slightly Late', stars: 4 },
                  { label: 'Very Late', stars: 2 }, { label: 'Professional', stars: 5 },
                  { label: 'Rude', stars: 1 }, { label: 'Good Communication', stars: 4 },
                ].map(preset => (
                  <TouchableOpacity key={preset.label} style={styles.ratingPresetChip} onPress={() => { setRatingValue(preset.stars); setRatingNotes(preset.label); }}>
                    <Text style={styles.ratingPresetText}>{preset.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.inputWrap, { height: 72, textAlignVertical: 'top', paddingVertical: 10, paddingHorizontal: 12 }]}
                  placeholder="Any comments about this delivery..."
                  placeholderTextColor={Colors.textMuted}
                  value={ratingNotes}
                  onChangeText={setRatingNotes}
                  multiline
                />
              </View>
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRatingModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, savingRating && { opacity: 0.7 }]} onPress={handleSaveRating} disabled={savingRating}>
                {savingRating ? <ActivityIndicator color={Colors.navy} size="small" /> : <><MaterialIcons name="star" size={16} color={Colors.navy} /><Text style={styles.confirmBtnText}>Save Rating</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── FAIL REASON MODAL ────────────────────────────────────────────────── */}
      <Modal visible={showFailModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: '50%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="cancel" size={20} color={Colors.danger} />
                <Text style={[styles.modalTitle, { color: Colors.danger }]}>Mark as Failed</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowFailModal(false); setFailReason(''); }}><MaterialIcons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.formLabel}>Reason for Failure *</Text>
              {['Customer not available', 'Wrong address', 'Customer refused delivery', 'Unsafe area', 'Item damaged', 'Other'].map(reason => (
                <TouchableOpacity
                  key={reason}
                  style={[styles.failReasonChip, failReason === reason && { backgroundColor: Colors.dangerMuted, borderColor: Colors.danger }]}
                  onPress={() => setFailReason(reason)}
                >
                  {failReason === reason && <MaterialIcons name="radio-button-checked" size={14} color={Colors.danger} />}
                  {failReason !== reason && <MaterialIcons name="radio-button-unchecked" size={14} color={Colors.textMuted} />}
                  <Text style={[styles.failReasonText, failReason === reason && { color: Colors.danger }]}>{reason}</Text>
                </TouchableOpacity>
              ))}
              <TextInput style={[styles.inputWrap, { height: 60, textAlignVertical: 'top', paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 }]} placeholder="Or type custom reason..." placeholderTextColor={Colors.textMuted} value={failReason} onChangeText={setFailReason} multiline />
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowFailModal(false); setFailReason(''); }}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: Colors.danger }, (!failReason || updatingStatus) && { opacity: 0.5 }]} onPress={handleMarkFailed} disabled={!failReason || updatingStatus}>
                {updatingStatus ? <ActivityIndicator color={Colors.navy} size="small" /> : <><MaterialIcons name="cancel" size={16} color={Colors.navy} /><Text style={styles.confirmBtnText}>Confirm Failed</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderGold },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refreshBtn: { padding: 6 },
  addRiderBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gold, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.md, ...Shadows.gold },
  addRiderBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.navy },
  tabRow: { flexDirection: 'row', margin: Spacing.md, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: BorderRadius.md },
  tabBtnActive: { backgroundColor: Colors.gold },
  tabBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  tabBtnTextActive: { color: Colors.navy, fontWeight: Typography.bold },
  kpiStrip: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, gap: 8 },
  kpiChip: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', minWidth: 64 },
  kpiChipValue: { fontSize: Typography.lg, fontWeight: Typography.extrabold },
  kpiChipLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  filterRow: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, gap: 6 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.circle, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  filterChipText: { fontSize: 11, color: Colors.textMuted },
  unassignedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.warningMuted, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.warning + '40', marginHorizontal: Spacing.base, marginBottom: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  unassignedLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  unassignedTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.warning },
  unassignedSub: { fontSize: Typography.xs, color: Colors.textMuted },
  listContent: { paddingHorizontal: Spacing.base, paddingBottom: 100, gap: Spacing.sm },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: Typography.base, color: Colors.textMuted },
  emptySubText: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 40 },
  emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gold, paddingHorizontal: 16, paddingVertical: 10, borderRadius: BorderRadius.md, marginTop: 4 },
  emptyAddBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.navy },
  // Delivery Card
  deliveryCard: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 8, ...Shadows.sm },
  deliveryCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  deliveryCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  statusIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  orderNo: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.skyBlue },
  statusPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: BorderRadius.circle },
  statusPillText: { fontSize: 10, fontWeight: Typography.bold },
  customerName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary, marginTop: 2 },
  customerAddress: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  orderTotal: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  assignedTime: { fontSize: 10, color: Colors.textMuted },
  deliveryRiderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  riderChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.skyBlueMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.circle },
  riderChipText: { fontSize: 11, fontWeight: Typography.semibold, color: Colors.skyBlue },
  riderChipPhone: { fontSize: 10, color: Colors.textMuted },
  advanceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: BorderRadius.md, borderWidth: 1 },
  advanceBtnText: { fontSize: Typography.sm, fontWeight: Typography.semibold },
  // Rider Card
  riderCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  riderCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  riderAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.borderGold },
  riderAvatarText: { fontSize: Typography.base, fontWeight: Typography.extrabold },
  riderName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  riderPhone: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  riderStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: BorderRadius.circle },
  riderStatusDot: { width: 5, height: 5, borderRadius: 2.5 },
  riderStatusText: { fontSize: 9, fontWeight: Typography.bold },
  riderStats: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  riderStatChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  riderStatText: { fontSize: 10, fontWeight: Typography.medium },
  riderCardActions: { gap: 5 },
  riderActionBtn: { width: 34, height: 34, borderRadius: BorderRadius.sm, backgroundColor: Colors.navyLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sm, paddingVertical: 4 },
  // Earnings
  monthPickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 4 },
  monthBtn: { padding: 6 },
  monthLabel: { flex: 1, textAlign: 'center', fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  shareReportBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.gold, paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.md },
  shareReportBtnText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.navy },
  earningsSummary: { flexDirection: 'row', gap: 10 },
  earningSummaryCard: { flex: 1, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.md, alignItems: 'center', gap: 4 },
  earningSummaryValue: { fontSize: Typography.base, fontWeight: Typography.extrabold },
  earningSummaryLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  earningRiderCard: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 8 },
  earningRiderTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  earningRank: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  earningRankText: { fontSize: 11, fontWeight: Typography.extrabold },
  earningRiderName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  earningRiderMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  earningRiderTotal: { fontSize: Typography.base, fontWeight: Typography.extrabold, color: Colors.gold },
  earningBar: { height: 6, backgroundColor: Colors.navyLight, borderRadius: 3, overflow: 'hidden' },
  earningBarFill: { height: '100%', borderRadius: 3 },
  earningsLogSection: { gap: 6 },
  logSectionTitle: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  earningLogRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  earningLogIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  earningLogName: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textPrimary },
  earningLogDesc: { fontSize: 10, color: Colors.textMuted },
  earningLogAmount: { fontSize: Typography.sm, fontWeight: Typography.bold },
  // Map / Tracking
  // Performance tab
  perfCard: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 12, ...Shadows.sm },
  perfCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perfRiderName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  perfRiderPhone: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  perfStarRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  topPerformerBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.circle },
  topPerformerText: { fontSize: 9, fontWeight: Typography.extrabold, color: Colors.navy },
  perfMetricsGrid: { flexDirection: 'row', backgroundColor: Colors.navyLight, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, padding: 2 },
  perfMetric: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  perfMetricDivider: { width: 1, backgroundColor: Colors.divider },
  perfMetricValue: { fontSize: Typography.lg, fontWeight: Typography.extrabold },
  perfMetricLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  perfBarLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  perfProgressBg: { height: 8, backgroundColor: Colors.navyLight, borderRadius: 4, overflow: 'hidden' },
  perfProgressFill: { height: '100%', borderRadius: 4 },
  perfExtraRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  perfExtraChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.navyLight, borderRadius: BorderRadius.circle, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  perfExtraText: { fontSize: 11, color: Colors.textSecondary, fontWeight: Typography.medium },
  recentRatingsSection: { gap: 6 },
  recentRatingsTitle: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  recentRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.navyLight, borderRadius: BorderRadius.sm, padding: 8, borderWidth: 1, borderColor: Colors.border },
  recentRatingBy: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary },
  recentRatingDate: { fontSize: 10, color: Colors.textMuted },
  rateRiderBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.goldMuted, borderRadius: BorderRadius.md, paddingVertical: 10, borderWidth: 1, borderColor: Colors.borderGold },
  rateRiderBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  rateDeliveryCTA: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.goldSubtle, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.borderGold, paddingHorizontal: Spacing.md, paddingVertical: 12, marginBottom: 4 },
  rateDeliveryCTATitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gold },
  rateDeliveryCTASub: { fontSize: Typography.xs, color: Colors.textMuted },
  // Rating modal
  bigStarRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  bigStarBtn: { alignItems: 'center', gap: 3 },
  bigStarLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: Typography.medium },
  ratingLabelRow: { alignItems: 'center' },
  ratingLabelHint: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textSecondary },
  ratingPresetChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.circle, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  ratingPresetText: { fontSize: 11, color: Colors.textMuted },
  mapFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: Colors.navyCard, padding: 40 },
  mapFallbackText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textMuted, textAlign: 'center' },
  mapFallbackSub: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },
  riderLocCard: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: 3, minWidth: 130,
  },
  riderLocName: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  riderLocTime: { fontSize: 10, color: Colors.textMuted },
  riderLocDelivery: { fontSize: 10, color: Colors.skyBlue, fontWeight: Typography.semibold },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modal: { backgroundColor: Colors.navyMid, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, maxHeight: '90%', borderTopWidth: 2, borderColor: Colors.borderGold },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  modalTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gold },
  modalBody: { padding: Spacing.xl, gap: Spacing.md },
  modalFooter: { flexDirection: 'row', gap: 12, padding: Spacing.xl, borderTopWidth: 1, borderTopColor: Colors.divider },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { color: Colors.textMuted, fontWeight: Typography.semibold },
  confirmBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: BorderRadius.md, backgroundColor: Colors.gold, ...Shadows.gold },
  confirmBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  formGroup: { gap: 6 },
  formLabel: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  input: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sm, paddingVertical: 12 },
  // Order/Rider pickers
  orderPickRow: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderPickRowActive: { borderColor: Colors.gold, backgroundColor: Colors.goldSubtle },
  orderPickNo: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.skyBlue },
  orderPickCustomer: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2 },
  orderPickAddr: { fontSize: 10, color: Colors.textMuted },
  orderPickTotal: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  riderPickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm },
  riderPickRowActive: { borderColor: Colors.gold, backgroundColor: Colors.goldSubtle },
  riderPickAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  riderPickAvatarText: { fontSize: Typography.xs, fontWeight: Typography.extrabold },
  riderPickName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  riderPickPhone: { fontSize: 10, color: Colors.textMuted },
  noOrdersBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.skyBlueMuted, borderRadius: BorderRadius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.skyBlue + '30' },
  noOrdersText: { fontSize: Typography.xs, color: Colors.skyBlue },
  // Delivery detail
  detailStatusBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.md },
  detailStatusLabel: { fontSize: Typography.base, fontWeight: Typography.bold },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailRowLabel: { fontSize: Typography.xs, color: Colors.textMuted, width: 72 },
  detailRowValue: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary },
  proofSection: { gap: 6 },
  proofLabel: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold },
  proofImg: { width: '100%', height: 180, borderRadius: BorderRadius.md },
  otpCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.goldSubtle, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.borderGold, padding: Spacing.md },
  otpLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  otpValue: { fontSize: Typography.xxl, fontWeight: Typography.extrabold, color: Colors.gold, letterSpacing: 4 },
  detailActions: { flexDirection: 'row', gap: 10 },
  detailActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: BorderRadius.md, backgroundColor: Colors.skyBlueMuted, borderWidth: 1, borderColor: Colors.skyBlue + '40' },
  detailActionText: { fontSize: Typography.sm, fontWeight: Typography.semibold },
  // OTP modal
  otpInstructions: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  otpInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 2, borderColor: Colors.borderGold, paddingHorizontal: Spacing.xl, paddingVertical: 12 },
  otpInputField: { flex: 1, fontSize: 32, fontWeight: Typography.extrabold, color: Colors.gold, textAlign: 'center', letterSpacing: 8 },
  otpDots: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  otpDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.navyLight, borderWidth: 2, borderColor: Colors.border },
  // Fail reason
  failReasonChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: BorderRadius.md, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  failReasonText: { fontSize: Typography.sm, color: Colors.textMuted },
});
