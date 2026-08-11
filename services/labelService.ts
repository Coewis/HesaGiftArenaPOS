// services/labelService.ts
// Client-side helper to render label SVG templates and return HTML for printing

export function buildLabelSVG({ sku, name, price, brand = 'HESA GIFT ARENA' }:{ sku:string; name:string; price:number; brand?:string }) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg width="400" height="160" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <text x="16" y="30" font-size="16" font-family="Arial" fill="#111" font-weight="700">${brand}</text>
    <text x="16" y="56" font-size="14" font-family="Arial" fill="#333">${name}</text>
    <text x="16" y="84" font-size="13" font-family="Arial" fill="#666">SKU: ${sku}</text>
    <text x="16" y="112" font-size="18" font-family="Arial" fill="#B8922E" font-weight="700">UGX ${price}</text>
  </svg>`;
  return svg;
}

export function labelHTML(svg:string) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0">${svg}</body></html>`;
}

export default { buildLabelSVG, labelHTML };
