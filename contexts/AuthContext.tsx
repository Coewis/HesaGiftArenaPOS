import React, { createContext, useState, ReactNode, useRef } from 'react';
import { MOCK_USERS } from '@/constants/mockData';
import { User, UserRole } from '@/types';
import { getSupabaseClient } from '@/template';
import { BRANCHES, Branch } from '@/contexts/BranchContext';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; branch?: Branch }>;
  loginWithPin: (pin: string) => Promise<{ success: boolean; error?: string; branch?: Branch }>;
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

  // Resolve the assigned branch for a staff member from pos_staff table
  const resolveStaffBranch = async (email: string, staffId?: string): Promise<Branch | null> => {
    try {
      const supabase = getSupabaseClient();
      let query = supabase.from('pos_staff').select('branch_id, branch_name').limit(1);
      if (staffId) query = query.eq('id', staffId);
      else query = query.eq('email', email.toLowerCase().trim());
      const { data } = await query.maybeSingle();
      if (data?.branch_id) {
        const found = BRANCHES.find(b => b.id === data.branch_id);
        return found || null;
      }
    } catch {}
    return null;
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string; branch?: Branch }> => {
    setIsLoading(true);
    try {
      const supabase = getSupabaseClient();

      // Try Supabase auth first
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase().trim(), password });

      if (!error && data.user) {
        // Look up staff record in pos_staff by auth_user_id or email
        const { data: staffRow } = await supabase
          .from('pos_staff')
          .select('id, name, role, pin, branch_id, branch_name')
          .or(`auth_user_id.eq.${data.user.id},email.eq.${email.toLowerCase().trim()}`)
          .eq('status', 'active')
          .maybeSingle();

        const mockUser = MOCK_USERS.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
        const posUser: User = {
          id: data.user.id,
          name: staffRow?.name || mockUser?.name || data.user.email?.split('@')[0] || 'User',
          email: data.user.email || email,
          role: (staffRow?.role as UserRole) || (mockUser?.role as UserRole) || 'Cashier',
          pin: staffRow?.pin || mockUser?.pin,
        };
        setUser(posUser);

        // Resolve assigned branch
        const assignedBranch = staffRow?.branch_id
          ? (BRANCHES.find(b => b.id === staffRow.branch_id) || null)
          : await resolveStaffBranch(email);

        return { success: true, branch: assignedBranch || undefined };
      }

      // Fallback: local mock auth
      const mockUser = MOCK_USERS.find(
        u => u.email.toLowerCase() === email.toLowerCase().trim() && u.password === password
      );
      if (mockUser) {
        setUser({ id: mockUser.id, name: mockUser.name, email: mockUser.email, role: mockUser.role as UserRole, pin: mockUser.pin });
        const branch = await resolveStaffBranch(email);
        return { success: true, branch: branch || undefined };
      }
      return { success: false, error: 'Invalid email or password.' };
    } catch {
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

  const loginWithPin = async (pin: string): Promise<{ success: boolean; error?: string; branch?: Branch }> => {
    setIsLoading(true);
    try {
      // Try to find pin in pos_staff (cloud)
      const supabase = getSupabaseClient();
      const { data: staffRow } = await supabase
        .from('pos_staff')
        .select('id, name, email, role, pin, branch_id, branch_name')
        .eq('pin', pin)
        .eq('status', 'active')
        .maybeSingle();

      if (staffRow) {
        const posUser: User = {
          id: staffRow.id,
          name: staffRow.name,
          email: staffRow.email,
          role: staffRow.role as UserRole,
          pin: staffRow.pin,
        };
        setUser(posUser);
        const assignedBranch = staffRow.branch_id
          ? (BRANCHES.find(b => b.id === staffRow.branch_id) || null)
          : null;
        return { success: true, branch: assignedBranch || undefined };
      }

      // Fallback: mock
      await new Promise(r => setTimeout(r, 200));
      const matchedUser = MOCK_USERS.find(u => u.pin === pin);
      if (matchedUser) {
        if (!user || user.pin !== pin) {
          setUser({ id: matchedUser.id, name: matchedUser.name, email: matchedUser.email, role: matchedUser.role as UserRole, pin: matchedUser.pin });
        }
        const branch = await resolveStaffBranch(matchedUser.email);
        return { success: true, branch: branch || undefined };
      }
      if (user && user.pin === pin) return { success: true };
      return { success: false, error: 'Invalid PIN.' };
    } catch {
      await new Promise(r => setTimeout(r, 200));
      const matchedUser = MOCK_USERS.find(u => u.pin === pin);
      if (matchedUser) {
        setUser({ id: matchedUser.id, name: matchedUser.name, email: matchedUser.email, role: matchedUser.role as UserRole, pin: matchedUser.pin });
        return { success: true };
      }
      return { success: false, error: 'Invalid PIN.' };
    } finally {
      setIsLoading(false);
    }
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
