// components/LabelTemplate.tsx
import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function LabelTemplate({ svg }: { svg: string }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0">${svg}</body></html>`;
  return (
    <View style={{ flex: 1 }}>
      <WebView originWhitelist={["*"]} source={{ html }} style={{ flex: 1 }} />
    </View>
  );
}
