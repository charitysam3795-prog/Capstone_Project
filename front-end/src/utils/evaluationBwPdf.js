import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Convert a canvas to grayscale JPEG (much smaller than PNG color screenshots).
 */
export function canvasToGrayscaleJpeg(canvas, quality = 0.72) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas.toDataURL('image/jpeg', quality);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    pixels[i] = gray;
    pixels[i + 1] = gray;
    pixels[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', quality);
}

async function captureElement(el, scale, jpegQuality) {
  const canvas = await html2canvas(el, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });
  return {
    canvas,
    dataUrl: canvasToGrayscaleJpeg(canvas, jpegQuality),
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Render an off-screen HTML report into a black-and-white JPEG PDF.
 * When sectionSelector matches (e.g. ".term-block"), pages break between whole
 * sections so tables are never cut mid-row.
 *
 * @param {string} html
 * @param {{
 *   filename?: string,
 *   widthPx?: number,
 *   scale?: number,
 *   orientation?: 'portrait'|'landscape',
 *   jpegQuality?: number,
 *   sectionSelector?: string,
 *   headerSelector?: string,
 *   footerSelector?: string,
 * }} options
 */
export async function downloadBwHtmlAsPdf(html, options = {}) {
  const {
    filename = 'evaluation-report.pdf',
    widthPx = 980,
    scale = 1.35,
    orientation = 'landscape',
    jpegQuality = 0.7,
    sectionSelector = '.eval-pdf-page-chunk',
    headerSelector = '.eval-pdf-page-header',
    footerSelector = '.eval-pdf__footer',
  } = options;

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-12000px',
    top: '0',
    width: `${widthPx}px`,
    background: '#ffffff',
  });
  host.innerHTML = html;
  document.body.appendChild(host);

  try {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;

    const toMm = (px, canvasWidth) => (px / canvasWidth) * usableW;

    const headerEl = host.querySelector(headerSelector);
    const footerEl = host.querySelector(footerSelector);
    const sectionEls = [...host.querySelectorAll(sectionSelector)];

    // Fallback: one tall image (legacy) if no section markers.
    if (sectionEls.length === 0) {
      const full = await captureElement(host, scale, jpegQuality);
      const imgW = usableW;
      const imgH = toMm(full.height, full.width);
      let heightLeft = imgH;
      let position = margin;
      pdf.addImage(full.dataUrl, 'JPEG', margin, position, imgW, imgH, undefined, 'FAST');
      heightLeft -= usableH;
      while (heightLeft > 0) {
        position = margin + (heightLeft - imgH);
        pdf.addPage(undefined, orientation);
        pdf.addImage(full.dataUrl, 'JPEG', margin, position, imgW, imgH, undefined, 'FAST');
        heightLeft -= usableH;
      }
      pdf.save(filename);
      return;
    }

    const headerShot = headerEl ? await captureElement(headerEl, scale, jpegQuality) : null;
    const footerShot = footerEl ? await captureElement(footerEl, scale, jpegQuality) : null;
    const sectionShots = [];
    for (const sectionEl of sectionEls) {
      sectionShots.push(await captureElement(sectionEl, scale, jpegQuality));
    }

    const headerH = headerShot ? toMm(headerShot.height, headerShot.width) : 0;
    const footerH = footerShot ? toMm(footerShot.height, footerShot.width) : 0;
    const gap = 2;

    let pageStarted = false;
    let y = margin;

    const startPage = (withHeader) => {
      if (pageStarted) {
        pdf.addPage(undefined, orientation);
      }
      pageStarted = true;
      y = margin;
      if (withHeader && headerShot) {
        const h = toMm(headerShot.height, headerShot.width);
        pdf.addImage(
          headerShot.dataUrl,
          'JPEG',
          margin,
          y,
          usableW,
          h,
          undefined,
          'FAST'
        );
        y += h + gap;
      }
    };

    startPage(true);

    for (const shot of sectionShots) {
      const blockH = toMm(shot.height, shot.width);
      const spaceLeft = pageH - margin - y;
      // Keep whole semester/year block on one page when it fits; otherwise new page.
      if (blockH <= usableH && blockH > spaceLeft - (footerH ? footerH + gap : 0)) {
        startPage(true);
      }
      // If a single block is taller than a page, slice it (rare) but start fresh.
      if (blockH > usableH) {
        if (y > margin + headerH + gap + 1) {
          startPage(true);
        }
        let remaining = blockH;
        let srcY = 0;
        while (remaining > 0) {
          const sliceH = Math.min(remaining, pageH - margin - y);
          const slicePx = Math.round((sliceH / blockH) * shot.height);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = shot.width;
          sliceCanvas.height = Math.max(1, slicePx);
          const ctx = sliceCanvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(
            shot.canvas,
            0,
            Math.round(srcY),
            shot.width,
            slicePx,
            0,
            0,
            shot.width,
            slicePx
          );
          const sliceUrl = canvasToGrayscaleJpeg(sliceCanvas, jpegQuality);
          pdf.addImage(sliceUrl, 'JPEG', margin, y, usableW, sliceH, undefined, 'FAST');
          remaining -= sliceH;
          srcY += slicePx;
          if (remaining > 0) {
            startPage(true);
          } else {
            y += sliceH + gap;
          }
        }
        continue;
      }

      pdf.addImage(shot.dataUrl, 'JPEG', margin, y, usableW, blockH, undefined, 'FAST');
      y += blockH + gap;
    }

    if (footerShot) {
      const fh = toMm(footerShot.height, footerShot.width);
      if (fh > pageH - margin - y) {
        startPage(false);
      }
      pdf.addImage(footerShot.dataUrl, 'JPEG', margin, y, usableW, fh, undefined, 'FAST');
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(host);
  }
}
