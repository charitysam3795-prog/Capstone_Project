import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const PDF_WIDTH_PX = 1100;
const PAGE_MARGIN_MM = 7;
const MAX_YEARS_PER_PAGE = 2;
const BLOCK_GAP_MM = 2.5;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function guestPdfFileBase(guestName) {
  const nameForFile = String(guestName || '').trim();
  return nameForFile ? nameForFile.replace(/[^\w\-]+/g, '_') : '';
}

function codePills(codes) {
  const list = Array.isArray(codes) ? codes.filter(Boolean) : [codes].filter(Boolean);
  if (!list.length) {
    return `<span style="display:inline-block;padding:1px 5px;border-radius:999px;background:#e2e8f0;color:#64748b;font-size:8px;">—</span>`;
  }
  return list
    .map(
      (c) =>
        `<span style="display:inline-block;padding:1px 5px;border-radius:999px;background:#dbeafe;color:#1e40af;font-size:8px;font-weight:700;margin:0 1px 1px 0;">${esc(c)}</span>`,
    )
    .join('');
}

function unitsPill(units) {
  return `<span style="display:inline-block;min-width:1.2rem;text-align:center;padding:1px 5px;border-radius:999px;background:#dbeafe;color:#1e40af;font-size:8px;font-weight:700;">${esc(units ?? '—')}</span>`;
}

