import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { usePOS } from '@/hooks/usePOS';
import { useAlert } from '@/template';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Customer } from '@/types';
import { fetchSMSLogs, sendBulkPromotionalSMS, SMSLog } from '@/services/smsService';

const formatUGX = (n: number) => `UGX ${n.toLocaleString()}`;

const TIER_COLORS: Record<string, string> = {
  Bronze: '#CD7F32',
  Silver: '#A8A8A8',
  Gold: '#D4AF37',
  Platinum: '#38B6FF',
};

const TIER_THRESHOLDS: Record<string, { min: number; max: number; next: string | null }> = {
  Bronze:   { min: 0,    max: 399,  next: 'Silver' },
  Silver:   { min: 400,  max: 999,  next: 'Gold' },
  Gold:     { min: 1000, max: 1999, next: 'Platinum' },
  Platinum: { min: 2000, max: 9999, next: null },
};

const TIER_ICONS: Record<string, string> = {
  Bronze: '🥉', Silver: '🥈', Gold: '🥇', Platinum: '💎',
};

export default function CustomersScreen() {
  const insets = useSafeAreaInsets();
  const { customers, addCustomer, sales } = usePOS();
  const { showAlert } = useAlert();

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [filterTier, setFilterTier] = useState<string>('all');
  const [generatingCard, setGeneratingCard] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'customers' | 'sms'>('customers');

  // SMS state
  const [smsLogs, setSmsLogs] = useState<SMSLog[]>([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignMessage, setCampaignMessage] = useState('');
  const [campaignTier, setCampaignTier] = useState<string>('all');
  const [sendingCampaign, setSendingCampaign] = useState(false);

  const loadSMSLogs = useCallback(async () => {
    setSmsLoading(true);
    try {
      const logs = await fetchSMSLogs(100);
      setSmsLogs(logs);
    } catch {}
    finally { setSmsLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'sms') loadSMSLogs();
  }, [activeTab]);

  const handleSendCampaign = async () => {
    if (!campaignMessage.trim()) { showAlert('Missing', 'Enter a campaign message.'); return; }
    const recipients = customers
      .filter(c => c.phone && (campaignTier === 'all' || c.tier === campaignTier))
      .map(c => ({ phone: c.phone, name: c.name, id: c.id }));
    if (recipients.length === 0) { showAlert('No Recipients', 'No customers match the selected tier.'); return; }
    showAlert('Send Campaign', `Send SMS to ${recipients.length} customers?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: async () => {
        setSendingCampaign(true);
        setShowCampaignModal(false);
        try {
          const result = await sendBulkPromotionalSMS({ recipients, campaignMessage });
          showAlert('Campaign Sent', `${result.sent} sent, ${result.failed} failed.`);
          loadSMSLogs();
        } catch { showAlert('Error', 'Campaign failed.'); }
        finally { setSendingCampaign(false); }
      }},
    ]);
  };

  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');

  const filteredCustomers = useMemo(() => {
    let list = customers;
    if (filterTier !== 'all') list = list.filter(c => c.tier === filterTier);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    return list;
  }, [customers, search, filterTier]);

  const handleAddCustomer = () => {
    if (!formName || !formPhone) {
      showAlert('Missing Fields', 'Name and phone number are required.');
      return;
    }
    addCustomer({
      id: `cust_${Date.now()}`,
      name: formName, phone: formPhone, email: formEmail,
      loyaltyPoints: 0, totalPurchases: 0, totalSpent: 0,
      joinDate: new Date().toISOString().slice(0, 10), tier: 'Bronze',
    });
    setFormName(''); setFormPhone(''); setFormEmail('');
    setShowModal(false);
  };

  const getCustomerSales = (customerId: string) =>
    sales.filter(s => s.customerId === customerId);

  // ─── Loyalty Card HTML Generator ──────────────────────────────────────────
  const buildLoyaltyCardHTML = (customer: Customer) => {
    const tier = customer.tier;
    const tierColor = TIER_COLORS[tier];
    const thresholds = TIER_THRESHOLDS[tier];
    const progress = thresholds.next
      ? Math.min(100, Math.round(((customer.loyaltyPoints - thresholds.min) / (thresholds.max - thresholds.min + 1)) * 100))
      : 100;
    const pointsToNext = thresholds.next
      ? Math.max(0, thresholds.max + 1 - customer.loyaltyPoints)
      : 0;

    // QR code content: customer ID + name for in-store scanning
    const qrData = encodeURIComponent(`HESA-CUST:${customer.id}:${customer.phone}`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&format=svg&data=${qrData}&bgcolor=0A1628&color=D4AF37`;

    // Gradient bars per tier
    const tierGradients: Record<string, string> = {
      Bronze:   'linear-gradient(135deg, #8B4513 0%, #CD7F32 50%, #A0522D 100%)',
      Silver:   'linear-gradient(135deg, #708090 0%, #C0C0C0 50%, #A8A8A8 100%)',
      Gold:     'linear-gradient(135deg, #B8922E 0%, #D4AF37 50%, #F5D060 100%)',
      Platinum: 'linear-gradient(135deg, #1A9FE8 0%, #38B6FF 50%, #87CEEB 100%)',
    };

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
body{font-family:'Inter',Arial,sans-serif;background:#f4f4f4;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}
.card-wrap{width:380px;position:relative;}
.card{width:380px;height:220px;border-radius:18px;background:${tierGradients[tier]};position:relative;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.4);}
.card-noise{position:absolute;inset:0;background:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");opacity:0.3;}
.card-watermark{position:absolute;right:-20px;bottom:-30px;font-size:110px;font-weight:900;color:rgba(255,255,255,0.07);letter-spacing:-4px;pointer-events:none;}
.card-content{position:relative;z-index:2;padding:22px 24px;height:100%;display:flex;flex-direction:column;justify-content:space-between;}
.card-top{display:flex;justify-content:space-between;align-items:flex-start;}
.brand-block{display:flex;flex-direction:column;gap:2px;}
.brand-name{font-size:11px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:2px;text-transform:uppercase;}
.brand-sub{font-size:9px;color:rgba(255,255,255,0.5);font-style:italic;}
.tier-badge{background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.3);border-radius:20px;padding:4px 12px;display:flex;align-items:center;gap:5px;}
.tier-label{font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;}
.card-mid{display:flex;flex-direction:column;gap:3px;}
.member-name{font-size:20px;font-weight:900;color:#fff;letter-spacing:0.5px;text-shadow:0 1px 4px rgba(0,0,0,0.2);}
.member-phone{font-size:12px;color:rgba(255,255,255,0.7);letter-spacing:0.5px;}
.card-bottom{display:flex;justify-content:space-between;align-items:flex-end;}
.points-block{}
.points-value{font-size:28px;font-weight:900;color:#fff;line-height:1;}
.points-label{font-size:9px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1px;margin-top:2px;}
.member-since{font-size:9px;color:rgba(255,255,255,0.5);text-align:right;}

/* QR + Progress below card */
.card-footer{background:#fff;border-radius:14px;padding:16px 20px;margin-top:14px;display:flex;gap:16px;align-items:flex-start;box-shadow:0 4px 16px rgba(0,0,0,0.12);}
.qr-block{display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0;}
.qr-img{width:90px;height:90px;border-radius:8px;border:2px solid ${tierColor};padding:2px;background:#0A1628;}
.qr-label{font-size:8px;color:#999;letter-spacing:0.5px;text-transform:uppercase;}
.details-block{flex:1;display:flex;flex-direction:column;gap:10px;}
.detail-section-title{font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;}
.progress-wrap{position:relative;}
.progress-bar-bg{width:100%;height:10px;background:#f0f0f0;border-radius:10px;overflow:hidden;}
.progress-bar-fill{height:100%;border-radius:10px;background:${tierGradients[tier]};width:${progress}%;}
.progress-labels{display:flex;justify-content:space-between;margin-top:5px;}
.progress-current{font-size:11px;font-weight:700;color:${tierColor};}
.progress-next{font-size:10px;color:#aaa;}
.stats-row{display:flex;gap:10px;}
.stat-chip{flex:1;background:#f8f8f8;border-radius:8px;padding:7px;text-align:center;}
.stat-chip-val{font-size:14px;font-weight:700;color:#1a1a1a;}
.stat-chip-lbl{font-size:9px;color:#aaa;text-transform:uppercase;margin-top:1px;}
${thresholds.next ? `.next-tier{background:${tierColor}15;border:1px solid ${tierColor}40;border-radius:8px;padding:7px 10px;display:flex;align-items:center;gap:6px;}.next-tier-text{font-size:11px;color:${tierColor};font-weight:600;}` : `.next-tier{background:#f0fff0;border-radius:8px;padding:7px 10px;text-align:center;}.next-tier-text{font-size:11px;color:#27ae60;font-weight:700;}`}
.hga-footer{text-align:center;margin-top:12px;font-size:10px;color:#bbb;letter-spacing:0.3px;}
</style></head><body>
<div class="card-wrap">
  <div class="card">
    <div class="card-noise"></div>
    <div class="card-watermark">HGA</div>
    <div class="card-content">
      <div class="card-top">
        <div class="brand-block">
          <div class="brand-name">Hesa Gift Arena</div>
          <div class="brand-sub">Loyalty Rewards Program</div>
        </div>
        <div class="tier-badge">
          <span style="font-size:14px">${TIER_ICONS[tier]}</span>
          <span class="tier-label">${tier}</span>
        </div>
      </div>
      <div class="card-mid">
        <div class="member-name">${customer.name}</div>
        <div class="member-phone">${customer.phone}</div>
      </div>
      <div class="card-bottom">
        <div class="points-block">
          <div class="points-value">${customer.loyaltyPoints.toLocaleString()}</div>
          <div class="points-label">Loyalty Points</div>
        </div>
        <div class="member-since">Member since<br/>${customer.joinDate}</div>
      </div>
    </div>
  </div>

  <div class="card-footer">
    <div class="qr-block">
      <img class="qr-img" src="${qrUrl}" alt="QR Code"/>
      <div class="qr-label">Scan at POS</div>
    </div>
    <div class="details-block">
      <div>
        <div class="detail-section-title">Tier Progress${thresholds.next ? ` → ${thresholds.next}` : ''}</div>
        <div class="progress-wrap">
          <div class="progress-bar-bg"><div class="progress-bar-fill"></div></div>
          <div class="progress-labels">
            <span class="progress-current">${customer.loyaltyPoints} pts</span>
            <span class="progress-next">${thresholds.next ? `${thresholds.max + 1} pts` : 'MAX TIER'}</span>
          </div>
        </div>
      </div>
      <div class="stats-row">
        <div class="stat-chip"><div class="stat-chip-val">${customer.totalPurchases}</div><div class="stat-chip-lbl">Purchases</div></div>
        <div class="stat-chip"><div class="stat-chip-val">${Math.floor(customer.totalSpent / 1000)}K</div><div class="stat-chip-lbl">UGX Spent</div></div>
      </div>
      <div class="next-tier">
        ${thresholds.next
          ? `<span style="font-size:14px">${TIER_ICONS[thresholds.next]}</span><span class="next-tier-text">${pointsToNext} pts to ${thresholds.next}</span>`
          : `<span class="next-tier-text">✦ You have reached PLATINUM — the highest tier!</span>`
        }
      </div>
    </div>
  </div>
  <div class="hga-footer">HESA GIFT ARENA · Where Every Gift Tells a Beautiful Story · hesagift.ug</div>
</div>
</body></html>`;
  };

  const handleGenerateLoyaltyCard = async (customer: Customer) => {
    setGeneratingCard(customer.id);
    try {
      const html = buildLoyaltyCardHTML(customer);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${customer.name} - Loyalty Card`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Print.printAsync({ html });
      }
    } catch {
      showAlert('Error', 'Could not generate loyalty card.');
    } finally {
      setGeneratingCard(null);
    }
  };

  const SMS_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
    receipt:     { label: 'Receipt',   color: Colors.success },
    tier_upgrade: { label: 'Tier Up',  color: Colors.gold },
    promotional: { label: 'Campaign',  color: '#9B59B6' },
    loyalty:     { label: 'Loyalty',   color: Colors.skyBlue },
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Customers</Text>
          <Text style={styles.headerSub}>{customers.length} registered · {customers.filter(c => c.tier === 'Platinum').length} Platinum</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <MaterialIcons name="person-add" size={16} color={Colors.navy} />
          <Text style={styles.addBtnText}>Add Customer</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Toggle */}
      <View style={styles.tabToggle}>
        {([{ key: 'customers', label: 'Customers', icon: 'people' }, { key: 'sms', label: 'SMS History', icon: 'message' }] as const).map(t => (
          <TouchableOpacity key={t.key} style={[styles.tabToggleBtn, activeTab === t.key && styles.tabToggleBtnActive]} onPress={() => setActiveTab(t.key)}>
            <MaterialIcons name={t.icon as any} size={14} color={activeTab === t.key ? Colors.navy : Colors.textMuted} />
            <Text style={[styles.tabToggleBtnText, activeTab === t.key && styles.tabToggleBtnTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* SMS History Tab */}
      {activeTab === 'sms' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.smsHeaderRow}>
            <Text style={styles.smsHeaderTitle}>{smsLogs.length} Messages Sent</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.campaignBtn} onPress={() => setShowCampaignModal(true)} disabled={sendingCampaign}>
                {sendingCampaign ? <ActivityIndicator size="small" color={Colors.navy} /> : <MaterialIcons name="send" size={14} color={Colors.navy} />}
                <Text style={styles.campaignBtnText}>{sendingCampaign ? 'Sending...' : 'Campaign'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smsRefreshBtn} onPress={loadSMSLogs} disabled={smsLoading}>
                {smsLoading ? <ActivityIndicator size="small" color={Colors.gold} /> : <MaterialIcons name="refresh" size={18} color={Colors.gold} />}
              </TouchableOpacity>
            </View>
          </View>
          {smsLoading ? (
            <View style={styles.smsLoading}><ActivityIndicator color={Colors.gold} size="large" /></View>
          ) : smsLogs.length === 0 ? (
            <View style={styles.smsEmpty}>
              <MaterialIcons name="message" size={56} color={Colors.textMuted} />
              <Text style={styles.smsEmptyText}>No SMS messages yet</Text>
              <Text style={styles.smsEmptySub}>Messages will appear here after purchases and tier upgrades</Text>
            </View>
          ) : (
            <FlatList
              data={smsLogs}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.smsList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const typeCfg = SMS_TYPE_CONFIG[item.message_type] || { label: item.message_type, color: Colors.textMuted };
                const isSuccess = item.status === 'sent';
                return (
                  <View style={styles.smsLogRow}>
                    <View style={[styles.smsLogIcon, { backgroundColor: typeCfg.color + '18' }]}>
                      <MaterialIcons name={item.message_type === 'receipt' ? 'receipt' : item.message_type === 'tier_upgrade' ? 'star' : 'campaign'} size={16} color={typeCfg.color} />
                    </View>
                    <View style={styles.smsLogBody}>
                      <View style={styles.smsLogTopRow}>
                        <View style={[styles.smsTypePill, { backgroundColor: typeCfg.color + '18' }]}>
                          <Text style={[styles.smsTypeText, { color: typeCfg.color }]}>{typeCfg.label}</Text>
                        </View>
                        <View style={[styles.smsStatusPill, { backgroundColor: isSuccess ? Colors.successMuted : Colors.dangerMuted }]}>
                          <View style={[{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: isSuccess ? Colors.success : Colors.danger }]} />
                          <Text style={[styles.smsStatusText, { color: isSuccess ? Colors.success : Colors.danger }]}>{item.status}</Text>
                        </View>
                        <Text style={styles.smsLogTime}>{new Date(item.sent_at).toLocaleString('en-UG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      {item.customer_name ? <Text style={styles.smsLogCustomer}>{item.customer_name}</Text> : null}
                      <Text style={styles.smsLogPhone}>{item.phone}</Text>
                      <Text style={styles.smsLogMsg} numberOfLines={2}>{item.message}</Text>
                      {item.cost ? <Text style={styles.smsLogCost}>Cost: {item.cost}</Text> : null}
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Campaign Modal */}
          <Modal visible={showCampaignModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.modal}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Send Promotional Campaign</Text>
                  <TouchableOpacity onPress={() => setShowCampaignModal(false)}><MaterialIcons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={styles.modalBody}>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Target Tier</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {['all', 'Platinum', 'Gold', 'Silver', 'Bronze'].map(tier => (
                        <TouchableOpacity
                          key={tier}
                          style={[styles.campaignTierChip, campaignTier === tier && { backgroundColor: Colors.gold + '20', borderColor: Colors.gold }]}
                          onPress={() => setCampaignTier(tier)}
                        >
                          {tier !== 'all' && <Text>{TIER_ICONS[tier]}</Text>}
                          <Text style={[styles.campaignTierText, campaignTier === tier && { color: Colors.gold, fontWeight: Typography.bold }]}>{tier === 'all' ? 'All Tiers' : tier}</Text>
                          {campaignTier === tier && <MaterialIcons name="check" size={12} color={Colors.gold} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.campaignRecipientCount}>
                      {customers.filter(c => campaignTier === 'all' || c.tier === campaignTier).length} recipients selected
                    </Text>
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Message * (use {'{name}'} for personalisation)</Text>
                    <TextInput
                      style={[styles.formInput, { height: 100, textAlignVertical: 'top' }]}
                      placeholder="Hi {name}, HESA GIFT ARENA has a special offer just for you! Visit us today..."
                      placeholderTextColor={Colors.textMuted}
                      value={campaignMessage}
                      onChangeText={setCampaignMessage}
                      multiline
                    />
                    <Text style={styles.campaignCharCount}>{campaignMessage.length} chars</Text>
                  </View>
                </ScrollView>
                <View style={styles.modalFooter}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCampaignModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.saveBtn, !campaignMessage.trim() && { opacity: 0.5 }]} onPress={handleSendCampaign} disabled={!campaignMessage.trim()}>
                    <MaterialIcons name="send" size={16} color={Colors.navy} />
                    <Text style={styles.saveBtnText}>Send Campaign</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      ) : (
        <>
      {/* Search */}
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialIcons name="close" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tier Filter */}
      <View style={styles.tierWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tierRow}>
          {['all', 'Platinum', 'Gold', 'Silver', 'Bronze'].map(tier => (
            <TouchableOpacity
              key={tier}
              style={[styles.tierChip, filterTier === tier && {
                backgroundColor: tier === 'all' ? Colors.goldMuted : TIER_COLORS[tier] + '20',
                borderColor: tier === 'all' ? Colors.gold : TIER_COLORS[tier],
              }]}
              onPress={() => setFilterTier(tier)}
            >
              {tier !== 'all' && <Text>{TIER_ICONS[tier]}</Text>}
              <Text style={[styles.tierChipText, filterTier === tier && {
                color: tier === 'all' ? Colors.gold : TIER_COLORS[tier],
                fontWeight: Typography.bold,
              }]}>
                {tier === 'all' ? 'All Tiers' : tier}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsRow}>
        {[
          { tier: 'Platinum', count: customers.filter(c => c.tier === 'Platinum').length, color: Colors.skyBlue },
          { tier: 'Gold',     count: customers.filter(c => c.tier === 'Gold').length,     color: Colors.gold },
          { tier: 'Silver',   count: customers.filter(c => c.tier === 'Silver').length,   color: '#A8A8A8' },
          { tier: 'Bronze',   count: customers.filter(c => c.tier === 'Bronze').length,   color: '#CD7F32' },
        ].map(s => (
          <View key={s.tier} style={[styles.statCard, { borderColor: s.color + '40' }]}>
            <Text style={styles.statIcon}>{TIER_ICONS[s.tier]}</Text>
            <Text style={[styles.statCount, { color: s.color }]}>{s.count}</Text>
            <Text style={styles.statLabel}>{s.tier}</Text>
          </View>
        ))}
      </View>

      {/* Customer List */}
      <FlatList
        data={filteredCustomers}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No customers found</Text>
          </View>
        }
        renderItem={({ item }) => {
          const thresholds = TIER_THRESHOLDS[item.tier];
          const progress = thresholds.next
            ? Math.min(100, Math.round(((item.loyaltyPoints - thresholds.min) / (thresholds.max - thresholds.min + 1)) * 100))
            : 100;
          const isGenerating = generatingCard === item.id;

          return (
            <TouchableOpacity style={styles.customerCard} onPress={() => setSelectedCustomer(item)}>
              <View style={[styles.avatar, { backgroundColor: TIER_COLORS[item.tier] + '20', borderColor: TIER_COLORS[item.tier] + '50' }]}>
                <Text style={[styles.avatarText, { color: TIER_COLORS[item.tier] }]}>
                  {item.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={styles.customerInfo}>
                <View style={styles.customerTopRow}>
                  <Text style={styles.customerName} numberOfLines={1}>{item.name}</Text>
                  <View style={[styles.tierBadge, { backgroundColor: TIER_COLORS[item.tier] + '20' }]}>
                    <Text style={styles.tierIcon}>{TIER_ICONS[item.tier]}</Text>
                    <Text style={[styles.tierBadgeText, { color: TIER_COLORS[item.tier] }]}>{item.tier}</Text>
                  </View>
                </View>
                <Text style={styles.customerPhone}>{item.phone}</Text>
                <View style={styles.customerStats}>
                  <MaterialIcons name="star" size={11} color={Colors.gold} />
                  <Text style={[styles.customerStat, { color: Colors.gold }]}>{item.loyaltyPoints} pts</Text>
                  <Text style={styles.customerStatDot}>·</Text>
                  <Text style={styles.customerStat}>{item.totalPurchases} purchases</Text>
                  <Text style={styles.customerStatDot}>·</Text>
                  <Text style={styles.customerStat}>{formatUGX(item.totalSpent)}</Text>
                </View>
                {/* Progress bar */}
                {thresholds.next ? (
                  <View style={styles.progressWrap}>
                    <View style={styles.progressBg}>
                      <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: TIER_COLORS[item.tier] }]} />
                    </View>
                    <Text style={styles.progressLabel}>
                      {Math.max(0, thresholds.max + 1 - item.loyaltyPoints)} pts to {thresholds.next}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.maxTierBadge}>
                    <Text style={styles.maxTierText}>✦ Max Tier Reached</Text>
                  </View>
                )}
              </View>
              {/* Card Action */}
              <TouchableOpacity
                style={styles.cardBtn}
                onPress={(e) => { e.stopPropagation(); handleGenerateLoyaltyCard(item); }}
                disabled={isGenerating}
              >
                {isGenerating
                  ? <ActivityIndicator size="small" color={Colors.gold} />
                  : <MaterialIcons name="credit-card" size={18} color={Colors.gold} />
                }
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />

      </>
      )}

      {/* Add Customer Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register New Customer</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              {[
                { label: 'Full Name *', value: formName, onChange: setFormName, placeholder: 'Customer full name' },
                { label: 'Phone Number *', value: formPhone, onChange: setFormPhone, placeholder: '+256 7XX XXX XXX', keyboard: 'phone-pad' as const },
                { label: 'Email Address', value: formEmail, onChange: setFormEmail, placeholder: 'email@example.com', keyboard: 'email-address' as const },
              ].map(field => (
                <View key={field.label} style={styles.formGroup}>
                  <Text style={styles.formLabel}>{field.label}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={field.placeholder}
                    placeholderTextColor={Colors.textMuted}
                    value={field.value}
                    onChangeText={field.onChange}
                    keyboardType={field.keyboard || 'default'}
                  />
                </View>
              ))}
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddCustomer}>
                <MaterialIcons name="person-add" size={16} color={Colors.navy} />
                <Text style={styles.saveBtnText}>Register</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Customer Detail Modal */}
      <Modal visible={!!selectedCustomer} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            {selectedCustomer && (() => {
              const thresholds = TIER_THRESHOLDS[selectedCustomer.tier];
              const progress = thresholds.next
                ? Math.min(100, Math.round(((selectedCustomer.loyaltyPoints - thresholds.min) / (thresholds.max - thresholds.min + 1)) * 100))
                : 100;
              return (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Customer Profile</Text>
                    <TouchableOpacity onPress={() => setSelectedCustomer(null)}>
                      <MaterialIcons name="close" size={20} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView contentContainerStyle={styles.profileBody} showsVerticalScrollIndicator={false}>
                    <View style={styles.profileAvatar}>
                      <View style={[styles.avatarLarge, { backgroundColor: TIER_COLORS[selectedCustomer.tier] + '20', borderColor: TIER_COLORS[selectedCustomer.tier] + '60', borderWidth: 2 }]}>
                        <Text style={[styles.avatarLargeText, { color: TIER_COLORS[selectedCustomer.tier] }]}>
                          {selectedCustomer.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.profileName}>{selectedCustomer.name}</Text>
                      <View style={[styles.tierBadge, { backgroundColor: TIER_COLORS[selectedCustomer.tier] + '20' }]}>
                        <Text style={styles.tierIcon}>{TIER_ICONS[selectedCustomer.tier]}</Text>
                        <Text style={[styles.tierBadgeText, { color: TIER_COLORS[selectedCustomer.tier] }]}>
                          {selectedCustomer.tier} Member
                        </Text>
                      </View>
                    </View>

                    {/* Loyalty Card CTA */}
                    <TouchableOpacity
                      style={styles.loyaltyCardCTA}
                      onPress={() => handleGenerateLoyaltyCard(selectedCustomer)}
                      disabled={generatingCard === selectedCustomer.id}
                    >
                      {generatingCard === selectedCustomer.id ? (
                        <ActivityIndicator color={Colors.navy} size="small" />
                      ) : (
                        <MaterialIcons name="credit-card" size={18} color={Colors.navy} />
                      )}
                      <Text style={styles.loyaltyCardCTAText}>
                        {generatingCard === selectedCustomer.id ? 'Generating...' : 'Print / Share Loyalty Card'}
                      </Text>
                    </TouchableOpacity>

                    {/* Tier Progress */}
                    <View style={styles.tierProgressCard}>
                      <View style={styles.tierProgressHeader}>
                        <Text style={styles.tierProgressTitle}>Tier Progress</Text>
                        {thresholds.next ? (
                          <Text style={[styles.tierProgressNext, { color: TIER_COLORS[thresholds.next] }]}>
                            → {TIER_ICONS[thresholds.next]} {thresholds.next}
                          </Text>
                        ) : (
                          <Text style={[styles.tierProgressNext, { color: Colors.gold }]}>✦ Max Tier</Text>
                        )}
                      </View>
                      <View style={styles.progressBg}>
                        <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: TIER_COLORS[selectedCustomer.tier] }]} />
                      </View>
                      <View style={styles.tierProgressLabels}>
                        <Text style={[styles.tierProgressPts, { color: TIER_COLORS[selectedCustomer.tier] }]}>
                          {selectedCustomer.loyaltyPoints} pts
                        </Text>
                        {thresholds.next ? (
                          <Text style={styles.tierProgressRemaining}>
                            {Math.max(0, thresholds.max + 1 - selectedCustomer.loyaltyPoints)} pts to {thresholds.next}
                          </Text>
                        ) : (
                          <Text style={[styles.tierProgressRemaining, { color: Colors.gold }]}>Highest tier!</Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.profileStats}>
                      {[
                        { label: 'Loyalty Points', value: `${selectedCustomer.loyaltyPoints} pts`, color: Colors.gold },
                        { label: 'Total Purchases', value: `${selectedCustomer.totalPurchases}`, color: Colors.skyBlue },
                        { label: 'Total Spent', value: formatUGX(selectedCustomer.totalSpent), color: Colors.success },
                        { label: 'Member Since', value: selectedCustomer.joinDate, color: Colors.textSecondary },
                      ].map(s => (
                        <View key={s.label} style={styles.profileStatCard}>
                          <Text style={[styles.profileStatValue, { color: s.color }]}>{s.value}</Text>
                          <Text style={styles.profileStatLabel}>{s.label}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.contactInfo}>
                      <View style={styles.contactRow}>
                        <MaterialIcons name="phone" size={16} color={Colors.textMuted} />
                        <Text style={styles.contactText}>{selectedCustomer.phone}</Text>
                      </View>
                      {selectedCustomer.email ? (
                        <View style={styles.contactRow}>
                          <MaterialIcons name="email" size={16} color={Colors.textMuted} />
                          <Text style={styles.contactText}>{selectedCustomer.email}</Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={styles.sectionTitle}>Recent Purchases</Text>
                    {getCustomerSales(selectedCustomer.id).length === 0 ? (
                      <Text style={styles.noSalesText}>No purchases recorded yet</Text>
                    ) : (
                      getCustomerSales(selectedCustomer.id).slice(0, 5).map(sale => (
                        <View key={sale.id} style={styles.saleRow}>
                          <View>
                            <Text style={styles.saleReceiptNo}>{sale.receiptNo}</Text>
                            <Text style={styles.saleDate}>{new Date(sale.timestamp).toLocaleDateString()}</Text>
                          </View>
                          <Text style={styles.saleTotal}>{formatUGX(sale.total)}</Text>
                        </View>
                      ))
                    )}
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy },
  tabToggle: { flexDirection: 'row', margin: Spacing.md, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border },
  tabToggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: BorderRadius.md },
  tabToggleBtnActive: { backgroundColor: Colors.gold },
  tabToggleBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  tabToggleBtnTextActive: { color: Colors.navy, fontWeight: Typography.bold },
  // SMS History
  smsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },
  smsHeaderTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  campaignBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.gold, paddingHorizontal: 10, paddingVertical: 7, borderRadius: BorderRadius.md, ...Shadows.gold },
  campaignBtnText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.navy },
  smsRefreshBtn: { padding: 6, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border },
  smsLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  smsEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  smsEmptyText: { fontSize: Typography.base, color: Colors.textMuted, fontWeight: Typography.semibold },
  smsEmptySub: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },
  smsList: { paddingHorizontal: Spacing.base, paddingBottom: 100, gap: 8 },
  smsLogRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  smsLogIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  smsLogBody: { flex: 1, gap: 3 },
  smsLogTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  smsTypePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: BorderRadius.circle },
  smsTypeText: { fontSize: 10, fontWeight: Typography.bold },
  smsStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.circle },
  smsStatusText: { fontSize: 10, fontWeight: Typography.bold },
  smsLogTime: { fontSize: 10, color: Colors.textMuted, marginLeft: 'auto' as any },
  smsLogCustomer: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textPrimary },
  smsLogPhone: { fontSize: Typography.xs, color: Colors.textMuted },
  smsLogMsg: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 16 },
  smsLogCost: { fontSize: 10, color: Colors.skyBlue },
  // Campaign Modal
  campaignTierChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: BorderRadius.md, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  campaignTierText: { fontSize: 11, color: Colors.textMuted },
  campaignRecipientCount: { fontSize: Typography.xs, color: Colors.skyBlue, marginTop: 4 },
  campaignCharCount: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.borderGold,
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.gold, paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: BorderRadius.md, ...Shadows.gold,
  },
  addBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.navy },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: Spacing.base, marginVertical: Spacing.md,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sm, paddingVertical: 10 },
  tierWrap: { height: 44 },
  tierRow: { paddingHorizontal: Spacing.base, paddingVertical: 4, gap: 8, alignItems: 'center' },
  tierChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.circle,
    backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border,
  },
  tierIcon: { fontSize: 12 },
  tierChipText: { fontSize: 12, color: Colors.textMuted, fontWeight: Typography.medium },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  statCard: {
    flex: 1, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    padding: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: 2,
  },
  statIcon: { fontSize: 16 },
  statCount: { fontSize: Typography.xl, fontWeight: Typography.extrabold },
  statLabel: { fontSize: 9, color: Colors.textMuted },
  list: { paddingHorizontal: Spacing.base, paddingBottom: 100, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { color: Colors.textMuted, fontSize: Typography.base },
  customerCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadows.sm,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0,
  },
  avatarText: { fontSize: Typography.base, fontWeight: Typography.extrabold },
  customerInfo: { flex: 1, gap: 4 },
  customerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customerName: { flex: 1, fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.circle },
  tierBadgeText: { fontSize: 10, fontWeight: Typography.bold },
  customerPhone: { fontSize: Typography.sm, color: Colors.textMuted },
  customerStats: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  customerStat: { fontSize: Typography.xs, color: Colors.textSecondary },
  customerStatDot: { fontSize: Typography.xs, color: Colors.textMuted },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  progressBg: { flex: 1, height: 5, backgroundColor: Colors.navyLight, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  progressLabel: { fontSize: 9, color: Colors.textMuted, flexShrink: 0 },
  maxTierBadge: { backgroundColor: Colors.goldSubtle, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 2 },
  maxTierText: { fontSize: 9, color: Colors.gold, fontWeight: Typography.bold },
  cardBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.goldSubtle, borderWidth: 1, borderColor: Colors.borderGold,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'center',
  },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modal: {
    backgroundColor: Colors.navyMid, borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl, maxHeight: '90%',
    borderTopWidth: 2, borderColor: Colors.borderGold,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  modalTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gold },
  modalBody: { padding: Spacing.xl, gap: Spacing.md },
  formGroup: { gap: 6 },
  formLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  formInput: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: Typography.base,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  modalFooter: {
    flexDirection: 'row', gap: 12, padding: Spacing.xl,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  cancelBtnText: { color: Colors.textMuted, fontWeight: Typography.semibold },
  saveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: BorderRadius.md,
    backgroundColor: Colors.gold, ...Shadows.gold,
  },
  saveBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  // Profile detail
  profileBody: { padding: Spacing.xl, gap: Spacing.md, paddingBottom: 40 },
  profileAvatar: { alignItems: 'center', gap: 8, marginBottom: 4 },
  avatarLarge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarLargeText: { fontSize: 28, fontWeight: Typography.extrabold },
  profileName: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  // Loyalty card CTA
  loyaltyCardCTA: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.gold, borderRadius: BorderRadius.md, paddingVertical: 13,
    ...Shadows.gold,
  },
  loyaltyCardCTAText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  // Tier progress card
  tierProgressCard: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 8,
  },
  tierProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierProgressTitle: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  tierProgressNext: { fontSize: Typography.xs, fontWeight: Typography.bold },
  tierProgressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tierProgressPts: { fontSize: Typography.sm, fontWeight: Typography.bold },
  tierProgressRemaining: { fontSize: Typography.xs, color: Colors.textMuted },
  profileStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  profileStatCard: {
    flex: 1, minWidth: '44%', backgroundColor: Colors.navyCard,
    borderRadius: BorderRadius.md, padding: Spacing.md, gap: 4,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  profileStatValue: { fontSize: Typography.base, fontWeight: Typography.bold },
  profileStatLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  contactInfo: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 8,
  },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactText: { fontSize: Typography.sm, color: Colors.textSecondary },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  noSalesText: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', padding: 16 },
  saleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.sm,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  saleReceiptNo: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textPrimary },
  saleDate: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  saleTotal: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
});
