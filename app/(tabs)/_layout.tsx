import { MaterialIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, Dimensions } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePOS } from '@/hooks/usePOS';
import { useEffect } from 'react';
import { Colors } from '@/constants/theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, user } = useAuth();
  const { getLowStockProducts, orders } = usePOS();
  const router = useRouter();

  const lowStockCount = getLowStockProducts().length;
  const pendingOrderCount = orders.filter(o => o.status === 'pending').length;
  const isCashier = user?.role === 'Cashier';
  const isInventoryOfficer = user?.role === 'Inventory Officer';

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login');
  }, [isAuthenticated]);

  const screenW = Dimensions.get('window').width;
  const isDesktop = Platform.OS === 'web' && screenW >= 1024;

  const tabBarStyle = {
    height: Platform.select({ ios: insets.bottom + 64, android: insets.bottom + 64, default: isDesktop ? 56 : 72 }),
    paddingTop: isDesktop ? 6 : 8,
    paddingBottom: Platform.select({ ios: insets.bottom + 8, android: insets.bottom + 8, default: isDesktop ? 6 : 10 }),
    paddingHorizontal: isDesktop ? 40 : 4,
    backgroundColor: Colors.navyMid,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGold,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="dashboard" size={size} color={color} />,
          // Cashiers only see POS + Orders + Products
          tabBarItemStyle: isCashier ? { display: 'none' } : undefined,
        }}
      />
      <Tabs.Screen
        name="pos"
        options={{
          title: 'POS',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="point-of-sale" size={size} color={color} />,
          tabBarItemStyle: isInventoryOfficer ? { display: 'none' } : undefined,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="receipt-long" size={size} color={color} />,
          tabBarBadge: pendingOrderCount > 0 ? pendingOrderCount : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.warning, fontSize: 10 },
          tabBarItemStyle: isInventoryOfficer ? { display: 'none' } : undefined,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Products',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="inventory" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="people" size={size} color={color} />,
          // Cashiers and Inventory Officers cannot see Customers
          tabBarItemStyle: (isCashier || isInventoryOfficer) ? { display: 'none' } : undefined,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="warehouse" size={size} color={color} />,
          tabBarBadge: lowStockCount > 0 ? lowStockCount : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.warning, fontSize: 10 },
          // Cashiers cannot see Inventory
          tabBarItemStyle: isCashier ? { display: 'none' } : undefined,
        }}
      />
      <Tabs.Screen
        name="riders"
        options={{
          title: 'Riders',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="two-wheeler" size={size} color={color} />,
          tabBarItemStyle: (isCashier || isInventoryOfficer) ? { display: 'none' } : undefined,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="bar-chart" size={size} color={color} />,
          tabBarItemStyle: (isCashier || isInventoryOfficer) ? { display: 'none' } : undefined,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="settings" size={size} color={color} />,
          // Only Super Admin and Manager
          tabBarItemStyle: (isCashier || isInventoryOfficer) ? { display: 'none' } : undefined,
        }}
      />
    </Tabs>
  );
}
