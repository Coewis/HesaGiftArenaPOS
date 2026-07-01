import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Modal, ScrollView, Dimensions, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { usePOS } from '@/hooks/usePOS';
import { useAuth } from '@/hooks/useAuth';
import { useAlert } from '@/template';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Product, ProductBundle, BundleComponent } from '@/types';
import { MOCK_CATEGORIES } from '@/constants/mockData';

const { width } = Dimensions.get('window');
const formatUGX = (n: number) => `UGX ${n.toLocaleString()}`;

type TabMode = 'products' | 'bundles';

export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const { products, categories, updateProduct, deleteProduct, addProduct, getLowStockProducts, uploadProductImage, bundles, addBundle, updateBundle, deleteBundle } = usePOS();
  const { hasPermission } = useAuth();
  const { showAlert } = useAlert();

  const [tabMode, setTabMode] = useState<TabMode>('products');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('cat_all');
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'low' | 'inactive'>('all');

  // Product form state
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formBuyingPrice, setFormBuyingPrice] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formMinStock, setFormMinStock] = useState('');
  const [formCategory, setFormCategory] = useState('cat_bouquets');
  const [formDescription, setFormDescription] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Bundle state
  const [showBundleModal, setShowBundleModal] = useState(false);
  const [editBundle, setEditBundle] = useState<ProductBundle | null>(null);
  const [bundleName, setBundleName] = useState('');
  const [bundleDescription, setBundleDescription] = useState('');
  const [bundlePrice, setBundlePrice] = useState('');
  const [bundleComponents, setBundleComponents] = useState<BundleComponent[]>([]);
  const [bundleImageUrl, setBundleImageUrl] = useState('');
  const [showComponentPicker, setShowComponentPicker] = useState(false);
  const [componentSearch, setComponentSearch] = useState('');

  const lowStockProducts = useMemo(() => getLowStockProducts(), [products]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (filterStatus === 'low') list = lowStockProducts;
    else if (filterStatus === 'inactive') list = products.filter(p => p.status === 'archived');
    else list = products.filter(p => p.status === 'active');
    if (activeCategory !== 'cat_all') list = list.filter(p => p.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q));
    }
    return list;
  }, [products, search, activeCategory, filterStatus, lowStockProducts]);

  const filteredBundles = useMemo(() => {
    const active = bundles.filter(b => b.status === 'active');
    if (!search.trim()) return active;
    return active.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));
  }, [bundles, search]);

  const bundleOriginalPrice = useMemo(() =>
    bundleComponents.reduce((sum, c) => {
      const p = products.find(prod => prod.id === c.productId);
      return sum + (p ? p.price * c.qty : 0);
    }, 0), [bundleComponents, products]);

  const bundleDiscount = bundlePrice && bundleOriginalPrice > 0
    ? Math.round((1 - parseFloat(bundlePrice) / bundleOriginalPrice) * 100)
    : 0;

  const openAddModal = () => {
    setEditProduct(null);
    setFormName(''); setFormPrice(''); setFormBuyingPrice('');
    setFormStock(''); setFormMinStock('5'); setFormCategory('cat_bouquets');
    setFormDescription(''); setFormSupplier(''); setFormBarcode(''); setFormImageUrl('');
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditProduct(product);
    setFormName(product.name); setFormPrice(String(product.price));
    setFormBuyingPrice(String(product.buyingPrice)); setFormStock(String(product.stock));
    setFormMinStock(String(product.minStock)); setFormCategory(product.category);
    setFormDescription(product.description); setFormSupplier(product.supplier);
    setFormBarcode(product.barcode); setFormImageUrl(product.imageUrl);
    setShowModal(true);
  };

  const openAddBundleModal = () => {
    setEditBundle(null);
    setBundleName(''); setBundleDescription(''); setBundlePrice('');
    setBundleComponents([]); setBundleImageUrl('');
    setShowBundleModal(true);
  };

  const openEditBundleModal = (bundle: ProductBundle) => {
    setEditBundle(bundle);
    setBundleName(bundle.name); setBundleDescription(bundle.description);
    setBundlePrice(String(bundle.bundlePrice)); setBundleComponents([...bundle.components]);
    setBundleImageUrl(bundle.imageUrl);
    setShowBundleModal(true);
  };

  const handlePickImage = () => {
    showAlert('Product Image', 'Choose image source', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Camera', onPress: () => pickImage('camera') },
      { text: 'Gallery', onPress: () => pickImage('gallery') },
    ]);
  };

  const pickImage = async (source: 'camera' | 'gallery') => {
    try {
      let result: ImagePicker.ImagePickerResult;
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [4, 3], quality: 0.8, base64: true,
      };
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { showAlert('Permission Denied', 'Camera permission is required.'); return; }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { showAlert('Permission Denied', 'Gallery permission is required.'); return; }
        result = await ImagePicker.launchImageLibraryAsync(options);
      }
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.base64) {
        setUploadingImage(true);
        try {
          const productId = editProduct?.id || `prod_${Date.now()}`;
          const publicUrl = await uploadProductImage(productId, asset.base64, asset.mimeType || 'image/jpeg');
          setFormImageUrl(publicUrl);
        } catch {
          setFormImageUrl(asset.uri);
          showAlert('Upload Notice', 'Image saved locally. Will sync when online.');
        } finally { setUploadingImage(false); }
      } else { setFormImageUrl(asset.uri); }
    } catch { showAlert('Error', 'Could not pick image.'); }
  };

  const handleSaveProduct = () => {
    if (!formName || !formPrice || !formStock) {
      showAlert('Missing Fields', 'Name, price, and stock are required.'); return;
    }
    const productId = editProduct?.id || `prod_${Date.now()}`;
    const imageUrl = formImageUrl || (editProduct?.imageUrl || 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400');
    if (editProduct) {
      updateProduct({ ...editProduct, name: formName, price: parseFloat(formPrice), buyingPrice: parseFloat(formBuyingPrice) || 0, stock: parseInt(formStock), minStock: parseInt(formMinStock) || 5, category: formCategory, description: formDescription, supplier: formSupplier, barcode: formBarcode, imageUrl });
    } else {
      addProduct({ id: productId, barcode: formBarcode || `HGA${Date.now().toString().slice(-4)}`, name: formName, price: parseFloat(formPrice), buyingPrice: parseFloat(formBuyingPrice) || 0, stock: parseInt(formStock), minStock: parseInt(formMinStock) || 5, category: formCategory, description: formDescription, supplier: formSupplier, status: 'active', imageUrl });
    }
    setShowModal(false);
  };

  const handleSaveBundle = () => {
    if (!bundleName.trim() || !bundlePrice || bundleComponents.length < 2) {
      showAlert('Incomplete Bundle', 'Bundle needs a name, price, and at least 2 products.'); return;
    }
    const bp = parseFloat(bundlePrice);
    const bundle: ProductBundle = {
      id: editBundle?.id || `bundle_${Date.now()}`,
      name: bundleName.trim(), description: bundleDescription.trim(),
      imageUrl: bundleImageUrl || (bundleComponents[0] ? (products.find(p => p.id === bundleComponents[0]?.productId)?.imageUrl || '') : ''),
      bundlePrice: bp, originalPrice: bundleOriginalPrice,
      discountPct: bundleDiscount,
      components: bundleComponents, status: 'active',
    };
    if (editBundle) updateBundle(bundle);
    else addBundle(bundle);
    setShowBundleModal(false);
    showAlert('Bundle Saved', `"${bundle.name}" gift bundle is now available in POS.`);
  };

  const handleDeleteProduct = (product: Product) => {
    showAlert('Archive Product', `Archive "${product.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => deleteProduct(product.id) },
    ]);
  };

  const handleDeleteBundle = (bundle: ProductBundle) => {
    showAlert('Remove Bundle', `Remove bundle "${bundle.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteBundle(bundle.id) },
    ]);
  };

  const addComponentToBundle = (product: Product) => {
    const exists = bundleComponents.find(c => c.productId === product.id);
    if (exists) {
      setBundleComponents(prev => prev.map(c => c.productId === product.id ? { ...c, qty: c.qty + 1 } : c));
    } else {
      setBundleComponents(prev => [...prev, { productId: product.id, productName: product.name, qty: 1, unitPrice: product.price }]);
    }
  };

  const removeComponentFromBundle = (productId: string) => {
    setBundleComponents(prev => prev.filter(c => c.productId !== productId));
  };

  const updateComponentQty = (productId: string, qty: number) => {
    if (qty <= 0) { removeComponentFromBundle(productId); return; }
    setBundleComponents(prev => prev.map(c => c.productId === productId ? { ...c, qty } : c));
  };

  const getCategoryName = (catId: string) => MOCK_CATEGORIES.find(c => c.id === catId)?.name || catId;

  // ─── Enhanced Sticker with QR Code ───────────────────────────────────────
  const buildStickerHTML = (product: Product) => {
    const qrData = encodeURIComponent(product.barcode);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&format=svg&data=${qrData}&bgcolor=ffffff&color=0A1628&margin=2`;
    const isDiscounted = (product.discount || 0) > 0;
    const discountedPrice = isDiscounted
      ? Math.round(product.price * (1 - (product.discount || 0) / 100))
      : product.price;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial,sans-serif;padding:10px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;}
.sticker{width:280px;background:#fff;border:2px solid #D4AF37;border-radius:10px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.12);}
.sticker-header{background:linear-gradient(135deg,#0A1628 0%,#1A3055 100%);padding:10px 12px;display:flex;justify-content:space-between;align-items:center;}
.brand{font-size:11px;font-weight:900;color:#D4AF37;letter-spacing:1.5px;}
.sticker-type{font-size:8px;color:rgba(255,255,255,0.5);letter-spacing:0.5px;}
.sticker-body{padding:12px;}
.product-name{font-size:15px;font-weight:bold;color:#0A1628;margin-bottom:3px;line-height:1.3;}
.category{font-size:10px;color:#888;margin-bottom:8px;}
.price-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
.price{font-size:20px;font-weight:900;color:#B8922E;}
${isDiscounted ? `.original-price{font-size:12px;color:#aaa;text-decoration:line-through;}.discount-badge{background:#27ae60;color:#fff;font-size:9px;font-weight:bold;padding:2px 6px;border-radius:10px;}` : ''}
.divider{border:none;border-top:1px dashed #ddd;margin:8px 0;}
.bottom-row{display:flex;align-items:flex-start;gap:10px;}
.qr-wrap{display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;}
.qr-img{width:80px;height:80px;border:1.5px solid #D4AF37;border-radius:4px;padding:2px;}
.qr-label{font-size:7px;color:#aaa;letter-spacing:0.3px;}
.barcode-block{flex:1;}
.sku-label{font-size:8px;color:#aaa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;}
.sku-val{font-size:12px;font-family:'Courier New',monospace;color:#333;font-weight:bold;word-break:break-all;}
.barcode-lines{font-family:'Courier New',monospace;font-size:32px;letter-spacing:2px;color:#0A1628;line-height:1;margin:4px 0;}
.meta{font-size:9px;color:#bbb;margin-top:6px;}
</style></head><body>
<div class="sticker">
  <div class="sticker-header">
    <div><div class="brand">HESA GIFT ARENA</div><div class="sticker-type">Product Label</div></div>
    <div style="width:6px;height:6px;border-radius:3px;background:#D4AF37;"></div>
  </div>
  <div class="sticker-body">
    <div class="product-name">${product.name}</div>
    <div class="category">${getCategoryName(product.category)}</div>
    <div class="price-row">
      <div class="price">UGX ${discountedPrice.toLocaleString()}</div>
      ${isDiscounted ? `<div class="original-price">UGX ${product.price.toLocaleString()}</div><div class="discount-badge">${product.discount}% OFF</div>` : ''}
    </div>
    <hr class="divider"/>
    <div class="bottom-row">
      <div class="qr-wrap">
        <img class="qr-img" src="${qrUrl}" alt="QR" onerror="this.style.display='none'"/>
        <div class="qr-label">Scan to find</div>
      </div>
      <div class="barcode-block">
        <div class="sku-label">Barcode / SKU</div>
        <div class="sku-val">${product.barcode}</div>
        <div class="barcode-lines">|||${product.barcode}|||</div>
        <div class="meta">Stock: ${product.stock} units · Min: ${product.minStock}</div>
      </div>
    </div>
  </div>
</div>
</body></html>`;
  };

  const handlePrintSticker = async (product: Product) => {
    try { await Print.printAsync({ html: buildStickerHTML(product) }); }
    catch { showAlert('Print Error', 'Could not print sticker.'); }
  };

  const handleShareSticker = async (product: Product) => {
    try {
      const { uri } = await Print.printToFileAsync({ html: buildStickerHTML(product) });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Label - ${product.name}` });
    } catch { showAlert('Error', 'Could not generate sticker PDF.'); }
  };

  const componentFilteredProducts = useMemo(() => {
    const active = products.filter(p => p.status === 'active');
    if (!componentSearch.trim()) return active;
    return active.filter(p => p.name.toLowerCase().includes(componentSearch.toLowerCase()));
  }, [products, componentSearch]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Products</Text>
          <Text style={styles.headerSub}>{products.filter(p => p.status === 'active').length} active · {lowStockProducts.length} low stock · {bundles.filter(b => b.status === 'active').length} bundles</Text>
        </View>
        <View style={styles.headerBtns}>
          {tabMode === 'products' && hasPermission('products') && (
            <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
              <MaterialIcons name="add" size={18} color={Colors.navy} />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
          {tabMode === 'bundles' && hasPermission('products') && (
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#9B59B6' }]} onPress={openAddBundleModal}>
              <MaterialIcons name="add" size={18} color={Colors.textPrimary} />
              <Text style={[styles.addBtnText, { color: Colors.textPrimary }]}>Bundle</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab Toggle */}
      <View style={styles.tabToggle}>
        <TouchableOpacity
          style={[styles.tabBtn, tabMode === 'products' && styles.tabBtnActive]}
          onPress={() => setTabMode('products')}
        >
          <MaterialIcons name="inventory" size={14} color={tabMode === 'products' ? Colors.navy : Colors.textMuted} />
          <Text style={[styles.tabBtnText, tabMode === 'products' && styles.tabBtnTextActive]}>Products ({products.filter(p => p.status === 'active').length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tabMode === 'bundles' && styles.tabBtnActive]}
          onPress={() => setTabMode('bundles')}
        >
          <MaterialIcons name="card-giftcard" size={14} color={tabMode === 'bundles' ? Colors.navy : Colors.textMuted} />
          <Text style={[styles.tabBtnText, tabMode === 'bundles' && styles.tabBtnTextActive]}>Gift Bundles ({bundles.filter(b => b.status === 'active').length})</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={16} color={Colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder={tabMode === 'products' ? 'Search products...' : 'Search bundles...'} placeholderTextColor={Colors.textMuted} value={search} onChangeText={setSearch} />
        </View>
        {tabMode === 'products' && (
          <TouchableOpacity style={[styles.filterBtn, filterStatus === 'low' && styles.filterBtnActive]} onPress={() => setFilterStatus(filterStatus === 'low' ? 'all' : 'low')}>
            <MaterialIcons name="warning" size={14} color={filterStatus === 'low' ? Colors.warning : Colors.textMuted} />
            <Text style={[styles.filterBtnText, filterStatus === 'low' && { color: Colors.warning }]}>Low</Text>
          </TouchableOpacity>
        )}
      </View>

      {tabMode === 'products' && (
        <View style={styles.catWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {categories.map(cat => (
              <TouchableOpacity key={cat.id} style={[styles.catChip, activeCategory === cat.id && styles.catChipActive]} onPress={() => setActiveCategory(cat.id)}>
                <Text style={[styles.catChipText, activeCategory === cat.id && styles.catChipTextActive]}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {tabMode === 'products' ? (
        <FlatList
          data={filteredProducts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="inventory-2" size={48} color={Colors.textMuted} /><Text style={styles.emptyText}>No products found</Text></View>}
          renderItem={({ item }) => {
            const margin = item.price - item.buyingPrice;
            const marginPct = item.buyingPrice > 0 ? Math.round((margin / item.buyingPrice) * 100) : 0;
            const isLow = item.stock <= item.minStock;
            return (
              <View style={styles.productRow}>
                <Image source={{ uri: item.imageUrl }} style={styles.productImg} contentFit="cover" transition={200} />
                <View style={styles.productInfo}>
                  <View style={styles.productTopRow}>
                    <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                    {isLow && <View style={styles.lowBadge}><Text style={styles.lowBadgeText}>LOW</Text></View>}
                  </View>
                  <Text style={styles.productCategory}>{getCategoryName(item.category)} · {item.barcode}</Text>
                  <View style={styles.productMeta}>
                    <Text style={styles.productPrice}>{formatUGX(item.price)}</Text>
                    <Text style={styles.productMargin}>+{marginPct}% margin</Text>
                    <Text style={[styles.productStock, isLow && { color: Colors.warning }]}>{item.stock} left</Text>
                  </View>
                </View>
                <View style={styles.productActions}>
                  {/* Label / QR Sticker */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: Colors.goldSubtle, borderColor: Colors.borderGold }]}
                    onPress={() => showAlert('Product Label', `Print or share QR sticker for "${item.name}"?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Print', onPress: () => handlePrintSticker(item) },
                      { text: 'Share PDF', onPress: () => handleShareSticker(item) },
                    ])}
                  >
                    <MaterialIcons name="qr-code" size={15} color={Colors.gold} />
                  </TouchableOpacity>
                  {hasPermission('products') && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openEditModal(item)}>
                      <MaterialIcons name="edit" size={15} color={Colors.skyBlue} />
                    </TouchableOpacity>
                  )}
                  {hasPermission('delete') && (
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: Colors.danger + '40' }]} onPress={() => handleDeleteProduct(item)}>
                      <MaterialIcons name="archive" size={15} color={Colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {filteredBundles.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="card-giftcard" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No gift bundles yet</Text>
              <Text style={styles.emptySubText}>Create a bundle to group products at a special price</Text>
              {hasPermission('products') && (
                <TouchableOpacity style={styles.emptyAddBtn} onPress={openAddBundleModal}>
                  <MaterialIcons name="add" size={16} color={Colors.navy} />
                  <Text style={styles.emptyAddBtnText}>Create First Bundle</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : filteredBundles.map(bundle => (
            <View key={bundle.id} style={styles.bundleCard}>
              <View style={styles.bundleHeader}>
                <View style={styles.bundleIconWrap}>
                  <MaterialIcons name="card-giftcard" size={24} color={Colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bundleName}>{bundle.name}</Text>
                  {bundle.description ? <Text style={styles.bundleDesc} numberOfLines={1}>{bundle.description}</Text> : null}
                </View>
                <View style={styles.bundleActions}>
                  {hasPermission('products') && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openEditBundleModal(bundle)}>
                      <MaterialIcons name="edit" size={15} color={Colors.skyBlue} />
                    </TouchableOpacity>
                  )}
                  {hasPermission('delete') && (
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: Colors.danger + '40' }]} onPress={() => handleDeleteBundle(bundle)}>
                      <MaterialIcons name="delete" size={15} color={Colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={styles.bundlePriceRow}>
                <Text style={styles.bundlePrice}>{formatUGX(bundle.bundlePrice)}</Text>
                {bundle.discountPct > 0 && (
                  <>
                    <Text style={styles.bundleOriginal}>{formatUGX(bundle.originalPrice)}</Text>
                    <View style={styles.bundleDiscountBadge}>
                      <Text style={styles.bundleDiscountText}>{bundle.discountPct}% OFF</Text>
                    </View>
                  </>
                )}
              </View>
              <View style={styles.bundleComponents}>
                {bundle.components.map((comp, i) => (
                  <View key={i} style={styles.bundleCompChip}>
                    <Text style={styles.bundleCompText}>{comp.productName} ×{comp.qty}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.bundleFooter}>
                <MaterialIcons name="point-of-sale" size={12} color={Colors.success} />
                <Text style={styles.bundleFooterText}>Available in POS · Deducts all component stocks on sale</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Add/Edit Product Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editProduct ? 'Edit Product' : 'Add New Product'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <MaterialIcons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <View style={styles.imageSection}>
                <Text style={styles.formLabel}>Product Image</Text>
                <TouchableOpacity style={styles.imagePickerBox} onPress={handlePickImage} disabled={uploadingImage}>
                  {uploadingImage ? (
                    <View style={styles.imagePickerContent}><ActivityIndicator color={Colors.gold} size="small" /><Text style={styles.imagePickerText}>Uploading...</Text></View>
                  ) : formImageUrl ? (
                    <View style={styles.imagePreviewWrap}>
                      <Image source={{ uri: formImageUrl }} style={styles.imagePreview} contentFit="cover" />
                      <View style={styles.imageChangeOverlay}><MaterialIcons name="edit" size={20} color={Colors.textPrimary} /><Text style={styles.imageChangeText}>Change</Text></View>
                    </View>
                  ) : (
                    <View style={styles.imagePickerContent}><MaterialIcons name="add-photo-alternate" size={32} color={Colors.textMuted} /><Text style={styles.imagePickerText}>Tap to add photo</Text><Text style={styles.imagePickerSub}>Camera or Gallery</Text></View>
                  )}
                </TouchableOpacity>
              </View>
              {[
                { label: 'Product Name *', value: formName, onChange: setFormName, placeholder: 'e.g. Premium Rose Bouquet' },
                { label: 'Barcode / SKU', value: formBarcode, onChange: setFormBarcode, placeholder: 'e.g. HGA001' },
                { label: 'Selling Price (UGX) *', value: formPrice, onChange: setFormPrice, placeholder: '0', keyboard: 'numeric' as const },
                { label: 'Buying Price (UGX)', value: formBuyingPrice, onChange: setFormBuyingPrice, placeholder: '0', keyboard: 'numeric' as const },
                { label: 'Stock Quantity *', value: formStock, onChange: setFormStock, placeholder: '0', keyboard: 'numeric' as const },
                { label: 'Minimum Stock Alert', value: formMinStock, onChange: setFormMinStock, placeholder: '5', keyboard: 'numeric' as const },
                { label: 'Supplier', value: formSupplier, onChange: setFormSupplier, placeholder: 'Supplier name' },
                { label: 'Description', value: formDescription, onChange: setFormDescription, placeholder: 'Product description...', multi: true },
              ].map(field => (
                <View key={field.label} style={styles.formGroup}>
                  <Text style={styles.formLabel}>{field.label}</Text>
                  <TextInput style={[styles.formInput, field.multi && styles.formInputMulti]} placeholder={field.placeholder} placeholderTextColor={Colors.textMuted} value={field.value} onChangeText={field.onChange} keyboardType={field.keyboard || 'default'} multiline={field.multi} />
                </View>
              ))}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catPicker}>
                  {MOCK_CATEGORIES.filter(c => c.id !== 'cat_all').map(cat => (
                    <TouchableOpacity key={cat.id} style={[styles.catPickBtn, formCategory === cat.id && styles.catPickBtnActive]} onPress={() => setFormCategory(cat.id)}>
                      <Text style={[styles.catPickText, formCategory === cat.id && styles.catPickTextActive]}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProduct} disabled={uploadingImage}>
                <MaterialIcons name="check" size={16} color={Colors.navy} />
                <Text style={styles.saveBtnText}>{editProduct ? 'Update' : 'Add Product'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bundle Modal */}
      <Modal visible={showBundleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editBundle ? 'Edit Bundle' : 'Create Gift Bundle'}</Text>
              <TouchableOpacity onPress={() => setShowBundleModal(false)}>
                <MaterialIcons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Bundle Name *</Text>
                <TextInput style={styles.formInput} placeholder="e.g. Luxury Rose Gift Set" placeholderTextColor={Colors.textMuted} value={bundleName} onChangeText={setBundleName} />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Description</Text>
                <TextInput style={[styles.formInput, styles.formInputMulti]} placeholder="Bundle description..." placeholderTextColor={Colors.textMuted} value={bundleDescription} onChangeText={setBundleDescription} multiline />
              </View>

              {/* Components */}
              <View style={styles.formGroup}>
                <View style={styles.componentHeader}>
                  <Text style={styles.formLabel}>Bundle Components * (min 2)</Text>
                  <TouchableOpacity style={styles.addComponentBtn} onPress={() => { setComponentSearch(''); setShowComponentPicker(true); }}>
                    <MaterialIcons name="add" size={14} color={Colors.navy} />
                    <Text style={styles.addComponentBtnText}>Add Product</Text>
                  </TouchableOpacity>
                </View>
                {bundleComponents.length === 0 ? (
                  <View style={styles.emptyComponents}>
                    <MaterialIcons name="inventory-2" size={24} color={Colors.textMuted} />
                    <Text style={styles.emptyComponentsText}>No products added yet. Tap "Add Product" to begin.</Text>
                  </View>
                ) : (
                  bundleComponents.map(comp => (
                    <View key={comp.productId} style={styles.componentRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.componentName}>{comp.productName}</Text>
                        <Text style={styles.componentPrice}>{formatUGX(comp.unitPrice)} each</Text>
                      </View>
                      <View style={styles.compQtyControl}>
                        <TouchableOpacity style={styles.compQtyBtn} onPress={() => updateComponentQty(comp.productId, comp.qty - 1)}>
                          <MaterialIcons name={comp.qty === 1 ? 'delete' : 'remove'} size={13} color={comp.qty === 1 ? Colors.danger : Colors.skyBlue} />
                        </TouchableOpacity>
                        <Text style={styles.compQtyText}>{comp.qty}</Text>
                        <TouchableOpacity style={styles.compQtyBtn} onPress={() => updateComponentQty(comp.productId, comp.qty + 1)}>
                          <MaterialIcons name="add" size={13} color={Colors.success} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.componentTotal}>{formatUGX(comp.unitPrice * comp.qty)}</Text>
                    </View>
                  ))
                )}
                {bundleComponents.length > 0 && (
                  <View style={styles.componentSummary}>
                    <Text style={styles.componentSummaryLabel}>Original Total</Text>
                    <Text style={styles.componentSummaryValue}>{formatUGX(bundleOriginalPrice)}</Text>
                  </View>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Bundle Price (UGX) *</Text>
                <TextInput style={styles.formInput} placeholder="Set discounted bundle price" placeholderTextColor={Colors.textMuted} value={bundlePrice} onChangeText={setBundlePrice} keyboardType="numeric" />
                {bundlePrice && bundleOriginalPrice > 0 && (
                  <View style={[styles.bundlePricingInfo, { backgroundColor: bundleDiscount > 0 ? Colors.successMuted : Colors.warningMuted }]}>
                    <MaterialIcons name={bundleDiscount > 0 ? 'local-offer' : 'info'} size={14} color={bundleDiscount > 0 ? Colors.success : Colors.warning} />
                    <Text style={[styles.bundlePricingText, { color: bundleDiscount > 0 ? Colors.success : Colors.warning }]}>
                      {bundleDiscount > 0
                        ? `${bundleDiscount}% savings over buying separately (${formatUGX(bundleOriginalPrice)})`
                        : bundleDiscount === 0
                        ? 'No discount — same as individual prices'
                        : 'Bundle price is higher than individual items'}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowBundleModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#9B59B6' }]} onPress={handleSaveBundle}>
                <MaterialIcons name="card-giftcard" size={16} color={Colors.textPrimary} />
                <Text style={[styles.saveBtnText, { color: Colors.textPrimary }]}>{editBundle ? 'Update Bundle' : 'Create Bundle'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Component Picker Modal */}
      <Modal visible={showComponentPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Bundle</Text>
              <TouchableOpacity onPress={() => setShowComponentPicker(false)}>
                <MaterialIcons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.compPickerSearch}>
              <MaterialIcons name="search" size={16} color={Colors.textMuted} />
              <TextInput style={styles.compPickerSearchInput} placeholder="Search products..." placeholderTextColor={Colors.textMuted} value={componentSearch} onChangeText={setComponentSearch} autoFocus />
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: 20, gap: 8 }}>
              {componentFilteredProducts.map(product => {
                const inBundle = bundleComponents.find(c => c.productId === product.id);
                return (
                  <TouchableOpacity key={product.id} style={[styles.compPickerRow, inBundle && { borderColor: Colors.gold + '60', backgroundColor: Colors.goldSubtle }]} onPress={() => { addComponentToBundle(product); setShowComponentPicker(false); }}>
                    <Image source={{ uri: product.imageUrl }} style={styles.compPickerImg} contentFit="cover" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.compPickerName}>{product.name}</Text>
                      <Text style={styles.compPickerPrice}>{formatUGX(product.price)} · {product.stock} in stock</Text>
                    </View>
                    {inBundle ? (
                      <View style={styles.inBundleBadge}><Text style={styles.inBundleBadgeText}>×{inBundle.qty}</Text></View>
                    ) : (
                      <View style={styles.addCompBadge}><MaterialIcons name="add" size={14} color={Colors.navy} /></View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
  headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gold, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.md, ...Shadows.gold },
  addBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.navy },
  tabToggle: { flexDirection: 'row', margin: Spacing.md, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: BorderRadius.md },
  tabBtnActive: { backgroundColor: Colors.gold },
  tabBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  tabBtnTextActive: { color: Colors.navy, fontWeight: Typography.bold },
  searchBar: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.base, paddingBottom: Spacing.md },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sm, paddingVertical: 10 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: BorderRadius.md, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  filterBtnActive: { borderColor: Colors.warning, backgroundColor: Colors.warningMuted },
  filterBtnText: { fontSize: 12, color: Colors.textMuted },
  catWrap: { height: 48 },
  catRow: { paddingHorizontal: Spacing.base, paddingVertical: 6, gap: 8, alignItems: 'center' },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.circle, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  catChipActive: { backgroundColor: Colors.goldMuted, borderColor: Colors.gold },
  catChipText: { fontSize: 12, color: Colors.textMuted },
  catChipTextActive: { color: Colors.gold, fontWeight: Typography.bold },
  list: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: 10, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { color: Colors.textMuted, fontSize: Typography.base },
  emptySubText: { color: Colors.textMuted, fontSize: Typography.xs, textAlign: 'center', paddingHorizontal: 40 },
  emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#9B59B6', paddingHorizontal: 16, paddingVertical: 10, borderRadius: BorderRadius.md, marginTop: 4 },
  emptyAddBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadows.sm },
  productImg: { width: 64, height: 64, borderRadius: BorderRadius.sm },
  productInfo: { flex: 1, gap: 3 },
  productTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  productName: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  lowBadge: { backgroundColor: Colors.warningMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  lowBadgeText: { fontSize: 9, fontWeight: Typography.bold, color: Colors.warning },
  productCategory: { fontSize: Typography.xs, color: Colors.textMuted },
  productMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  productPrice: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  productMargin: { fontSize: Typography.xs, color: Colors.success },
  productStock: { fontSize: Typography.xs, color: Colors.textSecondary },
  productActions: { gap: 5 },
  actionBtn: { width: 34, height: 34, borderRadius: BorderRadius.sm, backgroundColor: Colors.navyLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  bundleCard: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: '#9B59B6' + '40', padding: Spacing.md, gap: 10 },
  bundleHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bundleIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#9B59B6' + '20', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#9B59B6' + '40' },
  bundleName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  bundleDesc: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  bundleActions: { gap: 5 },
  bundlePriceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bundlePrice: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.gold },
  bundleOriginal: { fontSize: Typography.sm, color: Colors.textMuted, textDecorationLine: 'line-through' },
  bundleDiscountBadge: { backgroundColor: Colors.successMuted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.circle, borderWidth: 1, borderColor: Colors.success + '40' },
  bundleDiscountText: { fontSize: 11, fontWeight: Typography.extrabold, color: Colors.success },
  bundleComponents: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bundleCompChip: { backgroundColor: Colors.navyLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border },
  bundleCompText: { fontSize: 11, color: Colors.textSecondary },
  bundleFooter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bundleFooterText: { fontSize: 10, color: Colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modal: { backgroundColor: Colors.navyMid, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, maxHeight: '92%', borderTopWidth: 2, borderColor: Colors.borderGold },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  modalTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gold },
  modalBody: { padding: Spacing.xl, gap: Spacing.md },
  imageSection: { gap: 8 },
  imagePickerBox: { height: 140, borderRadius: BorderRadius.lg, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', overflow: 'hidden', backgroundColor: Colors.navyCard },
  imagePickerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  imagePickerText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  imagePickerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  imagePreviewWrap: { width: '100%', height: '100%', position: 'relative' },
  imagePreview: { width: '100%', height: '100%' },
  imageChangeOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 6 },
  imageChangeText: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.semibold },
  formGroup: { gap: 6 },
  formLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  formInput: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, fontSize: Typography.base, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  formInputMulti: { height: 80, textAlignVertical: 'top' },
  catPicker: { gap: 8, paddingVertical: 4 },
  catPickBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.circle, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  catPickBtnActive: { backgroundColor: Colors.goldMuted, borderColor: Colors.gold },
  catPickText: { fontSize: 12, color: Colors.textMuted },
  catPickTextActive: { color: Colors.gold, fontWeight: Typography.bold },
  modalFooter: { flexDirection: 'row', gap: 12, padding: Spacing.xl, borderTopWidth: 1, borderTopColor: Colors.divider },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { color: Colors.textMuted, fontWeight: Typography.semibold },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: BorderRadius.md, backgroundColor: Colors.gold, ...Shadows.gold },
  saveBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  componentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addComponentBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.gold, paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.sm },
  addComponentBtnText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.navy },
  emptyComponents: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  emptyComponentsText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted },
  componentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  componentName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  componentPrice: { fontSize: Typography.xs, color: Colors.textMuted },
  compQtyControl: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.navyLight, borderRadius: BorderRadius.sm, paddingHorizontal: 4, paddingVertical: 3 },
  compQtyBtn: { padding: 3 },
  compQtyText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, minWidth: 18, textAlign: 'center' },
  componentTotal: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold, minWidth: 80, textAlign: 'right' },
  componentSummary: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  componentSummaryLabel: { fontSize: Typography.sm, color: Colors.textMuted },
  componentSummaryValue: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textSecondary },
  bundlePricingInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: BorderRadius.sm, padding: Spacing.sm, marginTop: 4 },
  bundlePricingText: { flex: 1, fontSize: Typography.xs },
  compPickerSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.md, marginBottom: Spacing.sm, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  compPickerSearchInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sm, paddingVertical: 10 },
  compPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  compPickerImg: { width: 44, height: 44, borderRadius: BorderRadius.sm },
  compPickerName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  compPickerPrice: { fontSize: Typography.xs, color: Colors.textMuted },
  inBundleBadge: { backgroundColor: Colors.goldMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.borderGold },
  inBundleBadgeText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.gold },
  addCompBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
});
