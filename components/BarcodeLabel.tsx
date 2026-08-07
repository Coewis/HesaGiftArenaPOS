// components/BarcodeLabel.tsx
// Simple renderer for label SVG returned by rpc_generate_barcode

import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function BarcodeLabel({ svg }: { svg: string }) {
  // Render raw SVG inside a WebView for printing via expo-print (client will call Print.printToFileAsync with this HTML)
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${svg}</body></html>`;
  return (
    <View style={{ flex: 1 }}>
      <WebView originWhitelist={["*"]} source={{ html }} style={{ flex: 1 }} />
    </View>
  );
}
