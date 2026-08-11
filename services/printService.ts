// services/printService.ts
// Uses expo-print to render HTML/PDF for label printing

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export async function printHTML(html: string) {
  // returns file URI
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

export async function printAndShareHTML(html: string) {
  const uri = await printHTML(html);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }
  return uri;
}

export default { printHTML, printAndShareHTML };
