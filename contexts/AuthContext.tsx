import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { MOCK_USERS } from '@/constants/mockData';
import { User, UserRole } from '@/types';
import { getSupabaseClient } from '@/template';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PERMISSIONS: Record<UserRole, string[]> = {
  'Super Admin': ['dashboard', 'pos', 'products', 'customers', 'inventory', 'reports', 'delete', 'settings'],
  'Manager': ['dashboard', 'pos', 'products', 'customers', 'inventory', 'reports'],
  'Cashier': ['pos', 'customers'],
  'Inventory Officer': ['inventory', 'products'],
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      // First attempt Supabase auth
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase().trim(), password });

      if (!error && data.user) {
        // Look up POS user profile by email
        const mockUser = MOCK_USERS.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
        const posUser: User = {
          id: data.user.id,
          name: mockUser?.name || data.user.email?.split('@')[0] || 'User',
          email: data.user.email || email,
          role: (mockUser?.role as UserRole) || 'Cashier',
          pin: mockUser?.pin,
        };
        setUser(posUser);
        return { success: true };
      }

      // Fallback: local mock auth
      const mockUser = MOCK_USERS.find(
        u => u.email.toLowerCase() === email.toLowerCase().trim() && u.password === password
      );
      if (mockUser) {
        setUser({ id: mockUser.id, name: mockUser.name, email: mockUser.email, role: mockUser.role as UserRole, pin: mockUser.pin });
        return { success: true };
      }
      return { success: false, error: 'Invalid email or password.' };
    } catch {
      // Pure mock fallback
      const mockUser = MOCK_USERS.find(
        u => u.email.toLowerCase() === email.toLowerCase().trim() && u.password === password
      );
      if (mockUser) {
        setUser({ id: mockUser.id, name: mockUser.name, email: mockUser.email, role: mockUser.role as UserRole, pin: mockUser.pin });
        return { success: true };
      }
      return { success: false, error: 'Invalid email or password.' };
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithPin = async (pin: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 300));
    const matchedUser = MOCK_USERS.find(u => u.pin === pin);
    setIsLoading(false);
    if (matchedUser) {
      if (!user || user.pin !== pin) {
        setUser({ id: matchedUser.id, name: matchedUser.name, email: matchedUser.email, role: matchedUser.role as UserRole, pin: matchedUser.pin });
      }
      return { success: true };
    }
    if (user && user.pin === pin) return { success: true };
    return { success: false, error: 'Invalid PIN.' };
  };

  const logout = () => {
    setUser(null);
    try { getSupabaseClient().auth.signOut(); } catch {}
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    return PERMISSIONS[user.role]?.includes(permission) ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, loginWithPin, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}
