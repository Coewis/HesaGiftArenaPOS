import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, FlatList, Modal, Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '@/template';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const formatUGX = (n: number) => `UGX ${n.toLocaleString()}`;
const RIDER_SESSION_KEY = 'hga_rider_session';

// Setup notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

interface RiderSession {
  id: string;
  name: string;
  phone: string;
}

interface RiderDelivery {
  id: string;
  order_id: string;
  status: string;
  assigned_at: string;
  delivery_otp: string;
  otp_verified: boolean;
  notes?: string;
  order_no?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  total?: number;
}

type Screen = 'login' | 'dashboard';

const STATUS_COLORS: Record<string, string> = {
  assigned: Colors.skyBlue,
  accepted: '#9B59B6',
  picked_up: Colors.warning,
  in_transit: Colors.gold,
  delivered: Colors.success,
  failed: Colors.danger,
};

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  failed: 'Failed',
};

const NEXT_STATUS: Record<string, string | null> = {
  assigned: 'accepted',
  accepted: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'delivered',
  delivered: null,
  failed: null,
};

const NEXT_LABEL: Record<string, string> = {
  assigned: 'Accept Delivery',
  accepted: 'Mark Picked Up',
  picked_up: 'Mark In Transit',
  in_transit: 'Confirm Delivered (OTP)',
};

