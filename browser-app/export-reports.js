/**
 * Branded exports — school name / class from window.KV_SCHOOL_NAME and window.KV_SCHOOL_CLASS
 * (set in sheets-webapp-config.js). Match CONFIG.SCHOOL_NAME / SCHOOL_CLASS in Apps Script.
 */
(function (global) {
  function getSchoolName() {
    var s = global.KV_SCHOOL_NAME != null ? String(global.KV_SCHOOL_NAME).trim() : "";
    return s || "School name";
  }

  /** Subtitle prefix before report title; empty if class not set. */
  function getClassSubtitlePrefix() {
    var c = global.KV_SCHOOL_CLASS != null ? String(global.KV_SCHOOL_CLASS).trim() : "";
    if (!c || c === "—") return "";
    return c + " — ";
  }

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
      schoolRow.push(i === 0 ? getSchoolName() : "");
      subRow.push(i === 0 ? getClassSubtitlePrefix() + title : "");
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
    doc.text(getSchoolName(), pageW / 2, margin, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(SUBTITLE_RGB[0], SUBTITLE_RGB[1], SUBTITLE_RGB[2]);
    doc.text(getClassSubtitlePrefix() + title, pageW / 2, margin + 7, { align: "center" });
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
        doc.text(getSchoolName(), pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
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

  /**
   * Duplicate mark slips on one A4 portrait: vertical centre line, left half + right half (same as before).
   * Scales table/header fonts so header + table + signatures never spill to page 2; horizontalPageBreak off.
   */
  function downloadMarksSlipPdf(meta, rows) {
    if (!rows || !rows.length) {
      alert("No students to include on the marks slip.");
      return;
    }
    var JsPDF = getJsPDFConstructor();
    if (!JsPDF) {
      alert(
        "PDF engine not found. Ensure vendor/jspdf.umd.min.js and vendor/jspdf.plugin.autotable.min.js are next to index.html, then refresh."
      );
      return;
    }
    ensureAutoTablePlugin();
    var doc = new JsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var margin = 5;
    var gutter = 4;
    var midX = pageW / 2;
    var leftEnd = midX - gutter / 2;
    var rightStart = midX + gutter / 2;
    var leftCenter = (margin + leftEnd) / 2;
    var rightCenter = (rightStart + pageW - margin) / 2;
    var leftContentW = leftEnd - margin;
    var rightContentW = pageW - margin - rightStart;
    var clOnly = global.KV_SCHOOL_CLASS != null ? String(global.KV_SCHOOL_CLASS).trim() : "";
    if (!clOnly || clOnly === "—") clOnly = "";
    var subTitle = clOnly ? "Marks statement — " + clOnly : "Marks statement";

    var subj = String(meta.subject || "—");
    var ex = String(meta.examName || "—");
    var dt = String(meta.examDateDisplay || "—");
    var mx = String(meta.maxMarks);
    var te = String(meta.teacherName || "—");
    var metaLines = [
      "Subject: " + subj,
      "Exam: " + ex,
      "Date: " + dt,
      "Max marks: " + mx,
      "Teacher: " + te,
    ];

    var head5 = [["Roll No.", "Name", "Marks", "Max", "%"]];
    var body5 = [];
    for (var ri = 0; ri < rows.length; ri++) {
      var r = rows[ri];
      body5.push([
        String(r.roll || "—"),
        String(r.name || "—"),
        String(r.marksDisplay || "—"),
        String(meta.maxMarks),
        String(r.pctDisplay || "—"),
      ]);
    }
    var n = body5.length;
    var RESERVE_BELOW_TABLE = 10.2;
    var GAP_AFTER_TABLE = 1.6;
    var yTop = margin + 3;

    function buildScaleFromFs(fs) {
      return {
        fontSize: fs,
        headFontSize: Math.min(fs + 0.65, 9),
        cellPadding: Math.max(0.22, Math.min(1.28, fs * 0.135)),
        minCellHeight: Math.max(3.35, Math.min(7.1, fs * 0.94)),
        titleFs: Math.max(7.6, Math.min(10.2, fs + 2.05)),
        subFs: Math.max(6.6, Math.min(8.8, fs + 0.9)),
        metaFs: Math.max(5.35, Math.min(7.1, fs - 0.38)),
        metaLineGap: Math.max(2.2, Math.min(3.45, fs * 0.41)),
      };
    }

    function headerHeightMm(scale) {
      return (
        yTop -
        margin +
        scale.titleFs * 0.35 +
        1.2 +
        scale.subFs * 0.35 +
        2.2 +
        metaLines.length * scale.metaLineGap +
        2
      );
    }

    function tableBlockEstimateMm(fs, numRows) {
      var scale = buildScaleFromFs(fs);
      var pad = scale.cellPadding;
      var minH = scale.minCellHeight;
      var hHead = minH * 1.08 + pad * 2.1;
      var hRow = minH + pad * 0.85;
      return hHead + numRows * hRow * 1.1;
    }

    function totalColumnHeightMm(fs, numRows) {
      var scale = buildScaleFromFs(fs);
      return headerHeightMm(scale) + tableBlockEstimateMm(fs, numRows) + RESERVE_BELOW_TABLE;
    }

    var usableH = pageH - 2 * margin;
    var inner = (usableH - RESERVE_BELOW_TABLE - 2) * 0.88;
    if (inner < 22) inner = 22;
    var lo = 5.0;
    var hi = 9.35;
    var bi;
    for (bi = 0; bi < 22; bi++) {
      var mid = (lo + hi) / 2;
      if (totalColumnHeightMm(mid, n) <= inner) lo = mid;
      else hi = mid;
    }
    var scale = buildScaleFromFs(lo);

    function drawCenteredMeta(cx, y0, maxW, scaleObj) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(scaleObj.metaFs);
      doc.setTextColor(0, 0, 0);
      var yy = y0;
      var li;
      for (li = 0; li < metaLines.length; li++) {
        doc.text(metaLines[li], cx, yy, { align: "center", maxWidth: maxW });
        yy += scaleObj.metaLineGap;
      }
      return yy;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(scale.titleFs);
    doc.setTextColor(0, 51, 102);
    doc.text(getSchoolName(), leftCenter, yTop, { align: "center", maxWidth: leftContentW - 1 });
    doc.text(getSchoolName(), rightCenter, yTop, { align: "center", maxWidth: rightContentW - 1 });
    doc.setFontSize(scale.subFs);
    doc.setTextColor(SUBTITLE_RGB[0], SUBTITLE_RGB[1], SUBTITLE_RGB[2]);
    doc.text(subTitle, leftCenter, yTop + scale.titleFs * 0.35 + 1.2, {
      align: "center",
      maxWidth: leftContentW - 2,
    });
    doc.text(subTitle, rightCenter, yTop + scale.titleFs * 0.35 + 1.2, {
      align: "center",
      maxWidth: rightContentW - 2,
    });

    var yMeta = yTop + scale.titleFs * 0.35 + 1.2 + scale.subFs * 0.35 + 2.2;
    var yAfterLeftMeta = drawCenteredMeta(leftCenter, yMeta, leftContentW - 2, scale);
    var yAfterRightMeta = drawCenteredMeta(rightCenter, yMeta, rightContentW - 2, scale);
    var tableStartY = Math.max(yAfterLeftMeta, yAfterRightMeta) + 2;

    var tableBottomLimit = pageH - margin - RESERVE_BELOW_TABLE;
    var marginBottomMm = pageH - tableBottomLimit;

    var rollW = 13;
    var marksW = 11;
    var maxW = 11;
    var pctW = 11;
    var nameWLeft = Math.max(14, leftContentW - rollW - marksW - maxW - pctW);
    var nameWRight = Math.max(14, rightContentW - rollW - marksW - maxW - pctW);

    var tableCommon = {
      head: head5,
      body: body5,
      theme: "grid",
      styles: {
        fontSize: scale.fontSize,
        cellPadding: scale.cellPadding,
        minCellHeight: scale.minCellHeight,
        valign: "middle",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: MAROON,
        textColor: 255,
        fontStyle: "bold",
        fontSize: scale.headFontSize,
        halign: "center",
        valign: "middle",
      },
      horizontalPageBreak: false,
      didDrawPage: function () {
        doc.setDrawColor(190);
        doc.setLineWidth(0.35);
        doc.line(midX, margin + 1, midX, pageH - margin - 1);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(Math.max(5, scale.metaFs - 0.5));
        doc.setTextColor(128);
        doc.text(getSchoolName(), leftCenter, pageH - 4, { align: "center", maxWidth: leftContentW - 2 });
        doc.text(getSchoolName(), rightCenter, pageH - 4, { align: "center", maxWidth: rightContentW - 2 });
        doc.setTextColor(0);
      },
    };

    var leftOpts = Object.assign({}, tableCommon, {
      startY: tableStartY,
      margin: { left: margin, right: pageW - leftEnd, bottom: marginBottomMm },
      tableWidth: leftContentW,
      columnStyles: {
        0: { halign: "center", cellWidth: rollW },
        1: { cellWidth: nameWLeft, halign: "left", valign: "top" },
        2: { halign: "center", cellWidth: marksW },
        3: { halign: "center", cellWidth: maxW },
        4: { halign: "center", cellWidth: pctW },
      },
    });

    var rightOpts = Object.assign({}, tableCommon, {
      startY: tableStartY,
      margin: { left: rightStart, right: margin, bottom: marginBottomMm },
      tableWidth: rightContentW,
      columnStyles: {
        0: { halign: "center", cellWidth: rollW },
        1: { cellWidth: nameWRight, halign: "left", valign: "top" },
        2: { halign: "center", cellWidth: marksW },
        3: { halign: "center", cellWidth: maxW },
        4: { halign: "center", cellWidth: pctW },
      },
    });

    if (!runAutoTable(doc, leftOpts)) {
      alert(
        "PDF table plugin did not load. Ensure vendor/jspdf.plugin.autotable.min.js loads after jspdf.umd.min.js, then refresh."
      );
      return;
    }
    var yLeft = doc.lastAutoTable && doc.lastAutoTable.finalY != null ? doc.lastAutoTable.finalY : tableStartY;

    if (typeof doc.setPage === "function") doc.setPage(1);
    if (!runAutoTable(doc, rightOpts)) {
      return;
    }
    var yRight = doc.lastAutoTable && doc.lastAutoTable.finalY != null ? doc.lastAutoTable.finalY : tableStartY;

    var finalY = Math.max(yLeft, yRight) + GAP_AFTER_TABLE;
    var sigY = finalY;
    var sigMax = pageH - margin - RESERVE_BELOW_TABLE + 2;
    if (sigY > sigMax) sigY = sigMax;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(Math.max(5, scale.fontSize - 0.6));
    doc.setTextColor(0, 0, 0);
    var labels = ["Subject teacher", "Exam. I/C", "Principal"];
    var lw = leftEnd - margin - 2;
    var rw = pageW - margin - rightStart - 2;
    var c;
    for (c = 0; c < 3; c++) {
      var xl = margin + 1 + (lw * c) / 3 + lw / 6;
      doc.text("_____________", xl, sigY, { align: "center" });
      doc.text(labels[c], xl, sigY + 3.5, { align: "center" });
    }
    var c2;
    for (c2 = 0; c2 < 3; c2++) {
      var xr = rightStart + 1 + (rw * c2) / 3 + rw / 6;
      doc.text("_____________", xr, sigY, { align: "center" });
      doc.text(labels[c2], xr, sigY + 3.5, { align: "center" });
    }

    var part =
      safeFilePart(meta.subject) +
      "_" +
      safeFilePart(meta.examName) +
      "_" +
      safeFilePart(meta.examDateDisplay || "slip");
    var pdfName = "KV_MarksSlip_" + part + ".pdf";
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
    downloadMarksSlipPdf: downloadMarksSlipPdf,
    safeFilePart: safeFilePart,
    getSchoolName: getSchoolName,
    getClassSubtitlePrefix: getClassSubtitlePrefix,
  };
})(typeof window !== "undefined" ? window : this);
