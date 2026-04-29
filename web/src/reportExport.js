import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const SCHOOL = "Kendriya Vidyalaya NIT Agartala";
const CLASS_PREFIX = "Class VI - ";
const MAROON = [107, 28, 46];
const SUBTITLE_RGB = [217, 48, 37];
const DOWNLOADED_POPUP_MSG = "Downloaded \uD83D\uDE0A";

function notifyDownloadedPopup() {
  if (typeof window !== "undefined" && typeof window.KV_showOkDialog === "function") {
    window.KV_showOkDialog(DOWNLOADED_POPUP_MSG);
  } else if (typeof window !== "undefined") {
    window.alert(DOWNLOADED_POPUP_MSG);
  }
}

export function safeFilePart(title) {
  const t = (title || "Student_Report").toString().replace(/["']/g, "").trim();
  const cleaned = t.replace(/[^\w\u0900-\u097F\- ]+/g, "").replace(/\s+/g, "_");
  return cleaned || "Report";
}

export function padRectangular(data) {
  if (!data?.length) return [];
  let ncol = 0;
  for (const row of data) ncol = Math.max(ncol, row.length);
  return data.map((row) => {
    const r = row ? [...row] : [];
    while (r.length < ncol) r.push("");
    return r.map((c) => (c == null ? "" : String(c)));
  });
}

function buildAoA(title, data) {
  const rows = padRectangular(data);
  if (!rows.length) return { aoa: [], ncol: 0 };
  const ncol = rows[0].length;
  const schoolRow = Array(ncol)
    .fill("")
    .map((_, i) => (i === 0 ? SCHOOL : ""));
  const subRow = Array(ncol)
    .fill("")
    .map((_, i) => (i === 0 ? CLASS_PREFIX + title : ""));
  const blank = Array(ncol).fill("");
  const aoa = [schoolRow, subRow, blank, ...rows];
  return { aoa, ncol };
}

export function downloadReportExcel(title, data) {
  const packed = buildAoA(title, data);
  if (!packed.ncol) return;
  const ws = XLSX.utils.aoa_to_sheet(packed.aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: packed.ncol - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: packed.ncol - 1 } },
  ];
  const wch = [];
  for (let c = 0; c < packed.ncol; c++) {
    let max = 10;
    for (let r = 0; r < packed.aoa.length; r++) {
      const cell = packed.aoa[r][c];
      const len = cell ? String(cell).length : 0;
      if (len > max) max = len;
    }
    wch.push({ wch: Math.min(48, Math.max(8, max + 2)) });
  }
  ws["!cols"] = wch;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `KV_Report_${safeFilePart(title)}.xlsx`);
  notifyDownloadedPopup();
}

export function downloadReportPdf(title, data) {
  const rows = padRectangular(data);
  if (!rows.length) return;
  const headers = rows[0];
  const body = rows.slice(1);
  const landscape = headers.length > 7;
  const doc = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0, 51, 102);
  doc.text(SCHOOL, pageW / 2, margin, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(SUBTITLE_RGB[0], SUBTITLE_RGB[1], SUBTITLE_RGB[2]);
  doc.text(CLASS_PREFIX + title, pageW / 2, margin + 7, { align: "center" });
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: margin + 14,
    head: [headers],
    body,
    theme: "grid",
    styles: {
      fontSize: landscape ? 6 : 7,
      cellPadding: 1.2,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: MAROON,
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
    },
    alternateRowStyles: { fillColor: [252, 248, 245] },
    margin: { left: margin, right: margin },
    tableWidth: "auto",
    horizontalPageBreak: true,
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(128);
      doc.text(SCHOOL, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
      doc.setTextColor(0);
    },
  });

  doc.save(`KV_Report_${safeFilePart(title)}.pdf`);
  notifyDownloadedPopup();
}
