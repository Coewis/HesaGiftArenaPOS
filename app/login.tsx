import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/hooks/useBranch';
import { useAlert } from '@/template';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { BRANCHES, Branch } from '@/contexts/BranchContext';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login, loginWithPin, isLoading } = useAuth();
  const { currentBranch, setBranch } = useBranch();
  const { showAlert } = useAlert();

  const [mode, setMode] = useState<'email' | 'pin'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);

  const handleEmailLogin = async () => {
    if (!email || !password) {
      showAlert('Missing Fields', 'Please enter email and password.');
      return;
    }
    const result = await login(email.trim(), password);
    if (result.success) {
      router.replace('/(tabs)');
    } else {
      showAlert('Login Failed', result.error || 'Invalid credentials.');
    }
  };

  const handlePinLogin = async () => {
    if (pin.length < 4) {
      showAlert('Invalid PIN', 'Please enter your 4-digit PIN.');
      return;
    }
    const result = await loginWithPin(pin);
    if (result.success) {
      router.replace('/(tabs)');
    } else {
      showAlert('Login Failed', result.error || 'Invalid PIN.');
    }
  };

  const handlePinPress = (digit: string) => {
    if (digit === 'DEL') {
      setPin(prev => prev.slice(0, -1));
    } else if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        setTimeout(() => handlePinLoginWithValue(newPin), 200);
      }
    }
  };

  const handlePinLoginWithValue = async (value: string) => {
    const result = await loginWithPin(value);
    if (result.success) {
      router.replace('/(tabs)');
    } else {
      showAlert('Login Failed', 'Invalid PIN. Try again.');
      setPin('');
    }
  };

  const selectBranch = (branch: Branch) => {
    setBranch(branch);
    setShowBranchModal(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo Area */}
        <View style={styles.logoArea}>
          <View style={styles.logoContainer}>
            <Image
              source={{ uri: 'https://cdn-ai.onspace.ai/onspace/files/HFzL2QwD3746QPEqvEgFW7/HGA4.png' }}
              style={styles.logo}
              contentFit="contain"
              transition={300}
            />
          </View>
          <Text style={styles.brand}>HESA GIFT ARENA</Text>
          <Text style={styles.slogan}>"Where Every Gift Tells a Beautiful Story."</Text>
          <View style={styles.posBadge}>
            <MaterialIcons name="point-of-sale" size={14} color={Colors.navy} />
            <Text style={styles.posBadgeText}>POS SYSTEM</Text>
          </View>
        </View>

        {/* Branch Selector */}
        <TouchableOpacity style={styles.branchSelector} onPress={() => setShowBranchModal(true)}>
          <View style={styles.branchSelectorLeft}>
            <View style={[styles.branchDot, { backgroundColor: currentBranch.color }]} />
            <View>
              <Text style={styles.branchSelectorLabel}>Current Branch</Text>
              <Text style={styles.branchSelectorName}>{currentBranch.name}</Text>
              <Text style={styles.branchSelectorAddress} numberOfLines={1}>{currentBranch.address}</Text>
            </View>
          </View>
          <View style={styles.branchChangeBtn}>
            <MaterialIcons name="swap-horiz" size={16} color={Colors.gold} />
            <Text style={styles.branchChangeBtnText}>Change</Text>
          </View>
        </TouchableOpacity>

        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'email' && styles.modeBtnActive]}
            onPress={() => setMode('email')}
          >
            <MaterialIcons name="email" size={16} color={mode === 'email' ? Colors.navy : Colors.textMuted} />
            <Text style={[styles.modeBtnText, mode === 'email' && styles.modeBtnTextActive]}>Email</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'pin' && styles.modeBtnActive]}
            onPress={() => setMode('pin')}
          >
            <MaterialIcons name="pin" size={16} color={mode === 'pin' ? Colors.navy : Colors.textMuted} />
            <Text style={[styles.modeBtnText, mode === 'pin' && styles.modeBtnTextActive]}>Quick PIN</Text>
          </TouchableOpacity>
        </View>

        {/* Email Login Form */}
        {mode === 'email' ? (
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWrap}>
                <MaterialIcons name="email" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor={Colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <MaterialIcons name="lock" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Enter your password"
                  placeholderTextColor={Colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={styles.loginBtn} onPress={handleEmailLogin} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color={Colors.navy} />
              ) : (
                <>
                  <Text style={styles.loginBtnText}>Sign In to {currentBranch.shortName}</Text>
                  <MaterialIcons name="arrow-forward" size={18} color={Colors.navy} />
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          /* PIN Login */
          <View style={styles.pinArea}>
            <Text style={styles.pinLabel}>Enter your 4-digit PIN</Text>
            <View style={styles.pinDots}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={[styles.pinDot, pin.length > i && styles.pinDotFilled]} />
              ))}
            </View>
            <View style={styles.pinGrid}>
              {['1','2','3','4','5','6','7','8','9','','0','DEL'].map((d, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.pinKey, d === '' && styles.pinKeyEmpty, d === 'DEL' && styles.pinKeyDel]}
                  onPress={() => d && handlePinPress(d)}
                  disabled={!d || isLoading}
                >
                  {d === 'DEL' ? (
                    <MaterialIcons name="backspace" size={20} color={Colors.skyBlue} />
                  ) : (
                    <Text style={styles.pinKeyText}>{d}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            {isLoading && <ActivityIndicator color={Colors.gold} style={{ marginTop: 12 }} />}
          </View>
        )}

        {/* Demo Credentials */}
        <View style={styles.demoBox}>
          <Text style={styles.demoTitle}>DEMO CREDENTIALS</Text>
          <Text style={styles.demoText}>Admin: admin@hesagift.ug / admin123 (PIN: 1234)</Text>
          <Text style={styles.demoText}>Cashier: cashier@hesagift.ug / cashier123 (PIN: 3456)</Text>
        </View>

        {/* Rider Portal Link */}
        <TouchableOpacity style={styles.riderPortalBtn} onPress={() => router.push('/rider-login')}>
          <View style={styles.riderPortalLeft}>
            <View style={styles.riderPortalIcon}>
              <MaterialIcons name="two-wheeler" size={20} color={Colors.gold} />
            </View>
            <View>
              <Text style={styles.riderPortalTitle}>Delivery Rider?</Text>
              <Text style={styles.riderPortalSub}>Tap here to open the Rider Portal</Text>
            </View>
          </View>
          <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
      </ScrollView>

      {/* Branch Selection Modal */}
      <Modal visible={showBranchModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.branchModal}>
            <View style={styles.branchModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialIcons name="store" size={22} color={Colors.gold} />
                <Text style={styles.branchModalTitle}>Select Branch</Text>
              </View>
              <TouchableOpacity onPress={() => setShowBranchModal(false)}>
                <MaterialIcons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.branchModalSub}>Choose the store you are signing into</Text>
            {BRANCHES.map(branch => {
              const isSelected = currentBranch.id === branch.id;
              return (
                <TouchableOpacity
                  key={branch.id}
                  style={[
                    styles.branchOption,
                    isSelected && { borderColor: branch.color, backgroundColor: branch.color + '12' },
                  ]}
                  onPress={() => selectBranch(branch)}
                >
                  <View style={[styles.branchOptionIcon, { backgroundColor: branch.color + '20' }]}>
                    <MaterialIcons name={branch.icon as any} size={22} color={branch.color} />
                  </View>
                  <View style={styles.branchOptionInfo}>
                    <Text style={[styles.branchOptionName, isSelected && { color: branch.color }]}>
                      {branch.name}
                    </Text>
                    <Text style={styles.branchOptionAddress}>{branch.address}</Text>
                    <Text style={styles.branchOptionPhone}>{branch.phone}</Text>
                  </View>
                  {isSelected ? (
                    <MaterialIcons name="check-circle" size={22} color={branch.color} />
                  ) : (
                    <MaterialIcons name="radio-button-unchecked" size={22} color={Colors.textMuted} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.xl, alignItems: 'center' },
  logoArea: { alignItems: 'center', marginBottom: Spacing.xl },
  logoContainer: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: Colors.navyLight,
    borderWidth: 2, borderColor: Colors.borderGold,
    overflow: 'hidden', marginBottom: Spacing.md,
    ...Shadows.gold,
  },
  logo: { width: '100%', height: '100%' },
  brand: {
    fontSize: Typography.xl, fontWeight: Typography.extrabold,
    color: Colors.gold, letterSpacing: 2, textAlign: 'center',
  },
  slogan: {
    fontSize: Typography.sm, color: Colors.textSecondary,
    fontStyle: 'italic', textAlign: 'center', marginTop: 4,
  },
  posBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.gold, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: BorderRadius.circle, marginTop: Spacing.sm,
  },
  posBadgeText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.navy, letterSpacing: 1 },

  // Branch Selector
  branchSelector: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.navyLight, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.borderGold,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    marginBottom: Spacing.base,
  },
  branchSelectorLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  branchDot: { width: 12, height: 12, borderRadius: 6 },
  branchSelectorLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  branchSelectorName: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, marginTop: 1 },
  branchSelectorAddress: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  branchChangeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.goldMuted, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.borderGold,
  },
  branchChangeBtnText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.gold },

  modeToggle: {
    flexDirection: 'row', backgroundColor: Colors.navyLight,
    borderRadius: BorderRadius.lg, padding: 4,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.xl, width: '100%',
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 6, borderRadius: BorderRadius.md,
  },
  modeBtnActive: { backgroundColor: Colors.gold },
  modeBtnText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  modeBtnTextActive: { color: Colors.navy, fontWeight: Typography.bold },
  form: { width: '100%', gap: Spacing.base },
  inputGroup: { gap: 6 },
  label: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.navyLight, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1, color: Colors.textPrimary, fontSize: Typography.base,
    paddingVertical: 14,
  },
  eyeBtn: { padding: 4 },
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.gold, borderRadius: BorderRadius.md,
    paddingVertical: 16, gap: 8, marginTop: 8,
    ...Shadows.gold,
  },
  loginBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  pinArea: { width: '100%', alignItems: 'center', gap: Spacing.base },
  pinLabel: { fontSize: Typography.base, color: Colors.textSecondary },
  pinDots: { flexDirection: 'row', gap: 16 },
  pinDot: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: Colors.skyBlue,
    backgroundColor: 'transparent',
  },
  pinDotFilled: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  pinGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 12, justifyContent: 'center' },
  pinKey: {
    width: 68, height: 68, borderRadius: BorderRadius.md,
    backgroundColor: Colors.navyLight, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  pinKeyEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  pinKeyDel: { backgroundColor: Colors.navyLight },
  pinKeyText: { fontSize: 22, fontWeight: Typography.semibold, color: Colors.textPrimary },
  demoBox: {
    width: '100%', marginTop: Spacing.xl,
    backgroundColor: Colors.goldSubtle, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.borderGold,
    padding: Spacing.md, gap: 4,
  },
  demoTitle: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gold, letterSpacing: 1 },
  demoText: { fontSize: Typography.xs, color: Colors.textSecondary },
  riderPortalBtn: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.navyLight, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.borderGold,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginTop: 4,
  },
  riderPortalLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  riderPortalIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.borderGold },
  riderPortalTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  riderPortalSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

  // Branch Modal
  modalOverlay: {
    flex: 1, backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  branchModal: {
    backgroundColor: Colors.navyMid,
    borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.xl, paddingBottom: Spacing.xxxl,
    borderTopWidth: 2, borderColor: Colors.borderGold,
    gap: Spacing.sm,
  },
  branchModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider,
    marginBottom: Spacing.xs,
  },
  branchModalTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gold },
  branchModalSub: { fontSize: Typography.sm, color: Colors.textMuted, marginBottom: Spacing.sm },
  branchOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  branchOptionIcon: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  branchOptionInfo: { flex: 1 },
  branchOptionName: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: 2 },
  branchOptionAddress: { fontSize: Typography.xs, color: Colors.textMuted },
  branchOptionPhone: { fontSize: Typography.xs, color: Colors.textMuted },
});