function wrapFragment(innerHtml) {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;background:#ffffff;padding:6px 8px;width:${PDF_WIDTH_PX}px;box-sizing:border-box;">
      ${innerHtml}
    </div>
  `;
}

function metaHeaderHtml({ institution, guestName, curriculumLabel, programLabel, stats }) {
  const statsHtml = (stats || [])
    .map(
      (s) =>
        `<div style="flex:1 1 90px;min-width:80px;background:#fff;border:1px solid #bbf7d0;border-radius:6px;padding:4px 8px;">
          <div style="font-size:7px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;">${esc(s.label)}</div>
          <div style="margin-top:1px;font-size:12px;font-weight:750;color:#1b5e20;">${esc(s.value)}</div>
        </div>`,
    )
    .join('');

  return `
    <div>
      <div style="font-size:8px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;">${esc(institution)}</div>
      <div style="margin-top:3px;font-size:9px;line-height:1.35;color:#334155;">
        ${guestName ? `<span><strong>Name:</strong> ${esc(guestName)}</span> · ` : ''}
        <span><strong>Curriculum:</strong> ${esc(curriculumLabel || '—')}</span> ·
        <span><strong>Program:</strong> ${esc(programLabel || '—')}</span>
      </div>
      ${stats?.length ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">${statsHtml}</div>` : ''}
    </div>
  `;
}

function simulationShellOpen(curriculumLabel) {
  return `
    <div style="border-radius:8px 8px 0 0;overflow:hidden;border:1px solid rgba(46, 125, 50,0.18);border-bottom:0;background:#fff;margin-top:6px;">
      <div style="background:linear-gradient(180deg,#2e7d32 0%,#1b5e20 100%);color:#fff;padding:6px 10px;font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">
        Curriculum simulation <span style="opacity:0.75;font-weight:600;">·</span> ${esc(curriculumLabel || '')}
      </div>
    </div>
  `;
}

function buildSimulationYearHtml(year) {
  const sections = year.sections || [];
  const sectionCards = sections
    .map((section) => {
      const rows = section.rows || [];
      const body =
        rows.length === 0
          ? `<tr><td colspan="4" style="padding:5px;text-align:center;color:#94a3b8;font-size:8px;border-bottom:1px solid #e5e7eb;">No subjects</td></tr>`
          : rows
              .map((row) => {
                const credited = row.credited === true || row.status === 'Credited';
                const titleExtra = [
                  row.prereq
                    ? `<div style="margin-top:1px;font-size:7px;color:#c2410c;font-weight:600;">${esc(row.prereq)}</div>`
                    : '',
                  row.coreq
                    ? `<div style="margin-top:0;font-size:7px;color:#64748b;">${esc(row.coreq)}</div>`
                    : '',
                ].join('');
                return `<tr style="background:${credited ? '#f0fdf4' : '#fff'};">
                  <td style="padding:2px 4px;border-bottom:1px solid #e5e7eb;vertical-align:top;width:16%;">${codePills(row.codes || row.code)}</td>
                  <td style="padding:2px 4px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
                    <div style="font-size:8.5px;font-weight:650;color:#0f172a;line-height:1.2;">${esc(row.title || '—')}</div>
                    ${titleExtra}
                  </td>
                  <td style="padding:2px 4px;border-bottom:1px solid #e5e7eb;text-align:center;vertical-align:top;width:9%;">${unitsPill(row.units)}</td>
                  <td style="padding:2px 4px;border-bottom:1px solid #e5e7eb;text-align:center;vertical-align:top;width:14%;">
                    <span style="display:inline-flex;align-items:center;gap:2px;font-size:7.5px;font-weight:650;color:${credited ? '#1b5e20' : '#94a3b8'};">
                      <span style="display:inline-block;width:9px;height:9px;border-radius:2px;border:1px solid ${credited ? '#2e7d32' : '#cbd5e1'};background:${credited ? '#2e7d32' : '#fff'};color:#fff;font-size:7px;line-height:9px;text-align:center;">${credited ? '✓' : ''}</span>
                      Credited
                    </span>
                  </td>
                </tr>`;
              })
              .join('');

      const totalLabel =
        section.totalUnits != null ? `Total units: <strong>${esc(section.totalUnits)}</strong>` : '';
      const allowedLabel =
        section.allowedUnits != null
          ? ` · Allowed (${esc(section.allowedLabel || year.yearLabel || '')}): ${esc(section.allowedUnits)}`
          : '';
      const creditedLabel =
        section.creditedUnits != null && Number(section.creditedUnits) > 0
          ? ` · Credited: ${esc(section.creditedUnits)}`
          : '';

      return `
        <div style="border:1px solid #d1d5db;border-radius:6px;overflow:hidden;background:#fff;min-width:0;">
          <div style="padding:3px 6px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
            <div style="font-size:9px;font-weight:750;color:#0f172a;">${esc(section.semesterLabel || 'Semester')}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#1b5e20;color:#fff;">
                <th style="padding:3px 4px;text-align:left;font-size:7px;font-weight:700;letter-spacing:0.03em;">PEN CODE</th>
                <th style="padding:3px 4px;text-align:left;font-size:7px;font-weight:700;letter-spacing:0.03em;">DESCRIPTIVE TITLE</th>
                <th style="padding:3px 4px;text-align:center;font-size:7px;font-weight:700;letter-spacing:0.03em;">UNITS</th>
                <th style="padding:3px 4px;text-align:center;font-size:7px;font-weight:700;letter-spacing:0.03em;">REMARKS</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
            ${
              totalLabel
                ? `<tfoot><tr><td colspan="4" style="padding:3px 6px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:7.5px;color:#334155;">${totalLabel}${allowedLabel}${creditedLabel}</td></tr></tfoot>`
                : ''
            }
          </table>
        </div>`;
    })
    .join('');

  return `
    <section style="background:#fff;border:1px solid rgba(46, 125, 50,0.16);border-radius:8px;padding:6px;box-sizing:border-box;">
      <div style="margin:0 0 5px;padding:3px 7px;background:#ecfdf5;border-left:3px solid #2e7d32;border-radius:3px;font-size:10px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:#1b5e20;">
        ${esc(year.yearLabel || 'Year')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:start;">
        ${sectionCards || '<div style="color:#94a3b8;font-size:9px;">No semesters</div>'}
      </div>
    </section>
  `;
}

function buildPlannerYearHtml(year) {
  const slots = (year.sections || [])
    .map((section) => {
      const rows = section.rows || [];
      const items =
        rows.length === 0
          ? `<div style="padding:8px 6px;text-align:center;color:#94a3b8;font-size:8px;border:1px dashed #cbd5e1;border-radius:6px;background:#f8fafc;">Empty term</div>`
          : rows
              .map((row) => {
                const code = Array.isArray(row.codes) ? row.codes[0] || '—' : row.code || '—';
                return `
                  <div style="display:flex;align-items:center;gap:5px;padding:4px 6px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;margin:0 0 3px;">
                    <span style="flex:0 0 auto;padding:1px 5px;border-radius:4px;background:#dcfce7;color:#1b5e20;font-size:8px;font-weight:800;">${esc(code)}</span>
                    <span style="flex:1 1 auto;min-width:0;font-size:8.5px;font-weight:650;color:#0f172a;line-height:1.2;">${esc(row.title || '—')}</span>
                    <span style="flex:0 0 auto;padding:1px 5px;border:1px solid #cbd5e1;border-radius:4px;font-size:8px;font-weight:700;color:#334155;">${esc(row.units ?? '—')}</span>
                  </div>`;
              })
              .join('');

      const load =
        section.unitsUsed != null && section.unitsCap != null
          ? `<span style="font-size:8px;font-weight:700;color:${
              Number(section.unitsUsed) > Number(section.unitsCap) ? '#b91c1c' : '#1b5e20'
            };">${esc(section.unitsUsed)} / ${esc(section.unitsCap)} u</span>`
          : '';

      return `
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:5px;min-width:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:5px;margin-bottom:4px;">
            <div style="font-size:9px;font-weight:750;color:#0f172a;">${esc(section.semesterLabel || 'Semester')}</div>
            ${load}
          </div>
          ${items}
        </div>`;
    })
    .join('');

  return `
    <section style="background:#fff;border:1px solid rgba(46, 125, 50,0.16);border-radius:8px;padding:6px;box-sizing:border-box;">
      <div style="margin:0 0 5px;font-size:10px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#1b5e20;">
        ${esc(year.yearLabel || 'Year')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 0.85fr;gap:5px;align-items:start;">
        ${slots || '<div style="color:#94a3b8;font-size:9px;">No terms</div>'}
      </div>
    </section>
  `;
}