export default function RiderLoginScreen() {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>('login');
  const [rider, setRider] = useState<RiderSession | null>(null);

  // Login state
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const pinInputRef = useRef<TextInput>(null);

  // Dashboard state
  const [deliveries, setDeliveries] = useState<RiderDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'active' | 'all'>('active');

  // OTP modal
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<RiderDelivery | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [verifyingOTP, setVerifyingOTP] = useState(false);

  // Location tracking
  const [trackingActive, setTrackingActive] = useState(false);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  const db = getSupabaseClient();

  // Check for saved session
  useEffect(() => {
    AsyncStorage.getItem(RIDER_SESSION_KEY).then(val => {
      if (val) {
        try {
          const saved: RiderSession = JSON.parse(val);
          setRider(saved);
          setScreen('dashboard');
        } catch {}
      }
    });
  }, []);

  // Load deliveries when on dashboard
  useEffect(() => {
    if (screen === 'dashboard' && rider) {
      loadDeliveries();
      registerForNotifications();
      startLocationTracking();
    }
    return () => {
      stopLocationTracking();
    };
  }, [screen, rider]);

  const registerForNotifications = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      const tokenData = await Notifications.getDevicePushTokenAsync();
      if (!tokenData?.data || !rider) return;

      const fcmToken = tokenData.data;
      await db.from('pos_rider_fcm_tokens').upsert({
        id: `${rider.id}_token`,
        rider_id: rider.id,
        fcm_token: fcmToken,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.log('Notification registration error:', err);
    }
  };

  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      setTrackingActive(true);
      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000, // every 30 seconds
          distanceInterval: 50, // or every 50 meters
        },
        async (loc) => {
          if (!rider) return;
          try {
            await db.from('pos_rider_locations').upsert({
              id: `loc_${rider.id}`,
              rider_id: rider.id,
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              heading: loc.coords.heading,
              speed: loc.coords.speed,
              accuracy: loc.coords.accuracy,
              updated_at: new Date().toISOString(),
            });
          } catch {}
        }
      );
    } catch (err) {
      console.log('Location tracking error:', err);
    }
  };

  const stopLocationTracking = () => {
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
    setTrackingActive(false);
  };

  const loadDeliveries = useCallback(async () => {
    if (!rider) return;
    setLoadingDeliveries(true);
    try {
      const { data } = await db
        .from('pos_rider_deliveries')
        .select('*, pos_orders(order_no, customer_name, customer_phone, customer_address, total)')
        .eq('rider_id', rider.id)
        .order('assigned_at', { ascending: false })
        .limit(50);

      if (data) {
        setDeliveries(data.map((d: any) => ({
          ...d,
          order_no: d.pos_orders?.order_no,
          customer_name: d.pos_orders?.customer_name,
          customer_phone: d.pos_orders?.customer_phone,
          customer_address: d.pos_orders?.customer_address,
          total: d.pos_orders?.total,
        })));
      }
    } catch {}
    finally { setLoadingDeliveries(false); }
  }, [rider]);

  const handleLogin = async () => {
    if (!phone.trim()) { setLoginError('Enter your phone number.'); return; }
    if (pin.length !== 4) { setLoginError('PIN must be 4 digits.'); return; }
    setLoginError('');
    setLoggingIn(true);
    try {
      const { data, error } = await db
        .from('pos_riders')
        .select('id, name, phone, pin, status')
        .eq('phone', phone.trim())
        .single();

      if (error || !data) { setLoginError('Rider not found. Check your phone number.'); return; }
      if (data.status === 'inactive') { setLoginError('Your account has been deactivated. Contact your manager.'); return; }
      if (data.pin !== pin) { setLoginError('Incorrect PIN. Please try again.'); return; }

      const session: RiderSession = { id: data.id, name: data.name, phone: data.phone };
      await AsyncStorage.setItem(RIDER_SESSION_KEY, JSON.stringify(session));
      setRider(session);
      setScreen('dashboard');
    } catch {
      setLoginError('Login failed. Please try again.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    stopLocationTracking();
    AsyncStorage.removeItem(RIDER_SESSION_KEY);
    setRider(null);
    setScreen('login');
    setPhone('');
    setPin('');
    setDeliveries([]);
  };

  const handleUpdateStatus = async (delivery: RiderDelivery, newStatus: string) => {
    if (newStatus === 'delivered') {
      setSelectedDelivery(delivery);
      setOtpInput('');
      setShowOTPModal(true);
      return;
    }
    try {
      const now = new Date().toISOString();
      const timeFields: Record<string, string> = {
        accepted: 'accepted_at',
        picked_up: 'picked_up_at',
        in_transit: null as any,
      };
      const update: any = { status: newStatus, updated_at: now };
      const tf = timeFields[newStatus];
      if (tf) update[tf] = now;

      await db.from('pos_rider_deliveries').update(update).eq('id', delivery.id);
      setDeliveries(prev => prev.map(d => d.id === delivery.id ? { ...d, status: newStatus } : d));
    } catch {}
  };

  const handleVerifyOTP = async () => {
    if (!selectedDelivery) return;
    if (otpInput !== selectedDelivery.delivery_otp) {
      setLoginError('Invalid OTP');
      return;
    }
    setVerifyingOTP(true);
    try {
      const now = new Date().toISOString();
      await db.from('pos_rider_deliveries').update({
        status: 'delivered', otp_verified: true, delivered_at: now, updated_at: now,
      }).eq('id', selectedDelivery.id);
      setDeliveries(prev => prev.map(d =>
        d.id === selectedDelivery.id ? { ...d, status: 'delivered', otp_verified: true } : d
      ));
      setShowOTPModal(false);
      setSelectedDelivery(null);
    } catch {}
    finally { setVerifyingOTP(false); }
  };

  const activeDeliveries = deliveries.filter(d => !['delivered', 'failed'].includes(d.status));
  const completedDeliveries = deliveries.filter(d => ['delivered', 'failed'].includes(d.status));
  const displayDeliveries = activeFilter === 'active' ? activeDeliveries : deliveries;

  // ─── Login Screen ──────────────────────────────────────────────────────────
  if (screen === 'login') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.loginHeader}>
            <View style={styles.loginLogo}>
              <MaterialIcons name="two-wheeler" size={40} color={Colors.gold} />
            </View>
            <Text style={styles.loginBrand}>HESA GIFT ARENA</Text>
            <Text style={styles.loginTitle}>Rider Portal</Text>
            <Text style={styles.loginSub}>Sign in to view your assigned deliveries</Text>
          </View>

          <View style={styles.loginCard}>
            {/* Phone */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Phone Number</Text>
              <View style={styles.inputWrap}>
                <MaterialIcons name="phone" size={18} color={Colors.gold} />
                <TextInput
                  style={styles.input}
                  placeholder="+256 7XX XXX XXX"
                  placeholderTextColor={Colors.textMuted}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => pinInputRef.current?.focus()}
                />
              </View>
            </View>

            {/* PIN */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>4-Digit PIN</Text>
              <View style={styles.inputWrap}>
                <MaterialIcons name="pin" size={18} color={Colors.gold} />
                <TextInput
                  ref={pinInputRef}
                  style={[styles.input, { letterSpacing: pin.length > 0 ? 10 : 0, fontSize: pin.length > 0 ? Typography.xxl : Typography.base }]}
                  placeholder="••••"
                  placeholderTextColor={Colors.textMuted}
                  value={pin}
                  onChangeText={t => setPin(t.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
              </View>
              {/* PIN dots */}
              <View style={styles.pinDots}>
                {[0, 1, 2, 3].map(i => (
                  <View key={i} style={[styles.pinDot, i < pin.length && styles.pinDotFilled]} />
                ))}
              </View>
            </View>

            {loginError ? (
              <View style={styles.errorBox}>
                <MaterialIcons name="error" size={14} color={Colors.danger} />
                <Text style={styles.errorText}>{loginError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.loginBtn, (loggingIn || pin.length !== 4) && { opacity: 0.6 }]}
              onPress={handleLogin}
              disabled={loggingIn || pin.length !== 4}
            >
              {loggingIn
                ? <ActivityIndicator color={Colors.navy} size="small" />
                : <><MaterialIcons name="login" size={20} color={Colors.navy} /><Text style={styles.loginBtnText}>Sign In</Text></>
              }
            </TouchableOpacity>

            <View style={styles.loginInfoBox}>
              <MaterialIcons name="info" size={14} color={Colors.skyBlue} />
              <Text style={styles.loginInfoText}>This portal is for delivery riders only. For POS access, use the main app login.</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─── Dashboard Screen ──────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.dashHeader}>
        <View>
          <Text style={styles.dashGreeting}>Hello, {rider?.name?.split(' ')[0]}</Text>
          <View style={styles.dashSubRow}>
            <MaterialIcons name="two-wheeler" size={12} color={Colors.gold} />
            <Text style={styles.dashSub}>Rider · {rider?.phone}</Text>
            {trackingActive && (
              <View style={styles.trackingBadge}>
                <View style={styles.trackingDot} />
                <Text style={styles.trackingText}>GPS Active</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.dashHeaderRight}>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadDeliveries}>
            {loadingDeliveries
              ? <ActivityIndicator size="small" color={Colors.gold} />
              : <MaterialIcons name="refresh" size={20} color={Colors.gold} />
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <MaterialIcons name="logout" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Strip */}
      <View style={styles.statsStrip}>
        {[
          { label: 'Active', value: activeDeliveries.length, color: Colors.warning },
          { label: 'Delivered', value: deliveries.filter(d => d.status === 'delivered').length, color: Colors.success },
          { label: 'Failed', value: deliveries.filter(d => d.status === 'failed').length, color: Colors.danger },
          { label: 'Total', value: deliveries.length, color: Colors.skyBlue },
        ].map(stat => (
          <View key={stat.label} style={[styles.statChip, { borderColor: stat.color + '40' }]}>
            <Text style={[styles.statChipValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={styles.statChipLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabRow}>
        {([
          { key: 'active', label: `Active (${activeDeliveries.length})` },
          { key: 'all', label: `All (${deliveries.length})` },
        ] as const).map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.filterTab, activeFilter === t.key && styles.filterTabActive]}
            onPress={() => setActiveFilter(t.key)}
          >
            <Text style={[styles.filterTabText, activeFilter === t.key && styles.filterTabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loadingDeliveries ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.gold} />
          <Text style={styles.loadingText}>Loading deliveries...</Text>
        </View>
      ) : displayDeliveries.length === 0 ? (
        <View style={styles.centered}>
          <MaterialIcons name="local-shipping" size={60} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>{activeFilter === 'active' ? 'No active deliveries' : 'No deliveries yet'}</Text>
          <Text style={styles.emptySubText}>Pull to refresh or wait for new assignments</Text>
          <TouchableOpacity style={styles.refreshLargeBtn} onPress={loadDeliveries}>
            <MaterialIcons name="refresh" size={18} color={Colors.navy} />
            <Text style={styles.refreshLargeBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayDeliveries}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.deliveryList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const statusColor = STATUS_COLORS[item.status] || Colors.textMuted;
            const statusLabel = STATUS_LABELS[item.status] || item.status;
            const nextStatus = NEXT_STATUS[item.status];
            const nextLabel = NEXT_LABEL[item.status];

            return (
              <View style={[styles.deliveryCard, { borderLeftColor: statusColor, borderLeftWidth: 4 }]}>
                <View style={styles.deliveryCardTop}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.deliveryCardTitleRow}>
                      <Text style={styles.orderNo}>{item.order_no || `DEL-${item.id.slice(-6)}`}</Text>
                      <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                    </View>
                    <Text style={styles.customerName}>{item.customer_name || 'Customer'}</Text>
                    <View style={styles.infoRow}>
                      <MaterialIcons name="phone" size={12} color={Colors.textMuted} />
                      <Text style={styles.infoText}>{item.customer_phone || '—'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <MaterialIcons name="location-on" size={12} color={Colors.textMuted} />
                      <Text style={styles.infoText} numberOfLines={2}>{item.customer_address || 'No address provided'}</Text>
                    </View>
                    {item.total ? (
                      <View style={styles.infoRow}>
                        <MaterialIcons name="attach-money" size={12} color={Colors.gold} />
                        <Text style={[styles.infoText, { color: Colors.gold, fontWeight: Typography.bold }]}>{formatUGX(Number(item.total))}</Text>
                      </View>
                    ) : null}
                  </View>
                  {/* OTP display */}
                  {item.status !== 'delivered' && item.status !== 'failed' && (
                    <View style={styles.otpCard}>
                      <Text style={styles.otpLabel}>OTP</Text>
                      <Text style={styles.otpValue}>{item.delivery_otp}</Text>
                      {item.otp_verified && <MaterialIcons name="verified" size={12} color={Colors.success} />}
                    </View>
                  )}
                </View>

                {item.notes ? (
                  <View style={styles.notesBox}>
                    <MaterialIcons name="notes" size={12} color={Colors.skyBlue} />
                    <Text style={styles.notesText}>{item.notes}</Text>
                  </View>
                ) : null}

                <View style={styles.assignedRow}>
                  <Text style={styles.assignedTime}>
                    Assigned: {new Date(item.assigned_at).toLocaleString('en-UG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                {/* Action Button */}
                {nextStatus && nextLabel && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: statusColor + '20', borderColor: statusColor + '60' }]}
                    onPress={() => handleUpdateStatus(item, nextStatus)}
                  >
                    <MaterialIcons name="arrow-forward" size={16} color={statusColor} />
                    <Text style={[styles.actionBtnText, { color: statusColor }]}>{nextLabel}</Text>
                  </TouchableOpacity>
                )}

                {item.status === 'delivered' && (
                  <View style={[styles.completedBanner, { backgroundColor: Colors.successMuted }]}>
                    <MaterialIcons name="check-circle" size={16} color={Colors.success} />
                    <Text style={[styles.actionBtnText, { color: Colors.success }]}>
                      Delivered {item.otp_verified ? '· OTP Verified' : ''}
                    </Text>
                  </View>
                )}

                {item.status === 'failed' && (
                  <View style={[styles.completedBanner, { backgroundColor: Colors.dangerMuted }]}>
                    <MaterialIcons name="cancel" size={16} color={Colors.danger} />
                    <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Delivery Failed</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* OTP Verification Modal */}
      <Modal visible={showOTPModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.otpModal}>
            <View style={styles.otpModalHeader}>
              <MaterialIcons name="security" size={24} color={Colors.gold} />
              <Text style={styles.otpModalTitle}>Confirm Delivery</Text>
              <TouchableOpacity onPress={() => { setShowOTPModal(false); setOtpInput(''); }}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.otpModalBody}>
              <Text style={styles.otpInstruction}>Ask the customer for their 4-digit delivery OTP and enter it below to confirm delivery.</Text>
              <View style={styles.otpInputWrap}>
                <TextInput
                  style={styles.otpInput}
                  placeholder="0 0 0 0"
                  placeholderTextColor={Colors.textMuted}
                  value={otpInput}
                  onChangeText={t => setOtpInput(t.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="numeric"
                  maxLength={4}
                  autoFocus
                />
              </View>
              <View style={styles.otpDotsRow}>
                {[0, 1, 2, 3].map(i => (
                  <View key={i} style={[styles.otpDot, i < otpInput.length && styles.otpDotFilled]} />
                ))}
              </View>
              {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}
            </View>
            <View style={styles.otpModalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowOTPModal(false); setOtpInput(''); setLoginError(''); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, (otpInput.length !== 4 || verifyingOTP) && { opacity: 0.5 }]}
                onPress={handleVerifyOTP}
                disabled={otpInput.length !== 4 || verifyingOTP}
              >
                {verifyingOTP
                  ? <ActivityIndicator color={Colors.navy} size="small" />
                  : <><MaterialIcons name="verified" size={16} color={Colors.navy} /><Text style={styles.confirmBtnText}>Confirm Delivery</Text></>
                }
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
  // Login
  loginScroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },
  loginHeader: { alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xxl },
  loginLogo: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: Colors.borderGold, marginBottom: Spacing.md,
  },
  loginBrand: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.gold, letterSpacing: 2 },
  loginTitle: { fontSize: Typography.xxl, fontWeight: Typography.extrabold, color: Colors.textPrimary },
  loginSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  loginCard: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.borderGold, padding: Spacing.xl, gap: Spacing.md,
  },
  formGroup: { gap: 8 },
  formLabel: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.navyLight, borderRadius: BorderRadius.md,
    borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md,
  },
  input: { flex: 1, color: Colors.textPrimary, fontSize: Typography.base, paddingVertical: 14 },
  pinDots: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8 },
  pinDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.navyLight, borderWidth: 2, borderColor: Colors.border },
  pinDotFilled: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.gold, borderRadius: BorderRadius.lg,
    paddingVertical: 16, marginTop: 8, ...Shadows.gold,
  },
  loginBtnText: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.navy },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.dangerMuted, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.danger + '30',
  },
  errorText: { flex: 1, fontSize: Typography.xs, color: Colors.danger },
  loginInfoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.skyBlueMuted, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.skyBlue + '30',
  },
  loginInfoText: { flex: 1, fontSize: Typography.xs, color: Colors.skyBlue, lineHeight: 16 },
  // Dashboard
  dashHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.borderGold,
    backgroundColor: Colors.navyMid,
  },
  dashGreeting: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.textPrimary },
  dashSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dashSub: { fontSize: Typography.xs, color: Colors.textMuted },
  trackingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.successMuted, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: BorderRadius.circle, marginLeft: 6,
  },
  trackingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  trackingText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.success },
  dashHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refreshBtn: { padding: 8 },
  logoutBtn: { padding: 6 },
  statsStrip: {
    flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  statChip: {
    flex: 1, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, padding: Spacing.sm, alignItems: 'center', gap: 2,
  },
  statChipValue: { fontSize: Typography.xl, fontWeight: Typography.extrabold },
  statChipLabel: { fontSize: 10, color: Colors.textMuted },
  filterTabRow: {
    flexDirection: 'row', margin: Spacing.md,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    padding: 3, borderWidth: 1, borderColor: Colors.border,
  },
  filterTab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: BorderRadius.sm },
  filterTabActive: { backgroundColor: Colors.gold },
  filterTabText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  filterTabTextActive: { color: Colors.navy, fontWeight: Typography.bold },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  loadingText: { fontSize: Typography.sm, color: Colors.textMuted },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textMuted },
  emptySubText: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  refreshLargeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.gold, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: BorderRadius.md, marginTop: 4, ...Shadows.gold,
  },
  refreshLargeBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.navy },
  deliveryList: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.md, paddingBottom: 100 },
  deliveryCard: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: Spacing.sm, ...Shadows.sm,
  },
  deliveryCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  deliveryCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  orderNo: { fontSize: Typography.sm, fontWeight: Typography.extrabold, color: Colors.skyBlue },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: BorderRadius.circle },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: Typography.bold },
  customerName: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary, marginBottom: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginBottom: 2 },
  infoText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 16 },
  otpCard: {
    backgroundColor: Colors.goldSubtle, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.borderGold,
    paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 2,
    minWidth: 70,
  },
  otpLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  otpValue: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.gold, letterSpacing: 4 },
  notesBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.skyBlueMuted, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.skyBlue + '30',
  },
  notesText: { flex: 1, fontSize: Typography.xs, color: Colors.skyBlue, lineHeight: 15 },
  assignedRow: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 6 },
  assignedTime: { fontSize: 10, color: Colors.textMuted },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: BorderRadius.md, borderWidth: 1,
    marginTop: 4,
  },
  actionBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold },
  completedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, borderRadius: BorderRadius.md, marginTop: 4,
  },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  otpModal: {
    backgroundColor: Colors.navyMid, borderRadius: BorderRadius.xl,
    width: '100%', maxWidth: 360, borderWidth: 1.5, borderColor: Colors.borderGold,
    overflow: 'hidden',
  },
  otpModalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  otpModalTitle: { flex: 1, fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.gold },
  otpModalBody: { padding: Spacing.xl, gap: Spacing.md, alignItems: 'center' },
  otpInstruction: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  otpInputWrap: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg,
    borderWidth: 2, borderColor: Colors.borderGold,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  otpInput: {
    fontSize: 36, fontWeight: Typography.extrabold,
    color: Colors.gold, textAlign: 'center', letterSpacing: 12,
    width: 200,
  },
  otpDotsRow: { flexDirection: 'row', gap: 14, justifyContent: 'center' },
  otpDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.navyLight, borderWidth: 2, borderColor: Colors.border },
  otpDotFilled: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  otpModalFooter: {
    flexDirection: 'row', gap: 12, padding: Spacing.xl,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  cancelBtnText: { color: Colors.textMuted, fontWeight: Typography.semibold },
  confirmBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: BorderRadius.md, backgroundColor: Colors.gold, ...Shadows.gold,
  },
  confirmBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
});
