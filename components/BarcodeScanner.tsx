// components/BarcodeScanner.tsx
// Simple wrapper around expo-barcode-scanner for quick integration into the POS screen.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';

export default function BarcodeScanner({ onScan, onCancel }: { onScan: (data: string) => void; onCancel?: () => void }) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  if (hasPermission === null) return <Text>Requesting camera permission...</Text>;
  if (hasPermission === false) return <Text>No access to camera</Text>;

  return (
    <View style={styles.container}>
      <BarCodeScanner
        onBarCodeScanned={({ data }) => onScan(data)}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.footer}>
        <Button title="Cancel" onPress={() => onCancel && onCancel()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  footer: { position: 'absolute', bottom: 24, width: '100%', alignItems: 'center' }
});
