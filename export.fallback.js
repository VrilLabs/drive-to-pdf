// export.fallback.js
// Fallback to export.js. Export any Google Drive document to a PDF directly from your browser console.
// Usage: Command+Shift+C -> Console -> Paste script -> Press Enter -> Download when prompted
// by VRIL LABS
// github.com/VRIL-LABS/drive-to-pdf
(async () => {
  const imgs = [...document.querySelectorAll('img')].filter(
    img => /^blob:/.test(img.src) && img.naturalWidth > 100
  );
  if (!imgs.length) { console.warn('Scroll through all pages first, then re-run.'); return; }

  // Convert each blob img to a fetchable JPEG ArrayBuffer
  const pages = await Promise.all(imgs.map(async (img, i) => {
    const can = document.createElement('canvas');
    can.width  = img.naturalWidth;
    can.height = img.naturalHeight;
    can.getContext('2d').drawImage(img, 0, 0);
    // Fetch the canvas blob as ArrayBuffer for raw JPEG bytes
    const dataUrl = can.toDataURL('image/jpeg', 0.95);
    const res     = await fetch(dataUrl);
    const buf     = await res.arrayBuffer();
    console.log(`Captured page ${i + 1}/${imgs.length} — ${(buf.byteLength/1024).toFixed(1)} KB`);
    return { buf, width: img.naturalWidth, height: img.naturalHeight };
  }));

  // Minimal hand-rolled PDF writer — no dependencies
  const enc  = new TextEncoder();
  const strs = [];
  const bins = [];  // { offset, buf } for JPEG binary streams
  let   pos  = 0;

  const w = s => { strs.push({ pos, str: s }); pos += enc.encode(s).length; };

  const xrefs = [];
  const obj   = (n, content) => { xrefs[n] = pos; w(content); };

  w('%PDF-1.4\n');

  const pageCount = pages.length;
  const pageObjStart = 3;

  // Each page needs: image XObject obj, page obj
  // Objects: 1=catalog, 2=pages, 3..=(pageObjStart + i*2)=image, (pageObjStart+i*2+1)=page
  const imageObjs = pages.map((_, i) => pageObjStart + i * 2);
  const pageObjs  = pages.map((_, i) => pageObjStart + i * 2 + 1);
  const nextObj   = pageObjStart + pages.length * 2;

  // We'll build sequentially; collect all parts into a Uint8Array at the end
  const parts = [];
  const addStr = s => parts.push(enc.encode(s));
  const addBuf = b => parts.push(new Uint8Array(b));

  const offsets = {};
  let bytePos = 0;
  const track = n => { offsets[n] = bytePos; };
  const write = s => { const b = enc.encode(s); parts.push(b); bytePos += b.length; };
  const writeBuf = b => { const u = new Uint8Array(b); parts.push(u); bytePos += u.length; };

  write('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // Image + Page objects per page
  pages.forEach((page, i) => {
    const imgN  = imageObjs[i];
    const pageN = pageObjs[i];
    const ptW   = page.width  * 0.75;  // px → pt (96dpi → 72pt)
    const ptH   = page.height * 0.75;

    // Image XObject
    track(imgN);
    const hdr = enc.encode(
      `${imgN} 0 obj\n<< /Type /XObject /Subtype /Image ` +
      `/Width ${page.width} /Height ${page.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
      `/Filter /DCTDecode /Length ${page.buf.byteLength} >>\nstream\n`
    );
    parts.push(hdr); bytePos += hdr.length;
    writeBuf(page.buf);
    write('\nendstream\nendobj\n');

    // Page object
    track(pageN);
    write(
      `${pageN} 0 obj\n<< /Type /Page /Parent 2 0 R ` +
      `/MediaBox [0 0 ${ptW.toFixed(2)} ${ptH.toFixed(2)}] ` +
      `/Resources << /XObject << /Im${i} ${imgN} 0 R >> >> ` +
      `/Contents ${nextObj + i} 0 R >>\nendobj\n`
    );
  });

  // Content streams (draw image)
  pages.forEach((page, i) => {
    const n   = nextObj + i;
    const ptW = (page.width  * 0.75).toFixed(2);
    const ptH = (page.height * 0.75).toFixed(2);
    const cmd = `q ${ptW} 0 0 ${ptH} 0 0 cm /Im${i} Do Q`;
    track(n);
    write(`${n} 0 obj\n<< /Length ${cmd.length} >>\nstream\n${cmd}\nendstream\nendobj\n`);
  });

  // Pages dict
  const pagesN = 2;
  track(pagesN);
  write(`2 0 obj\n<< /Type /Pages /Kids [${pageObjs.map(n=>`${n} 0 R`).join(' ')}] /Count ${pageCount} >>\nendobj\n`);

  // Catalog
  track(1);
  write(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);

  // XRef table
  const xrefPos = bytePos;
  const totalObjs = nextObj + pages.length;
  write(`xref\n0 ${totalObjs}\n0000000000 65535 f \n`);
  for (let n = 1; n < totalObjs; n++) {
    write(`${String(offsets[n] ?? 0).padStart(10,'0')} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  // Merge all parts
  const total  = parts.reduce((s, p) => s + p.length, 0);
  const output = new Uint8Array(total);
  let   off    = 0;
  for (const p of parts) { output.set(p, off); off += p.length; }

  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([output], { type: 'application/pdf' }));
  a.download = 'document.pdf';
  a.click();
  console.log(`Done — ${pages.length} pages, ${(total/1024).toFixed(1)} KB`);
})();