async function captureFragment(html) {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    left: '-16000px',
    top: '0',
    width: `${PDF_WIDTH_PX}px`,
    background: '#ffffff',
  });
  el.innerHTML = html;
  document.body.appendChild(el);
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    return canvas;
  } finally {
    document.body.removeChild(el);
  }
}

/**
 * Pack year containers 2 per paper (like the evaluation sheet).
 * Pair is scaled uniformly so both fit fully — never cut mid-container.
 */
async function appendYearContainersToPdf(pdf, ctx, { headerHtml, yearHtmls }) {
  const { pageH, contentW, contentH } = ctx;

  const headerCanvas = await captureFragment(wrapFragment(headerHtml));
  const headerNaturalH = (headerCanvas.height * contentW) / headerCanvas.width;

  const blocks = [];
  for (const yearHtml of yearHtmls) {
    const canvas = await captureFragment(wrapFragment(yearHtml));
    blocks.push({
      canvas,
      naturalH: (canvas.height * contentW) / canvas.width,
    });
  }

  const drawImage = (canvas, x, y, w, h) => {
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, w, h);
  };

  const startPage = () => {
    if (ctx.pageStarted) pdf.addPage();
    ctx.pageStarted = true;
    ctx.y = PAGE_MARGIN_MM;
  };

  // First page of this section: compact header, then year pairs.
  startPage();
  {
    const maxHeader = Math.min(headerNaturalH, contentH * 0.28);
    const scale = maxHeader / Math.max(headerNaturalH, 0.01);
    const hw = contentW * Math.min(scale, 1);
    const hh = headerNaturalH * Math.min(scale, 1);
    drawImage(headerCanvas, PAGE_MARGIN_MM, ctx.y, hw, hh);
    ctx.y += hh + BLOCK_GAP_MM;
  }

  let i = 0;
  let isFirstPair = true;

  while (i < blocks.length) {
    if (!isFirstPair) {
      startPage();
    }
    isFirstPair = false;

    const pair = blocks.slice(i, i + MAX_YEARS_PER_PAGE);
    const available = pageH - PAGE_MARGIN_MM - ctx.y;
    const gaps = Math.max(0, pair.length - 1) * BLOCK_GAP_MM;
    const naturalTotal = pair.reduce((sum, b) => sum + b.naturalH, 0) + gaps;

    // Scale pair to fill available height (cap slight upscale so text stays sharp).
    let scale = available / Math.max(naturalTotal, 0.01);
    scale = Math.min(Math.max(scale, 0.45), 1.08);

    for (const block of pair) {
      const h = block.naturalH * scale;
      const w = contentW * scale;
      const x = PAGE_MARGIN_MM + (contentW - w) / 2;
      drawImage(block.canvas, x, ctx.y, w, h);
      ctx.y += h + BLOCK_GAP_MM;
    }

    i += pair.length;
  }
}

