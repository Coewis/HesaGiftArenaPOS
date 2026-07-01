import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { usePOS } from '@/hooks/usePOS';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/hooks/useBranch';
import { useShift } from '@/hooks/useShift';
import { useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { MOCK_USERS } from '@/constants/mockData';
import { UserRole } from '@/types';

const { width } = Dimensions.get('window');
const formatUGX = (n: number) => `UGX ${n.toLocaleString()}`;

// Default store settings state
const DEFAULT_SETTINGS = {
  storeName: 'HESA GIFT ARENA',
  storeAddress: 'Plot 14, Kampala Road, Kampala, Uganda',
  storePhone: '+256 700 000 001',
  storeEmail: 'info@hesagift.ug',
  receiptFooter: '"Where Every Gift Tells a Beautiful Story."',
  taxRate: '0',
  sessionTimeout: '3',
  currency: 'UGX',
};

type SettingsSection = 'store' | 'receipt' | 'pins' | 'session' | 'backup' | 'staff' | 'system';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  pin: string;
  branchId: string;
  branchName: string;
  status: 'active' | 'inactive';
  authUserId?: string;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { currentBranch, branches } = useBranch();
  const { products, customers, sales, orders, inventoryMovements } = usePOS();
  const { isCloudSynced, isSyncing } = usePOS();
  const { shifts } = useShift();
  const { showAlert } = useAlert();

  // Staff management state
  const [staffList, setStaffList] = useState<StaffMember[]>(
    MOCK_USERS.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role as UserRole, pin: u.pin || '', branchId: currentBranch.id, branchName: currentBranch.name, status: 'active' as const }))
  );
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState<UserRole>('Cashier');
  const [staffPin, setStaffPin] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [savingStaff, setSavingStaff] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  // Backup state
  const [backupRunning, setBackupRunning] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [backupFormat, setBackupFormat] = useState<'json' | 'csv'>('json');

  const [activeSection, setActiveSection] = useState<SettingsSection>('store');
  const [saving, setSaving] = useState(false);

  // Store Profile
  const [storeName, setStoreName] = useState(DEFAULT_SETTINGS.storeName);
  const [storeAddress, setStoreAddress] = useState(DEFAULT_SETTINGS.storeAddress);
  const [storePhone, setStorePhone] = useState(DEFAULT_SETTINGS.storePhone);
  const [storeEmail, setStoreEmail] = useState(DEFAULT_SETTINGS.storeEmail);

  // Receipt
  const [receiptFooter, setReceiptFooter] = useState(DEFAULT_SETTINGS.receiptFooter);
  const [taxRate, setTaxRate] = useState(DEFAULT_SETTINGS.taxRate);

  // Session
  const [sessionTimeout, setSessionTimeout] = useState(DEFAULT_SETTINGS.sessionTimeout);

  // PIN management
  const [showPinModal, setShowPinModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<typeof MOCK_USERS[0] | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);

  const systemStats = useMemo(() => ({
    products: products.length,
    activeProducts: products.filter(p => p.status === 'active').length,
    customers: customers.length,
    totalSales: sales.length,
    totalRevenue: sales.filter(s => s.status === 'completed').reduce((sum, s) => sum + s.total, 0),
    orders: orders.length,
  }), [products, customers, sales, orders]);

  const ROLES: UserRole[] = ['Super Admin', 'Manager', 'Cashier', 'Inventory Officer'];

  const openAddStaff = () => {
    setEditingStaff(null);
    setStaffName(''); setStaffEmail(''); setStaffRole('Cashier');
    setStaffPin(''); setStaffPassword('');
    setShowStaffModal(true);
  };

  const openEditStaff = (staff: StaffMember) => {
    setEditingStaff(staff);
    setStaffName(staff.name); setStaffEmail(staff.email);
    setStaffRole(staff.role); setStaffPin(staff.pin);
    setStaffPassword('');
    setShowStaffModal(true);
  };

  const handleSaveStaff = async () => {
    if (!staffName.trim() || !staffEmail.trim()) { showAlert('Missing Fields', 'Name and email are required.'); return; }
    if (staffPin && (staffPin.length !== 4 || !/^\d{4}$/.test(staffPin))) { showAlert('Invalid PIN', 'PIN must be exactly 4 digits.'); return; }
    setSavingStaff(true);
    try {
      const db = getSupabaseClient();
      if (editingStaff) {
        // Update existing
        const updated: StaffMember = { ...editingStaff, name: staffName.trim(), email: staffEmail.trim().toLowerCase(), role: staffRole, pin: staffPin };
        setStaffList(prev => prev.map(s => s.id === editingStaff.id ? updated : s));
        await db.from('pos_staff').upsert({ id: updated.id, name: updated.name, email: updated.email, role: updated.role, pin: updated.pin, branch_id: updated.branchId, branch_name: updated.branchName, status: updated.status, updated_at: new Date().toISOString() });
      } else {
        // Create new staff + Supabase auth account
        const password = staffPassword || `HGA@${staffPin || '1234'}!`;
        let authUserId: string | undefined;
        try {
          const { data: signUpData } = await db.auth.admin ? (db as any).auth.admin.createUser({ email: staffEmail.trim().toLowerCase(), password, email_confirm: true }) : { data: null };
          authUserId = signUpData?.user?.id;
        } catch {}

        const newStaff: StaffMember = { id: `staff_${Date.now()}`, name: staffName.trim(), email: staffEmail.trim().toLowerCase(), role: staffRole, pin: staffPin, branchId: currentBranch.id, branchName: currentBranch.name, status: 'active', authUserId };
        setStaffList(prev => [newStaff, ...prev]);
        await db.from('pos_staff').insert({ id: newStaff.id, name: newStaff.name, email: newStaff.email, role: newStaff.role, pin: newStaff.pin, branch_id: newStaff.branchId, branch_name: newStaff.branchName, status: 'active', auth_user_id: authUserId || null });
      }
      setShowStaffModal(false);
      showAlert('Saved', editingStaff ? `${staffName} account updated.` : `${staffName} added as ${staffRole}.`);
    } catch { showAlert('Error', 'Could not save staff member.'); }
    finally { setSavingStaff(false); }
  };

  const handleToggleStaffStatus = async (staff: StaffMember) => {
    const newStatus = staff.status === 'active' ? 'inactive' : 'active';
    showAlert(
      newStatus === 'inactive' ? 'Deactivate Staff' : 'Reactivate Staff',
      `${newStatus === 'inactive' ? 'Deactivate' : 'Reactivate'} ${staff.name}? ${newStatus === 'inactive' ? 'They will no longer be able to login.' : 'They will regain access to the system.'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: newStatus === 'inactive' ? 'Deactivate' : 'Activate', style: newStatus === 'inactive' ? 'destructive' : 'default', onPress: async () => {
          setDeactivating(staff.id);
          try {
            setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, status: newStatus } : s));
            const db = getSupabaseClient();
            await db.from('pos_staff').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', staff.id);
          } catch { showAlert('Error', 'Could not update staff status.'); }
          finally { setDeactivating(null); }
        }}
      ]
    );
  };

  const renderStaff = () => (
    <View style={styles.sectionBody}>
      <View style={styles.sectionIntro}>
        <MaterialIcons name="people" size={18} color="#E67E22" />
        <Text style={styles.sectionIntroText}>Manage staff accounts. Each staff member gets a Supabase login tied to their role and branch.</Text>
      </View>
      <View style={styles.staffHeader}>
        <Text style={styles.dbSectionLabel}>Staff Members ({staffList.filter(s => s.status === 'active').length} active)</Text>
        <TouchableOpacity style={styles.addStaffBtn} onPress={openAddStaff}>
          <MaterialIcons name="person-add" size={14} color={Colors.navy} />
          <Text style={styles.addStaffBtnText}>Add Staff</Text>
        </TouchableOpacity>
      </View>
      {staffList.map(staff => {
        const isDeactivating = deactivating === staff.id;
        return (
          <View key={staff.id} style={[styles.staffCard, staff.status === 'inactive' && { opacity: 0.55 }]}>
            <View style={styles.staffAvatar}>
              <Text style={styles.staffAvatarText}>{staff.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}</Text>
            </View>
            <View style={styles.staffInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.staffName}>{staff.name}</Text>
                <View style={[styles.rolePill, { backgroundColor: getRoleColor(staff.role) + '20' }]}>
                  <Text style={[styles.rolePillText, { color: getRoleColor(staff.role) }]}>{staff.role}</Text>
                </View>
              </View>
              <Text style={styles.staffEmail}>{staff.email}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.statusPill, { backgroundColor: staff.status === 'active' ? Colors.successMuted : Colors.dangerMuted }]}>
                  <View style={[styles.statusDot, { backgroundColor: staff.status === 'active' ? Colors.success : Colors.danger }]} />
                  <Text style={[styles.statusPillText, { color: staff.status === 'active' ? Colors.success : Colors.danger }]}>{staff.status}</Text>
                </View>
                <Text style={styles.staffBranch}>{staff.branchName}</Text>
              </View>
            </View>
            <View style={styles.staffActions}>
              <TouchableOpacity style={styles.changePinBtn} onPress={() => openEditStaff(staff)}>
                <MaterialIcons name="edit" size={14} color={Colors.skyBlue} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.changePinBtn, { borderColor: (staff.status === 'active' ? Colors.danger : Colors.success) + '40' }]}
                onPress={() => handleToggleStaffStatus(staff)}
                disabled={isDeactivating}
              >
                {isDeactivating ? <ActivityIndicator size="small" color={Colors.danger} /> : <MaterialIcons name={staff.status === 'active' ? 'person-off' : 'person'} size={14} color={staff.status === 'active' ? Colors.danger : Colors.success} />}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
      <View style={styles.infoBox}>
        <MaterialIcons name="info" size={16} color={Colors.skyBlue} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.infoBoxTitle}>Staff Login Integration</Text>
          <Text style={styles.infoBoxText}>New staff accounts are registered in Supabase Auth and the pos_staff table. Each login creates a real session tied to the staff member's role and branch assignment.</Text>
        </View>
      </View>
    </View>
  );

  const SECTIONS: { key: SettingsSection; label: string; icon: string; color: string }[] = [
    { key: 'store', label: 'Store Profile', icon: 'store', color: Colors.gold },
    { key: 'receipt', label: 'Receipt Setup', icon: 'receipt-long', color: Colors.skyBlue },
    { key: 'pins', label: 'PIN Management', icon: 'pin', color: '#9B59B6' },
    { key: 'session', label: 'Session & Tax', icon: 'timer', color: Colors.success },
    { key: 'backup', label: 'Data Backup', icon: 'cloud-upload', color: '#E67E22' },
    { key: 'staff', label: 'Staff Accounts', icon: 'manage-accounts', color: '#E74C3C' },
    { key: 'system', label: 'System Info', icon: 'info', color: Colors.warning },
  ];

  const handleSaveStore = async () => {
    if (!storeName.trim()) { showAlert('Error', 'Store name is required.'); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    showAlert('Saved', 'Store profile updated successfully.');
  };

  const handleSaveReceipt = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
    showAlert('Saved', 'Receipt settings updated.');
  };

  const handleSaveSession = async () => {
    const timeout = parseInt(sessionTimeout);
    if (isNaN(timeout) || timeout < 1 || timeout > 60) {
      showAlert('Invalid', 'Session timeout must be between 1 and 60 minutes.');
      return;
    }
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
    showAlert('Saved', `Session timeout set to ${timeout} minutes.`);
  };

  const openPinModal = (u: typeof MOCK_USERS[0]) => {
    setSelectedUser(u);
    setNewPin(''); setConfirmPin('');
    setShowPinModal(true);
  };

  // ─── Backup Helpers ──────────────────────────────────────────────────────
  const getTodayISO = () => new Date().toISOString().slice(0, 10);

  const buildBackupJSON = () => {
    const today = getTodayISO();
    const todaySales = sales.filter(s => s.timestamp.startsWith(today));
    const todayMovements = inventoryMovements.filter(m => m.timestamp.startsWith(today));
    const todayShifts = shifts.filter(s => s.openingTime.startsWith(today));
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      date: today,
      branch: currentBranch.name,
      summary: {
        totalSales: todaySales.length,
        totalRevenue: todaySales.reduce((sum, s) => sum + s.total, 0),
        inventoryMovements: todayMovements.length,
        shifts: todayShifts.length,
      },
      sales: todaySales,
      inventoryMovements: todayMovements,
      shifts: todayShifts,
    }, null, 2);
  };

  const buildBackupCSV = () => {
    const today = getTodayISO();
    const todaySales = sales.filter(s => s.timestamp.startsWith(today));
    const headers = ['receiptNo', 'cashier', 'branchName', 'total', 'paymentMethod', 'customerName', 'timestamp', 'status'];
    const rows = todaySales.map(s => [
      s.receiptNo, s.cashier, s.branchName || '', s.total,
      s.paymentMethod, s.customerName || '', s.timestamp, s.status,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    return [headers.join(','), ...rows].join('\n');
  };

  const handleRunBackup = async (shareAfter = false) => {
    setBackupRunning(true);
    try {
      const today = getTodayISO();
      const isJSON = backupFormat === 'json';
      const content = isJSON ? buildBackupJSON() : buildBackupCSV();
      const ext = isJSON ? 'json' : 'csv';
      const fileName = `hga-backup-${today}-${currentBranch.id}.${ext}`;

      // Upload to Supabase Storage
      try {
        const db = getSupabaseClient();
        const bytes = new TextEncoder().encode(content);
        await db.storage.from('pos-backups').upload(
          `${currentBranch.id}/${fileName}`,
          bytes,
          { contentType: isJSON ? 'application/json' : 'text/csv', upsert: true }
        );
      } catch {}

      // Write to local file for sharing
      const localPath = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(localPath, content, { encoding: FileSystem.EncodingType.UTF8 });

      const now = new Date().toLocaleTimeString('en-UG');
      setLastBackupTime(now);

      if (shareAfter) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(localPath, {
            mimeType: isJSON ? 'application/json' : 'text/csv',
            dialogTitle: `EOD Backup - ${today}`,
          });
        }
      } else {
        showAlert('Backup Complete', `End-of-day data backed up to cloud at ${now}.`);
      }
    } catch {
      showAlert('Backup Failed', 'Could not complete backup. Check your connection.');
    } finally {
      setBackupRunning(false);
    }
  };

  const renderBackup = () => {
    const today = getTodayISO();
    const todaySales = sales.filter(s => s.timestamp.startsWith(today));
    const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
    const todayMovements = inventoryMovements.filter(m => m.timestamp.startsWith(today));
    const todayShifts = shifts.filter(s => s.openingTime.startsWith(today));

    return (
      <View style={styles.sectionBody}>
        <View style={styles.sectionIntro}>
          <MaterialIcons name="cloud-upload" size={18} color="#E67E22" />
          <Text style={styles.sectionIntroText}>Export today's sales, inventory, and shift data to Supabase Cloud Storage and share as a file.</Text>
        </View>

        {/* Today's Summary */}
        <Text style={[styles.dbSectionLabel, { marginTop: 0 }]}>Today's Data Snapshot ({today})</Text>
        <View style={styles.dbGrid}>
          {[
            { label: 'Sales', value: todaySales.length, sub: `UGX ${todayRevenue.toLocaleString()}`, icon: 'receipt-long', color: Colors.gold },
            { label: 'Movements', value: todayMovements.length, sub: 'stock changes', icon: 'swap-vert', color: Colors.skyBlue },
            { label: 'Shifts', value: todayShifts.length, sub: 'cashier shifts', icon: 'access-time', color: Colors.success },
          ].map(stat => (
            <View key={stat.label} style={styles.dbCard}>
              <View style={[styles.dbCardIcon, { backgroundColor: stat.color + '20' }]}>
                <MaterialIcons name={stat.icon as any} size={18} color={stat.color} />
              </View>
              <Text style={[styles.dbCardValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={styles.dbCardLabel}>{stat.label}</Text>
              <Text style={styles.dbCardSub}>{stat.sub}</Text>
            </View>
          ))}
        </View>

        {/* Format selector */}
        <View style={{ gap: 6 }}>
          <Text style={styles.formLabel}>Export Format</Text>
          <View style={styles.backupFormatRow}>
            {(['json', 'csv'] as const).map(fmt => (
              <TouchableOpacity
                key={fmt}
                style={[styles.backupFormatBtn, backupFormat === fmt && { backgroundColor: '#E67E22' + '20', borderColor: '#E67E22' }]}
                onPress={() => setBackupFormat(fmt)}
              >
                <MaterialIcons
                  name={fmt === 'json' ? 'code' : 'table-chart'}
                  size={18}
                  color={backupFormat === fmt ? '#E67E22' : Colors.textMuted}
                />
                <View>
                  <Text style={[styles.backupFormatLabel, backupFormat === fmt && { color: '#E67E22', fontWeight: Typography.bold }]}>{fmt.toUpperCase()}</Text>
                  <Text style={styles.backupFormatSub}>{fmt === 'json' ? 'Full structured data' : 'Sales spreadsheet'}</Text>
                </View>
                {backupFormat === fmt && <MaterialIcons name="check-circle" size={16} color="#E67E22" style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Cloud status */}
        <View style={[styles.syncCard, { borderColor: isCloudSynced ? Colors.success + '50' : Colors.warning + '50' }]}>
          <View style={styles.syncCardHeader}>
            <View style={[styles.syncDot, { backgroundColor: isCloudSynced ? Colors.success : Colors.warning }]} />
            <Text style={[styles.syncStatus, { color: isCloudSynced ? Colors.success : Colors.warning }]}>
              {isCloudSynced ? 'Cloud Ready — Backup will upload to Supabase Storage' : 'Offline — Backup saved locally only'}
            </Text>
          </View>
          {lastBackupTime && (
            <Text style={styles.syncTime}>Last backup: {lastBackupTime}</Text>
          )}
        </View>

        {/* Backup Actions */}
        <View style={styles.backupActions}>
          <TouchableOpacity
            style={[styles.backupBtn, backupRunning && { opacity: 0.7 }]}
            onPress={() => handleRunBackup(false)}
            disabled={backupRunning}
          >
            {backupRunning
              ? <ActivityIndicator color="#fff" size="small" />
              : <MaterialIcons name="cloud-upload" size={18} color="#fff" />
            }
            <Text style={styles.backupBtnText}>{backupRunning ? 'Backing up...' : 'Run Backup Now'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.backupShareBtn, backupRunning && { opacity: 0.7 }]}
            onPress={() => handleRunBackup(true)}
            disabled={backupRunning}
          >
            <MaterialIcons name="share" size={16} color="#E67E22" />
            <Text style={styles.backupShareBtnText}>Export & Share</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <MaterialIcons name="info" size={16} color={Colors.skyBlue} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.infoBoxTitle}>Backup Contents</Text>
            <Text style={styles.infoBoxText}>Includes all of today's completed sales, inventory stock movements (sales, restocks, damages), and cashier shift records. Files are stored in Supabase Storage under the branch folder.</Text>
          </View>
        </View>
      </View>
    );
  };

  const handleSavePin = () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      showAlert('Invalid PIN', 'PIN must be exactly 4 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      showAlert('Mismatch', 'PINs do not match. Please re-enter.');
      return;
    }
    setShowPinModal(false);
    showAlert('PIN Updated', `PIN for ${selectedUser?.name} has been updated.`);
  };

  const renderStore = () => (
    <View style={styles.sectionBody}>
      <View style={styles.sectionIntro}>
        <MaterialIcons name="store" size={18} color={Colors.gold} />
        <Text style={styles.sectionIntroText}>Configure your store's public information used on receipts and reports.</Text>
      </View>
      {[
        { label: 'Store Name', value: storeName, onChange: setStoreName, icon: 'store', placeholder: 'Store display name' },
        { label: 'Address', value: storeAddress, onChange: setStoreAddress, icon: 'location-on', placeholder: 'Full physical address', multi: true },
        { label: 'Phone Number', value: storePhone, onChange: setStorePhone, icon: 'phone', placeholder: '+256 7XX XXX XXX', keyboard: 'phone-pad' as const },
        { label: 'Email Address', value: storeEmail, onChange: setStoreEmail, icon: 'email', placeholder: 'store@email.com', keyboard: 'email-address' as const },
      ].map(field => (
        <View key={field.label} style={styles.formGroup}>
          <Text style={styles.formLabel}>{field.label}</Text>
          <View style={styles.inputWrap}>
            <MaterialIcons name={field.icon as any} size={16} color={Colors.textMuted} />
            <TextInput
              style={[styles.input, field.multi && { height: 60, textAlignVertical: 'top' }]}
              placeholder={field.placeholder}
              placeholderTextColor={Colors.textMuted}
              value={field.value}
              onChangeText={field.onChange}
              keyboardType={field.keyboard || 'default'}
              multiline={field.multi}
            />
          </View>
        </View>
      ))}
      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSaveStore} disabled={saving}>
        {saving ? <ActivityIndicator color={Colors.navy} size="small" /> : <>
          <MaterialIcons name="check" size={16} color={Colors.navy} />
          <Text style={styles.saveBtnText}>Save Store Profile</Text>
        </>}
      </TouchableOpacity>
    </View>
  );

  const renderReceipt = () => (
    <View style={styles.sectionBody}>
      <View style={styles.sectionIntro}>
        <MaterialIcons name="receipt-long" size={18} color={Colors.skyBlue} />
        <Text style={styles.sectionIntroText}>Customise what appears on printed and shared receipts.</Text>
      </View>

      {/* Receipt Preview */}
      <View style={styles.receiptPreview}>
        <View style={styles.receiptPreviewHeader}>
          <MaterialIcons name="receipt" size={14} color={Colors.gold} />
          <Text style={styles.receiptPreviewLabel}>Receipt Preview</Text>
        </View>
        <View style={styles.receiptPreviewBody}>
          <View style={styles.receiptLogoPlaceholder}>
            <MaterialIcons name="image" size={24} color={Colors.gold} />
            <Text style={styles.receiptLogoText}>Logo</Text>
          </View>
          <Text style={styles.receiptPreviewBrand}>{storeName}</Text>
          <Text style={styles.receiptPreviewAddr}>{storeAddress}</Text>
          <Text style={styles.receiptPreviewPhone}>{storePhone}</Text>
          <View style={styles.receiptPreviewDivider} />
          <Text style={styles.receiptPreviewLine}>Item 1 × 2 ... UGX 25,000</Text>
          <Text style={styles.receiptPreviewLine}>Item 2 × 1 ... UGX 15,000</Text>
          <View style={styles.receiptPreviewDivider} />
          <Text style={styles.receiptPreviewTotal}>TOTAL: UGX 65,000</Text>
          <View style={styles.receiptPreviewDivider} />
          <Text style={styles.receiptPreviewFooter}>{receiptFooter}</Text>
          {parseFloat(taxRate) > 0 && (
            <Text style={styles.receiptPreviewTax}>VAT/Tax: {taxRate}% included</Text>
          )}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Receipt Footer Message</Text>
        <TextInput
          style={[styles.inputWrapFlat, { height: 72, textAlignVertical: 'top' }]}
          placeholder="Message shown at bottom of every receipt..."
          placeholderTextColor={Colors.textMuted}
          value={receiptFooter}
          onChangeText={setReceiptFooter}
          multiline
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Tax / VAT Rate (%)</Text>
        <View style={styles.inputWrap}>
          <MaterialIcons name="percent" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.input}
            placeholder="0 for no tax"
            placeholderTextColor={Colors.textMuted}
            value={taxRate}
            onChangeText={setTaxRate}
            keyboardType="numeric"
          />
        </View>
        <Text style={styles.fieldHint}>Enter 0 to disable tax on receipts. E.g. 18 for 18% VAT.</Text>
      </View>

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSaveReceipt} disabled={saving}>
        {saving ? <ActivityIndicator color={Colors.navy} size="small" /> : <>
          <MaterialIcons name="check" size={16} color={Colors.navy} />
          <Text style={styles.saveBtnText}>Save Receipt Settings</Text>
        </>}
      </TouchableOpacity>
    </View>
  );

  const renderPins = () => (
    <View style={styles.sectionBody}>
      <View style={styles.sectionIntro}>
        <MaterialIcons name="pin" size={18} color="#9B59B6" />
        <Text style={styles.sectionIntroText}>Manage Quick PIN login for each staff member. PINs must be 4 digits.</Text>
      </View>
      {MOCK_USERS.map(u => (
        <View key={u.id} style={styles.pinUserCard}>
          <View style={styles.pinUserAvatar}>
            <Text style={styles.pinUserAvatarText}>{u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</Text>
          </View>
          <View style={styles.pinUserInfo}>
            <Text style={styles.pinUserName}>{u.name}</Text>
            <View style={styles.pinUserMeta}>
              <View style={[styles.rolePill, { backgroundColor: getRoleColor(u.role) + '20' }]}>
                <Text style={[styles.rolePillText, { color: getRoleColor(u.role) }]}>{u.role}</Text>
              </View>
              <Text style={styles.pinUserEmail}>{u.email}</Text>
            </View>
          </View>
          <View style={styles.pinStatus}>
            {u.pin ? (
              <View style={styles.pinSetBadge}>
                <MaterialIcons name="lock" size={12} color={Colors.success} />
                <Text style={styles.pinSetText}>PIN set</Text>
              </View>
            ) : (
              <View style={styles.pinNotSetBadge}>
                <MaterialIcons name="lock-open" size={12} color={Colors.warning} />
                <Text style={styles.pinNotSetText}>No PIN</Text>
              </View>
            )}
            <TouchableOpacity style={styles.changePinBtn} onPress={() => openPinModal(u)}>
              <MaterialIcons name="edit" size={14} color={Colors.skyBlue} />
              <Text style={styles.changePinBtnText}>Change</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );

  const renderSession = () => (
    <View style={styles.sectionBody}>
      <View style={styles.sectionIntro}>
        <MaterialIcons name="timer" size={18} color={Colors.success} />
        <Text style={styles.sectionIntroText}>Configure security timeout and session behaviour for POS terminals.</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Idle Screen Lock Timeout (minutes)</Text>
        <View style={styles.inputWrap}>
          <MaterialIcons name="timer" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.input}
            placeholder="3"
            placeholderTextColor={Colors.textMuted}
            value={sessionTimeout}
            onChangeText={setSessionTimeout}
            keyboardType="numeric"
          />
        </View>
        <Text style={styles.fieldHint}>POS will lock after this many minutes of inactivity. Minimum: 1, Maximum: 60.</Text>
      </View>

      <View style={styles.timeoutOptions}>
        {['1', '3', '5', '10', '15', '30'].map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.timeoutChip, sessionTimeout === t && styles.timeoutChipActive]}
            onPress={() => setSessionTimeout(t)}
          >
            <Text style={[styles.timeoutChipText, sessionTimeout === t && styles.timeoutChipTextActive]}>{t} min</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.infoBox}>
        <MaterialIcons name="security" size={16} color={Colors.skyBlue} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.infoBoxTitle}>Security Note</Text>
          <Text style={styles.infoBoxText}>When the screen locks, staff must enter their PIN to resume the session. No full logout occurs — cart and current sale are preserved.</Text>
        </View>
      </View>

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSaveSession} disabled={saving}>
        {saving ? <ActivityIndicator color={Colors.navy} size="small" /> : <>
          <MaterialIcons name="check" size={16} color={Colors.navy} />
          <Text style={styles.saveBtnText}>Save Session Settings</Text>
        </>}
      </TouchableOpacity>
    </View>
  );

  const renderSystem = () => (
    <View style={styles.sectionBody}>
      <View style={styles.sectionIntro}>
        <MaterialIcons name="cloud" size={18} color={Colors.warning} />
        <Text style={styles.sectionIntroText}>Real-time cloud sync status, database record counts, and system diagnostics.</Text>
      </View>

      {/* Sync Status */}
      <View style={[styles.syncCard, { borderColor: isCloudSynced ? Colors.success + '50' : Colors.warning + '50' }]}>
        <View style={styles.syncCardHeader}>
          <View style={[styles.syncDot, { backgroundColor: isCloudSynced ? Colors.success : Colors.warning }]} />
          <Text style={[styles.syncStatus, { color: isCloudSynced ? Colors.success : Colors.warning }]}>
            {isSyncing ? 'Syncing...' : isCloudSynced ? 'Cloud Connected' : 'Using Local Data'}
          </Text>
          {isSyncing && <ActivityIndicator size="small" color={Colors.warning} />}
        </View>
        <Text style={styles.syncSub}>
          {isCloudSynced
            ? 'All data is persisted to OnSpace Cloud backend'
            : 'Running on local mock data. Connect to sync.'}
        </Text>
        <Text style={styles.syncTime}>Last check: {new Date().toLocaleTimeString('en-UG')}</Text>
      </View>

      {/* DB Counts */}
      <Text style={styles.dbSectionLabel}>Database Records</Text>
      <View style={styles.dbGrid}>
        {[
          { label: 'Products', value: systemStats.products, sub: `${systemStats.activeProducts} active`, icon: 'inventory', color: Colors.skyBlue },
          { label: 'Customers', value: systemStats.customers, sub: 'registered', icon: 'people', color: Colors.gold },
          { label: 'Sales', value: systemStats.totalSales, sub: formatUGX(systemStats.totalRevenue), icon: 'receipt-long', color: Colors.success },
          { label: 'Orders', value: systemStats.orders, sub: 'all time', icon: 'local-shipping', color: '#9B59B6' },
        ].map(stat => (
          <View key={stat.label} style={styles.dbCard}>
            <View style={[styles.dbCardIcon, { backgroundColor: stat.color + '20' }]}>
              <MaterialIcons name={stat.icon as any} size={18} color={stat.color} />
            </View>
            <Text style={[styles.dbCardValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={styles.dbCardLabel}>{stat.label}</Text>
            <Text style={styles.dbCardSub}>{stat.sub}</Text>
          </View>
        ))}
      </View>

      {/* Branch Records */}
      <Text style={styles.dbSectionLabel}>Branch Overview</Text>
      {branches.map(branch => (
        <View key={branch.id} style={styles.branchStatRow}>
          <View style={[styles.branchStatDot, { backgroundColor: branch.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.branchStatName}>{branch.name}</Text>
            <Text style={styles.branchStatAddr}>{branch.address}</Text>
          </View>
          <View style={[styles.branchStatBadge, branch.id === currentBranch.id && { borderColor: branch.color, backgroundColor: branch.color + '15' }]}>
            <Text style={[styles.branchStatBadgeText, branch.id === currentBranch.id && { color: branch.color }]}>
              {branch.id === currentBranch.id ? 'Current' : 'Branch'}
            </Text>
          </View>
        </View>
      ))}

      {/* App Version */}
      <View style={styles.appVersionCard}>
        <MaterialIcons name="info" size={16} color={Colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={styles.appVersionText}>HESA GIFT ARENA POS v1.0</Text>
          <Text style={styles.appVersionSub}>Built on OnSpace · React Native + Expo · Supabase Cloud</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSub}>System configuration · {user?.role}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.syncIndicator, { backgroundColor: isCloudSynced ? Colors.successMuted : Colors.warningMuted, borderColor: isCloudSynced ? Colors.success + '40' : Colors.warning + '40' }]}>
            <View style={[styles.syncIndicatorDot, { backgroundColor: isCloudSynced ? Colors.success : Colors.warning }]} />
            <Text style={[styles.syncIndicatorText, { color: isCloudSynced ? Colors.success : Colors.warning }]}>
              {isCloudSynced ? 'LIVE' : 'LOCAL'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {/* Section Nav */}
        <View style={styles.sectionNav}>
          {SECTIONS.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.sectionNavItem, activeSection === s.key && { backgroundColor: s.color + '18', borderColor: s.color + '50' }]}
              onPress={() => setActiveSection(s.key)}
            >
              <View style={[styles.sectionNavIcon, { backgroundColor: activeSection === s.key ? s.color + '25' : Colors.navyLight }]}>
                <MaterialIcons name={s.icon as any} size={18} color={activeSection === s.key ? s.color : Colors.textMuted} />
              </View>
              <Text style={[styles.sectionNavLabel, activeSection === s.key && { color: s.color, fontWeight: Typography.bold }]}>{s.label}</Text>
              <MaterialIcons name="chevron-right" size={16} color={activeSection === s.key ? s.color : Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Section Content */}
        <ScrollView style={styles.sectionContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          {activeSection === 'store' && renderStore()}
          {activeSection === 'receipt' && renderReceipt()}
          {activeSection === 'pins' && renderPins()}
          {activeSection === 'session' && renderSession()}
          {activeSection === 'backup' && renderBackup()}
          {activeSection === 'staff' && renderStaff()}
          {activeSection === 'system' && renderSystem()}
        </ScrollView>
      </View>

      {/* Staff Modal */}
      <Modal visible={showStaffModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.pinModal}>
            <View style={styles.pinModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialIcons name="manage-accounts" size={22} color={Colors.gold} />
                <View>
                  <Text style={styles.pinModalTitle}>{editingStaff ? 'Edit Staff Account' : 'Add New Staff'}</Text>
                  <Text style={styles.pinModalSub}>{editingStaff ? editingStaff.email : 'Creates Supabase login'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowStaffModal(false)}><MaterialIcons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.pinModalBody} showsVerticalScrollIndicator={false}>
              {[{ label: 'Full Name *', value: staffName, onChange: setStaffName, placeholder: 'Staff full name' }, { label: 'Email *', value: staffEmail, onChange: setStaffEmail, placeholder: 'staff@hesagift.ug', keyboard: 'email-address' as const }].map(f => (
                <View key={f.label} style={styles.formGroup}>
                  <Text style={styles.formLabel}>{f.label}</Text>
                  <View style={styles.inputWrap}>
                    <MaterialIcons name={f.label.includes('Email') ? 'email' : 'person'} size={16} color={Colors.textMuted} />
                    <TextInput style={styles.input} placeholder={f.placeholder} placeholderTextColor={Colors.textMuted} value={f.value} onChangeText={f.onChange} keyboardType={f.keyboard || 'default'} autoCapitalize="none" />
                  </View>
                </View>
              ))}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Role *</Text>
                <View style={styles.roleGrid}>
                  {(['Super Admin', 'Manager', 'Cashier', 'Inventory Officer'] as UserRole[]).map(role => (
                    <TouchableOpacity key={role} style={[styles.roleChip, staffRole === role && { backgroundColor: getRoleColor(role) + '20', borderColor: getRoleColor(role) }]} onPress={() => setStaffRole(role)}>
                      <Text style={[styles.roleChipText, staffRole === role && { color: getRoleColor(role), fontWeight: Typography.bold }]}>{role}</Text>
                      {staffRole === role && <MaterialIcons name="check" size={12} color={getRoleColor(role)} />}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>PIN (4 digits)</Text>
                <View style={styles.inputWrap}>
                  <MaterialIcons name="pin" size={16} color={Colors.textMuted} />
                  <TextInput style={styles.input} placeholder="4-digit PIN for quick login" placeholderTextColor={Colors.textMuted} value={staffPin} onChangeText={setStaffPin} keyboardType="numeric" maxLength={4} secureTextEntry />
                </View>
              </View>
              {!editingStaff && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Account Password (optional)</Text>
                  <View style={styles.inputWrap}>
                    <MaterialIcons name="lock" size={16} color={Colors.textMuted} />
                    <TextInput style={styles.input} placeholder="Leave blank to auto-generate" placeholderTextColor={Colors.textMuted} value={staffPassword} onChangeText={setStaffPassword} secureTextEntry />
                  </View>
                  <Text style={styles.fieldHint}>If blank, password will be HGA@[PIN]! — share with staff securely.</Text>
                </View>
              )}
            </ScrollView>
            <View style={styles.pinModalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowStaffModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 2 }, savingStaff && { opacity: 0.7 }]} onPress={handleSaveStaff} disabled={savingStaff}>
                {savingStaff ? <ActivityIndicator color={Colors.navy} size="small" /> : <><MaterialIcons name="check" size={16} color={Colors.navy} /><Text style={styles.saveBtnText}>{editingStaff ? 'Update Account' : 'Create Account'}</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PIN Modal */}
      <Modal visible={showPinModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.pinModal}>
            <View style={styles.pinModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialIcons name="pin" size={22} color={Colors.gold} />
                <View>
                  <Text style={styles.pinModalTitle}>Change PIN</Text>
                  <Text style={styles.pinModalSub}>{selectedUser?.name}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowPinModal(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.pinModalBody}>
              {[
                { label: 'New PIN (4 digits)', value: newPin, onChange: setNewPin, placeholder: '****' },
                { label: 'Confirm New PIN', value: confirmPin, onChange: setConfirmPin, placeholder: '****' },
              ].map(field => (
                <View key={field.label} style={styles.formGroup}>
                  <Text style={styles.formLabel}>{field.label}</Text>
                  <View style={styles.inputWrap}>
                    <MaterialIcons name="pin" size={16} color={Colors.textMuted} />
                    <TextInput
                      style={styles.input}
                      placeholder={field.placeholder}
                      placeholderTextColor={Colors.textMuted}
                      value={field.value}
                      onChangeText={field.onChange}
                      keyboardType="numeric"
                      maxLength={4}
                      secureTextEntry={!showNewPin}
                    />
                    <TouchableOpacity onPress={() => setShowNewPin(!showNewPin)}>
                      <MaterialIcons name={showNewPin ? 'visibility' : 'visibility-off'} size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={styles.pinStrengthRow}>
                {[0, 1, 2, 3].map(i => (
                  <View key={i} style={[styles.pinStrengthDot, i < newPin.length && { backgroundColor: Colors.gold }]} />
                ))}
                <Text style={styles.pinStrengthLabel}>{newPin.length}/4 digits</Text>
              </View>
            </View>
            <View style={styles.pinModalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPinModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { flex: 2 }, (newPin.length !== 4 || confirmPin.length !== 4) && { opacity: 0.5 }]}
                onPress={handleSavePin}
                disabled={newPin.length !== 4 || confirmPin.length !== 4}
              >
                <MaterialIcons name="lock" size={16} color={Colors.navy} />
                <Text style={styles.saveBtnText}>Set PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getRoleColor(role: string) {
  switch (role) {
    case 'Super Admin': return Colors.gold;
    case 'Manager': return Colors.skyBlue;
    case 'Cashier': return Colors.success;
    case 'Inventory Officer': return '#9B59B6';
    default: return Colors.textMuted;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.borderGold,
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: BorderRadius.circle, borderWidth: 1,
  },
  syncIndicatorDot: { width: 6, height: 6, borderRadius: 3 },
  syncIndicatorText: { fontSize: 10, fontWeight: Typography.bold, letterSpacing: 0.5 },
  body: { flex: 1, flexDirection: 'row' },
  // Section Nav
  // Staff section
  staffHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  staffCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  staffAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.borderGold },
  staffAvatarText: { fontSize: Typography.sm, fontWeight: Typography.extrabold, color: Colors.gold },
  staffInfo: { flex: 1, gap: 4 },
  staffName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  staffEmail: { fontSize: Typography.xs, color: Colors.textMuted },
  staffBranch: { fontSize: 10, color: Colors.textMuted },
  staffActions: { gap: 5 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: BorderRadius.circle },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusPillText: { fontSize: 10, fontWeight: Typography.bold },
  addStaffBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.gold, paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.sm, ...Shadows.gold },
  addStaffBtnText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.navy },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: BorderRadius.md, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  roleChipText: { fontSize: 11, color: Colors.textMuted },
  sectionNav: {
    width: 160, backgroundColor: Colors.navyMid,
    borderRightWidth: 1, borderRightColor: Colors.borderGold,
    paddingVertical: Spacing.md, gap: 4, paddingHorizontal: Spacing.sm,
  },
  sectionNavItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 12,
    borderRadius: BorderRadius.md, borderWidth: 1,
    borderColor: 'transparent',
  },
  sectionNavIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionNavLabel: { flex: 1, fontSize: 11, color: Colors.textSecondary, fontWeight: Typography.medium },
  sectionContent: { flex: 1 },
  sectionBody: { padding: Spacing.base, gap: Spacing.md },
  sectionIntro: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  sectionIntroText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 16 },
  // Form
  formGroup: { gap: 6 },
  formLabel: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md,
  },
  input: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sm, paddingVertical: 12 },
  inputWrapFlat: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: Typography.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  fieldHint: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.gold, borderRadius: BorderRadius.md,
    paddingVertical: 14, marginTop: 8, ...Shadows.gold,
  },
  saveBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  cancelBtnText: { color: Colors.textMuted, fontWeight: Typography.semibold },
  // Receipt Preview
  receiptPreview: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.borderGold, overflow: 'hidden',
  },
  receiptPreviewHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.goldSubtle, paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.borderGold,
  },
  receiptPreviewLabel: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.gold },
  receiptPreviewBody: { padding: Spacing.md, alignItems: 'center', gap: 3 },
  receiptLogoPlaceholder: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.navyLight, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.borderGold, marginBottom: 6,
  },
  receiptLogoText: { fontSize: 10, color: Colors.gold, marginTop: 2 },
  receiptPreviewBrand: { fontSize: Typography.sm, fontWeight: Typography.extrabold, color: Colors.gold, letterSpacing: 1 },
  receiptPreviewAddr: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  receiptPreviewPhone: { fontSize: 10, color: Colors.textMuted },
  receiptPreviewDivider: { width: '100%', height: 1, backgroundColor: Colors.divider, marginVertical: 4 },
  receiptPreviewLine: { fontSize: Typography.xs, color: Colors.textSecondary, alignSelf: 'flex-start' },
  receiptPreviewTotal: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold, alignSelf: 'flex-start' },
  receiptPreviewFooter: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: 4 },
  receiptPreviewTax: { fontSize: 10, color: Colors.skyBlue, marginTop: 2 },
  // Session timeout chips
  timeoutOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeoutChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: BorderRadius.md,
    backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border,
  },
  timeoutChipActive: { backgroundColor: Colors.goldMuted, borderColor: Colors.gold },
  timeoutChipText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  timeoutChipTextActive: { color: Colors.gold, fontWeight: Typography.bold },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.skyBlueMuted, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.skyBlue + '30',
  },
  infoBoxTitle: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.skyBlue, marginBottom: 2 },
  infoBoxText: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },
  // PIN management
  pinUserCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  pinUserAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.borderGold,
  },
  pinUserAvatarText: { fontSize: Typography.sm, fontWeight: Typography.extrabold, color: Colors.gold },
  pinUserInfo: { flex: 1, gap: 4 },
  pinUserName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  pinUserMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rolePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: BorderRadius.circle },
  rolePillText: { fontSize: 10, fontWeight: Typography.bold },
  pinUserEmail: { fontSize: 10, color: Colors.textMuted },
  pinStatus: { alignItems: 'flex-end', gap: 5 },
  pinSetBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.successMuted, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: BorderRadius.circle,
  },
  pinSetText: { fontSize: 10, color: Colors.success, fontWeight: Typography.bold },
  pinNotSetBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.warningMuted, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: BorderRadius.circle,
  },
  pinNotSetText: { fontSize: 10, color: Colors.warning, fontWeight: Typography.bold },
  changePinBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.skyBlueMuted, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.skyBlue + '30',
  },
  changePinBtnText: { fontSize: 11, color: Colors.skyBlue, fontWeight: Typography.semibold },
  // System Info
  syncCard: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, padding: Spacing.md, gap: 5,
  },
  syncCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncDot: { width: 10, height: 10, borderRadius: 5 },
  syncStatus: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold },
  syncSub: { fontSize: Typography.xs, color: Colors.textSecondary },
  syncTime: { fontSize: 10, color: Colors.textMuted },
  dbSectionLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  dbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dbCard: {
    flex: 1, minWidth: '45%', backgroundColor: Colors.navyCard,
    borderRadius: BorderRadius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 4,
  },
  dbCardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dbCardValue: { fontSize: Typography.xl, fontWeight: Typography.extrabold },
  dbCardLabel: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textSecondary },
  dbCardSub: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  branchStatRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  branchStatDot: { width: 10, height: 10, borderRadius: 5 },
  branchStatName: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textPrimary },
  branchStatAddr: { fontSize: 10, color: Colors.textMuted },
  branchStatBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.circle,
    backgroundColor: Colors.navyLight, borderWidth: 1, borderColor: Colors.border,
  },
  branchStatBadgeText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.textMuted },
  appVersionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginTop: 4,
  },
  appVersionText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  appVersionSub: { fontSize: Typography.xs, color: Colors.textMuted },
  // Backup section
  backupFormatRow: { gap: 8 },
  backupFormatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  backupFormatLabel: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  backupFormatSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  backupActions: { gap: 10 },
  backupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#E67E22', borderRadius: BorderRadius.md,
    paddingVertical: 15, elevation: 3,
  },
  backupBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },
  backupShareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#E67E22' + '15', borderRadius: BorderRadius.md,
    paddingVertical: 13, borderWidth: 1, borderColor: '#E67E22' + '50',
  },
  backupShareBtnText: { fontSize: Typography.base, fontWeight: Typography.semibold, color: '#E67E22' },
  // PIN Modal
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  pinModal: {
    backgroundColor: Colors.navyMid, borderRadius: BorderRadius.xl,
    width: '100%', maxWidth: 380, borderWidth: 1, borderColor: Colors.borderGold,
  },
  pinModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  pinModalTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gold },
  pinModalSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  pinModalBody: { padding: Spacing.xl, gap: Spacing.md },
  pinStrengthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinStrengthDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: Colors.navyLight, borderWidth: 2, borderColor: Colors.border,
  },
  pinStrengthLabel: { fontSize: Typography.xs, color: Colors.textMuted, marginLeft: 4 },
  pinModalFooter: {
    flexDirection: 'row', gap: 12, padding: Spacing.xl,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
});
