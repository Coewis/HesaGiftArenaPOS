// components/LabelPrintPreview.tsx
import React from 'react';
import { View, Button } from 'react-native';
import LabelTemplate from '@/components/LabelTemplate';
import { buildLabelSVG, labelHTML } from '@/services/labelService';
import { printAndShareHTML } from '@/services/printService';

export default function LabelPrintPreview({ sku, name, price }:{ sku:string; name:string; price:number }){
  const svg = buildLabelSVG({ sku, name, price });
  const html = labelHTML(svg);

  const doPrint = async () => {
    try {
      await printAndShareHTML(html);
    } catch (err) { console.warn('print error', err); }
  };

  return (
    <View style={{ flex: 1 }}>
      <LabelTemplate svg={svg} />
      <Button title="Print / Share" onPress={doPrint} />
    </View>
  );
}
