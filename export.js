// export.js
// Export any Google Drive document to a PDF directly from your browser console.
// Usage: Command+Shift+C -> Console -> Paste script -> Press Enter -> Download when prompted
// by VRIL LABS
// github.com/VRIL-LABS/drive-to-pdf
(async () => {
  const imgs = [...document.querySelectorAll('img')].filter(
    img => /^blob:/.test(img.src) && img.naturalWidth > 100
  );
  if (!imgs.length) { console.warn('Scroll through all pages first, then re-run.'); return; }

  const pages = imgs.map((img, i) => {
    const can = document.createElement('canvas');
    can.width  = img.naturalWidth;
    can.height = img.naturalHeight;
    can.getContext('2d').drawImage(img, 0, 0);
    console.log(`Captured page ${i + 1}/${imgs.length}`);
    return { data: can.toDataURL('image/jpeg', 0.95), width: img.naturalWidth, height: img.naturalHeight };
  });

  // Fetch the UMD build as text, wrap it in a module that exports the global it sets
  const umdText = await fetch(
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  ).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });

  // The UMD build sets window.jspdf — wrap it so the module exports it explicitly
  const wrapped = `
    const window = globalThis;
    const self   = globalThis;
    ${umdText}
    export const jsPDF = globalThis.jspdf.jsPDF;
  `;

  const modBlob = new Blob([wrapped], { type: 'text/javascript' });
  const modUrl  = URL.createObjectURL(modBlob);

  let jsPDF;
  try {
    const mod = await import(modUrl);
    jsPDF = mod.jsPDF;
    URL.revokeObjectURL(modUrl);
    if (!jsPDF) throw new Error('jsPDF not found on module exports');
    console.log('jsPDF loaded successfully');
  } catch (err) {
    console.error('Module import failed:', err);
    return;
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', compress: true });

  pages.forEach((page, i) => {
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = (page.height / page.width) * pdfW;
    if (i === 0) { pdf.deletePage(1); pdf.addPage([pdfW, pdfH]); }
    else pdf.addPage([pdfW, pdfH]);
    pdf.addImage(page.data, 'JPEG', 0, 0, pdfW, pdfH);
    console.log(`Added page ${i + 1}/${pages.length}`);
  });

  const pdfBlob = new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
  const a       = document.createElement('a');
  a.href        = URL.createObjectURL(pdfBlob);
  a.download    = 'document.pdf';
  a.click();
  console.log('Done — document.pdf downloaded.');
})();