import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  PanResponder, Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const PIN_LENGTH = 4;

interface ScreenLockProps {
  children: React.ReactNode;
}

export function ScreenLock({ children }: ScreenLockProps) {
  const { user, loginWithPin } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [shake] = useState(new Animated.Value(0));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(Date.now());

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (user) {
      timerRef.current = setTimeout(() => {
        setIsLocked(true);
        setPin('');
        setError('');
      }, IDLE_TIMEOUT_MS);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      resetTimer();
    } else {
      setIsLocked(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, resetTimer]);

  // PanResponder to detect any touch activity and reset timer
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => {
        resetTimer();
        return false; // Don't capture — let events pass through
      },
    })
  ).current;

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleKeyPress = async (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError('');

    if (newPin.length === PIN_LENGTH) {
      // Attempt unlock
      const result = await loginWithPin(newPin);
      if (result.success) {
        setIsLocked(false);
        setPin('');
        setAttempts(0);
        setError('');
        resetTimer();
      } else {
        triggerShake();
        setAttempts(prev => prev + 1);
        setError(attempts >= 2 ? 'Too many attempts. Try email login.' : 'Incorrect PIN. Try again.');
        setTimeout(() => setPin(''), 600);
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const KEYPAD = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];

  if (!isLocked) {
    return (
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        {children}
      </View>
    );
  }

  return (
    <>
      {/* Render children behind but hidden — keeps state alive */}
      <View style={styles.hiddenChildren} pointerEvents="none">
        {children}
      </View>

      {/* Lock Screen Overlay */}
      <Modal visible={isLocked} transparent={false} animationType="fade" statusBarTranslucent>
        <View style={styles.lockScreen}>
          {/* Brand header */}
          <View style={styles.lockBrand}>
            <View style={styles.lockLogoRing}>
              <MaterialIcons name="lock" size={32} color={Colors.gold} />
            </View>
            <Text style={styles.lockBrandName}>HESA GIFT ARENA</Text>
            <Text style={styles.lockBrandSlogan}>POS System — Session Locked</Text>
          </View>

          {/* User info */}
          <View style={styles.lockUserCard}>
            <View style={styles.lockAvatar}>
              <Text style={styles.lockAvatarText}>
                {user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'HG'}
              </Text>
            </View>
            <View>
              <Text style={styles.lockUserName}>{user?.name || 'User'}</Text>
              <Text style={styles.lockUserRole}>{user?.role}</Text>
            </View>
          </View>

          <Text style={styles.lockPrompt}>Enter PIN to resume</Text>

          {/* PIN Dots */}
          <Animated.View style={[styles.pinDots, { transform: [{ translateX: shake }] }]}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.pinDot,
                  i < pin.length && styles.pinDotFilled,
                  error && i < pin.length && styles.pinDotError,
                ]}
              />
            ))}
          </Animated.View>

          {error ? (
            <View style={styles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <View style={styles.errorRow} />
          )}

          {/* Keypad */}
          <View style={styles.keypad}>
            {KEYPAD.map((row, ri) => (
              <View key={ri} style={styles.keyRow}>
                {row.map((key, ki) => {
                  if (key === '') return <View key={ki} style={styles.keyEmpty} />;
                  if (key === 'del') {
                    return (
                      <TouchableOpacity
                        key={ki}
                        style={styles.keyBtn}
                        onPress={handleDelete}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="backspace" size={22} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={ki}
                      style={styles.keyBtn}
                      onPress={() => handleKeyPress(key)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.keyText}>{key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          <Text style={styles.lockFooter}>
            Session auto-locks after 3 minutes of inactivity
          </Text>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hiddenChildren: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  lockScreen: {
    flex: 1, backgroundColor: Colors.navy,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xxl, gap: Spacing.lg,
  },
  lockBrand: { alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  lockLogoRing: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.goldMuted,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.borderGold,
    ...Shadows.gold,
  },
  lockBrandName: {
    fontSize: Typography.xxl, fontWeight: Typography.extrabold,
    color: Colors.gold, letterSpacing: 2,
  },
  lockBrandSlogan: { fontSize: Typography.sm, color: Colors.textMuted, fontStyle: 'italic' },
  lockUserCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderWidth: 1, borderColor: Colors.borderGold,
    ...Shadows.sm,
  },
  lockAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.gold,
  },
  lockAvatarText: { fontSize: Typography.base, fontWeight: Typography.extrabold, color: Colors.gold },
  lockUserName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  lockUserRole: { fontSize: Typography.sm, color: Colors.skyBlue },
  lockPrompt: {
    fontSize: Typography.base, color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  pinDots: { flexDirection: 'row', gap: Spacing.xl, marginVertical: Spacing.sm },
  pinDot: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
    ...Shadows.gold,
  },
  pinDotError: {
    backgroundColor: Colors.danger,
    borderColor: Colors.danger,
  },
  errorRow: { height: 22, flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { fontSize: Typography.sm, color: Colors.danger },
  keypad: { gap: Spacing.md, width: '100%', maxWidth: 280 },
  keyRow: { flexDirection: 'row', gap: Spacing.md },
  keyEmpty: { flex: 1, height: 68 },
  keyBtn: {
    flex: 1, height: 68,
    backgroundColor: Colors.navyCard,
    borderRadius: BorderRadius.lg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
    ...Shadows.sm,
  },
  keyText: {
    fontSize: Typography.xxl, fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  lockFooter: {
    fontSize: Typography.xs, color: Colors.textMuted,
    textAlign: 'center', marginTop: Spacing.sm,
  },
});
