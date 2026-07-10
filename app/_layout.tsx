import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertProvider } from '@/template';
import { AuthProvider } from '@/contexts/AuthContext';
import { POSProvider } from '@/contexts/POSContext';
import { CartProvider } from '@/contexts/CartContext';
import { BranchProvider } from '@/contexts/BranchContext';
import { ShiftProvider } from '@/contexts/ShiftContext';
import { ScreenLock } from '@/components/ScreenLock';
import { Platform, View, Dimensions, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

const isDesktop = Platform.OS === 'web';

export default function RootLayout() {
  return (
    <AlertProvider>
      <SafeAreaProvider>
        <BranchProvider>
          <AuthProvider>
            <POSProvider>
              <CartProvider>
                <ShiftProvider>
                  <ScreenLock>
                    {isDesktop ? (
                      <View style={styles.desktopShell}>
                        <View style={styles.desktopApp}>
                          <Stack screenOptions={{ headerShown: false }}>
                            <Stack.Screen name="index" />
                            <Stack.Screen name="login" />
                            <Stack.Screen name="rider-login" />
                            <Stack.Screen name="(tabs)" />
                          </Stack>
                        </View>
                      </View>
                    ) : (
                      <Stack screenOptions={{ headerShown: false }}>
                        <Stack.Screen name="index" />
                        <Stack.Screen name="login" />
                        <Stack.Screen name="rider-login" />
                        <Stack.Screen name="(tabs)" />
                      </Stack>
                    )}
                  </ScreenLock>
                </ShiftProvider>
              </CartProvider>
            </POSProvider>
          </AuthProvider>
        </BranchProvider>
      </SafeAreaProvider>
    </AlertProvider>
  );
}

const styles = StyleSheet.create({
  desktopShell: {
    flex: 1,
    backgroundColor: '#060e1c', // very dark outer frame
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopApp: {
    width: '100%',
    maxWidth: 1440,
    flex: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: Colors.borderGold,
  },
});