/**
 * One Download PDF: Curriculum simulation + Subjects to take (when available).
 */
export async function downloadGuestSimulationPdfs(opts) {
  const {
    guestName = '',
    institution = 'Cagayan de Oro College — PHINMA Education',
    curriculumLabel = '',
    programLabel = '',
    simulation,
    subjectsToTake = null,
  } = opts;

  const base = guestPdfFileBase(guestName);
  const filename = base
    ? `curriculum-simulation-${base}.pdf`
    : 'curriculum-simulation.pdf';

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ctx = {
    pageW,
    pageH,
    contentW: pageW - PAGE_MARGIN_MM * 2,
    contentH: pageH - PAGE_MARGIN_MM * 2,
    pageStarted: false,
    y: PAGE_MARGIN_MM,
    yearsOnPage: 0,
    headerOnThisPage: false,
  };

  const simYears = simulation?.years || [];
  await appendYearContainersToPdf(pdf, ctx, {
    headerHtml: `
      ${metaHeaderHtml({
        institution,
        guestName,
        curriculumLabel,
        programLabel,
        stats: simulation?.stats || [],
      })}
      <div style="height:10px;"></div>
      ${simulationShellOpen(curriculumLabel)}
    `,
    yearHtmls:
      simYears.length > 0
        ? simYears.map((y) => buildSimulationYearHtml(y))
        : [
            `<div style="padding:16px;color:#64748b;font-size:12px;background:#fff;border-radius:10px;">No courses match the selected filters.</div>`,
          ],
  });

  if (subjectsToTake) {
    const takeYears = subjectsToTake.years || [];
    await appendYearContainersToPdf(pdf, ctx, {
      headerHtml: `
        ${metaHeaderHtml({
          institution,
          guestName,
          curriculumLabel,
          programLabel,
          stats: subjectsToTake.stats || [],
        })}
        <div style="margin-top:10px;background:#fff;border:1px solid rgba(46, 125, 50,0.15);border-radius:12px;padding:12px 14px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#1b5e20;">Subjects to take</div>
          <div style="margin-top:4px;font-size:18px;font-weight:800;color:#1b5e20;">Remaining subjects</div>
          <div style="margin-top:4px;font-size:11px;color:#64748b;">Credited subjects are hidden — same plan as the Subjects to take tab.</div>
          ${
            subjectsToTake.standingNote
              ? `<div style="margin-top:6px;font-size:10px;color:#475569;">${esc(subjectsToTake.standingNote)}</div>`
              : ''
          }
        </div>
      `,
      yearHtmls:
        takeYears.length > 0
          ? takeYears.map((y) => buildPlannerYearHtml(y))
          : [
              `<div style="padding:16px;color:#64748b;font-size:12px;background:#fff;border-radius:10px;">No remaining subjects.</div>`,
            ],
    });
  }

  if (!ctx.pageStarted) {
    pdf.setFontSize(12);
    pdf.text('No courses to show.', PAGE_MARGIN_MM, PAGE_MARGIN_MM + 10);
  }

  pdf.save(filename);
  return {
    count: subjectsToTake ? 2 : 1,
    file: filename,
    includesSubjectsToTake: Boolean(subjectsToTake),
  };
}
