/**
 * Branded exports matching Google Apps Script ReportPopup / handleExportRequest layout:
 * — Row 1: Kendriya Vidyalaya NIT Agartala (merged)
 * — Row 2: Class VI - {title} (merged), accent colour
 * — Blank row, then header + data (text as in sheet; empty cells stay empty)
 */
(function (global) {
  var SCHOOL = "Kendriya Vidyalaya NIT Agartala";
  var CLASS_PREFIX = "Class VI - ";

  /** KVS-style maroon (RGB) for PDF table header — aligns with sangathan branding */
  var MAROON = [107, 28, 46];
  var SUBTITLE_RGB = [217, 48, 37];

  function safeFilePart(title) {
    var t = (title || "Student_Report").toString().replace(/["']/g, "").trim();
    return t.replace(/[^\w\u0900-\u097F\- ]+/g, "").replace(/\s+/g, "_") || "Report";
  }

  function padRectangular(data) {
    if (!data || !data.length) return [];
    var ncol = 0;
    for (var i = 0; i < data.length; i++) ncol = Math.max(ncol, data[i].length);
    return data.map(function (row) {
      var r = row ? row.slice() : [];
      while (r.length < ncol) r.push("");
      return r.map(function (c) {
        if (c == null) return "";
        return String(c);
      });
    });
  }

  function uint8ToBase64(u8) {
    var CHUNK = 0x8000;
    var i;
    var binary = "";
    for (i = 0; i < u8.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  function buildAoA(title, data) {
    var rows = padRectangular(data);
    if (!rows.length) return { aoa: [], ncol: 0 };
    var ncol = rows[0].length;
    var schoolRow = [];
    var subRow = [];
    var blank = [];
    for (var i = 0; i < ncol; i++) {
      schoolRow.push(i === 0 ? SCHOOL : "");
      subRow.push(i === 0 ? CLASS_PREFIX + title : "");
      blank.push("");
    }
    var aoa = [schoolRow, subRow, blank].concat(rows);
    return { aoa: aoa, ncol: ncol };
  }

  function downloadExcel(title, data) {
    if (typeof XLSX === "undefined") {
      alert("Excel library not found. Ensure vendor/xlsx.full.min.js is present next to index.html, then refresh.");
      return;
    }
    var packed = buildAoA(title, data);
    if (!packed.ncol) return;
    var ws = XLSX.utils.aoa_to_sheet(packed.aoa);
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: packed.ncol - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: packed.ncol - 1 } },
    ];
    var wch = [];
    for (var c = 0; c < packed.ncol; c++) {
      var max = 10;
      for (var r = 0; r < packed.aoa.length; r++) {
        var cell = packed.aoa[r][c];
        var len = cell ? String(cell).length : 0;
        if (len > max) max = len;
      }
      wch.push({ wch: Math.min(48, Math.max(8, max + 2)) });
    }
    ws["!cols"] = wch;
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    var fname = "KV_Report_" + safeFilePart(title) + ".xlsx";
    if (typeof AndroidExport !== "undefined" && AndroidExport.saveFile) {
      try {
        var wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        AndroidExport.saveFile(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          fname,
          uint8ToBase64(new Uint8Array(wbout))
        );
      } catch (e) {
        alert("Excel save failed: " + (e && e.message ? e.message : String(e)));
      }
      return;
    }
    XLSX.writeFile(wb, fname);
  }

  function getJsPDFConstructor() {
    if (global.jspdf && global.jspdf.jsPDF) return global.jspdf.jsPDF;
    if (typeof global.jsPDF === "function") return global.jsPDF;
    return null;
  }

  /** jsPDF-AutoTable UMD often skips auto-register when require() is missing; attach explicitly. */
  function ensureAutoTablePlugin() {
    try {
      var J = getJsPDFConstructor();
      if (J && typeof global.applyPlugin === "function" && typeof J.API.autoTable !== "function") {
        global.applyPlugin(J);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function runAutoTable(doc, tableOpts) {
    ensureAutoTablePlugin();
    if (typeof doc.autoTable === "function") {
      doc.autoTable(tableOpts);
      return true;
    }
    if (typeof global.autoTable === "function") {
      global.autoTable(doc, tableOpts);
      return true;
    }
    return false;
  }

  function downloadPdf(title, data) {
    var rows = padRectangular(data);
    if (!rows.length) return;
    var headers = rows[0];
    var body = rows.slice(1);
    var ncol = headers.length;
    for (var bi = 0; bi < body.length; bi++) {
      var br = body[bi].slice();
      while (br.length < ncol) br.push("");
      body[bi] = br;
    }
    var JsPDF = getJsPDFConstructor();
    if (!JsPDF) {
      alert(
        "PDF engine not found. Ensure vendor/jspdf.umd.min.js and vendor/jspdf.plugin.autotable.min.js are next to index.html, then refresh."
      );
      return;
    }
    ensureAutoTablePlugin();
    var landscape = headers.length > 7;
    var doc = new JsPDF({
      orientation: landscape ? "landscape" : "portrait",
      unit: "mm",
      format: "a4",
    });
    var pageW = doc.internal.pageSize.getWidth();
    var margin = 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0, 51, 102);
    doc.text(SCHOOL, pageW / 2, margin, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(SUBTITLE_RGB[0], SUBTITLE_RGB[1], SUBTITLE_RGB[2]);
    doc.text(CLASS_PREFIX + title, pageW / 2, margin + 7, { align: "center" });
    doc.setTextColor(0, 0, 0);
    var startY = margin + 14;

    var tableOpts = {
      startY: startY,
      head: [headers],
      body: body,
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
      didDrawPage: function () {
        doc.setFontSize(8);
        doc.setTextColor(128);
        doc.text(
          "Kendriya Vidyalaya NIT Agartala",
          pageW / 2,
          doc.internal.pageSize.getHeight() - 8,
          { align: "center" }
        );
        doc.setTextColor(0);
      },
    };

    if (!runAutoTable(doc, tableOpts)) {
      alert(
        "PDF table plugin did not load. Ensure vendor/jspdf.plugin.autotable.min.js loads after jspdf.umd.min.js, then refresh."
      );
      return;
    }

    var pdfName = "KV_Report_" + safeFilePart(title) + ".pdf";
    if (typeof AndroidExport !== "undefined" && AndroidExport.saveFile) {
      try {
        var dataUri = doc.output("datauristring");
        var comma = dataUri.indexOf(",");
        var b64 = comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
        AndroidExport.saveFile("application/pdf", pdfName, b64);
      } catch (e) {
        alert("PDF save failed: " + (e && e.message ? e.message : String(e)));
      }
      return;
    }
    doc.save(pdfName);
  }

  global.KVReports = {
    padRectangular: padRectangular,
    downloadExcel: downloadExcel,
    downloadPdf: downloadPdf,
    safeFilePart: safeFilePart,
    SCHOOL: SCHOOL,
    CLASS_PREFIX: CLASS_PREFIX,
  };
})(typeof window !== "undefined" ? window : this);
