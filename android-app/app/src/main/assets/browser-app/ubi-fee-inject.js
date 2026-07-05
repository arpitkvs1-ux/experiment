/**
 * UBI KV fee portal injection — login prefill (manual captcha) + table extraction.
 */
(function (global) {
  "use strict";

  function setInputValue(el, value, opts) {
    if (!el) return false;
    opts = opts || {};
    var v = String(value == null ? "" : value);
    if (String(el.value || "") === v) return true;
    try {
      var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      if (desc && desc.set) desc.set.call(el, v);
      else el.value = v;
    } catch (_e0) {
      el.value = v;
    }
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (_e1) {}
    return true;
  }

  function normHeader(v) {
    return String(v || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function findColumnIndex(table, labels) {
    if (!table) return -1;
    var headers = table.querySelectorAll("thead th, thead td, tr th");
    if (!headers.length) {
      var first = table.querySelector("tr");
      if (first) headers = first.querySelectorAll("th, td");
    }
    var i;
    for (i = 0; i < headers.length; i++) {
      var h = normHeader(headers[i].textContent);
      if (!h) continue;
      var j;
      for (j = 0; j < labels.length; j++) {
        if (h === labels[j] || h.indexOf(labels[j]) >= 0) return i;
      }
    }
    return -1;
  }

  function cellText(row, idx) {
    if (idx < 0 || !row) return "";
    var cells = row.querySelectorAll("td, th");
    if (!cells[idx]) return "";
    return String(cells[idx].textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isCaptchaActive() {
    var inputs = document.querySelectorAll("input[type='text'], input:not([type])");
    var i;
    for (i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      if (!isCaptchaInput(el)) continue;
      if (document.activeElement === el) return true;
      if (String(el.value || "").trim().length > 0) return true;
    }
    return false;
  }

  function isCaptchaInput(el) {
    if (!el) return false;
    var hint = (
      String(el.name || "") +
      " " +
      String(el.id || "") +
      " " +
      String(el.placeholder || "")
    ).toLowerCase();
    return hint.indexOf("captcha") >= 0 || hint.indexOf("capcha") >= 0 || hint.indexOf("enter text") >= 0;
  }

  function isLoginSubmitInput(el) {
    if (!el) return false;
    var type = String(el.type || "").toLowerCase();
    return type === "submit" || type === "button" || type === "image";
  }

  function findUserFieldNearPassword(pass) {
    if (!pass) return null;
    var scope = pass.closest("form") || document;
    var inputs = scope.querySelectorAll("input");
    var i;
    for (i = 0; i < inputs.length; i++) {
      if (inputs[i] !== pass) continue;
      var j;
      for (j = i - 1; j >= 0; j--) {
        var el = inputs[j];
        if (String(el.type || "").toLowerCase() !== "text") continue;
        if (isCaptchaInput(el) || isLoginSubmitInput(el)) continue;
        return el;
      }
      break;
    }
    var texts = scope.querySelectorAll('input[type="text"]');
    for (i = 0; i < texts.length; i++) {
      if (!isCaptchaInput(texts[i]) && !isLoginSubmitInput(texts[i])) return texts[i];
    }
    return null;
  }

  function findLoginFields() {
    var pass =
      document.querySelector("input#txtPwd") ||
      document.querySelector('input[name="txtPwd"]') ||
      document.querySelector('input[type="password"]') ||
      document.querySelector('input[name*="pwd" i]') ||
      document.querySelector('input[name*="pass" i]') ||
      document.querySelector('input[id*="pass" i]');
    var user =
      document.querySelector("input#txtUserId") ||
      document.querySelector('input[name="txtUserId"]') ||
      document.querySelector('input[name*="userid" i]') ||
      document.querySelector('input[id*="userid" i]') ||
      findUserFieldNearPassword(pass);
    if (user && (isCaptchaInput(user) || isLoginSubmitInput(user))) user = findUserFieldNearPassword(pass);
    if (pass && user === pass) user = findUserFieldNearPassword(pass);
    return { user: user, pass: pass };
  }

  function findLoginButton() {
    return (
      document.querySelector("#BtnLogin") ||
      document.querySelector('input[name="BtnLogin"]') ||
      document.querySelector('input[type="submit"][value*="log in" i]') ||
      document.querySelector('button[id*="login" i]')
    );
  }

  function runPageLoginEncryptHandlers(passField, plainPassword) {
    if (passField && plainPassword) setInputValue(passField, plainPassword, { focus: false });
    var g = global;
    var names = [
      "encryptPassword",
      "EncryptPassword",
      "encryptPwd",
      "EncryptPwd",
      "validateLogin",
      "ValidateLogin",
      "LoginValidation",
      "btnLogin_Click",
      "fnValidate",
      "ValidateUser",
      "encryptLoginPassword",
      "EncryptLoginPassword",
    ];
    var i;
    for (i = 0; i < names.length; i++) {
      if (typeof g[names[i]] === "function") {
        try {
          g[names[i]]();
        } catch (_e) {}
      }
    }
  }

  function triggerLoginButtonClick(btn) {
    if (!btn) return false;
    var onclickAttr = btn.getAttribute && btn.getAttribute("onclick");
    if (typeof btn.onclick === "function") {
      try {
        var ok = btn.onclick.call(btn);
        if (ok === false) return false;
      } catch (_e0) {}
    }
    if (onclickAttr) {
      try {
        (new Function("event", onclickAttr)).call(btn, {
          preventDefault: function () {},
          stopPropagation: function () {},
          returnValue: true,
        });
      } catch (_e1) {}
    }
    try {
      btn.click();
      return true;
    } catch (_e2) {
      try {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        return true;
      } catch (_e3) {}
    }
    return false;
  }

  function submitUbiLoginForm(creds) {
    creds = creds || global.__kvUbiPendingCreds || {};
    var cap = findCaptchaField();
    var capVal = String(cap && cap.value ? cap.value : "").trim();
    if (capVal.length < 5) return false;
    var fields = findLoginFields();
    var user = String(creds.username || "");
    var pass = String(creds.password || "");
    setInputValue(fields.user, user, { focus: false });
    setInputValue(fields.pass, pass, { focus: false });
    runPageLoginEncryptHandlers(fields.pass, pass);
    return triggerLoginButtonClick(findLoginButton());
  }

  function loginPage(creds) {
    creds = creds || {};
    global.__kvUbiPendingCreds = creds;
    var cap = findCaptchaField();
    bindUbiCaptchaAutoSubmit(cap, creds);
    if (isCaptchaActive()) {
      if (cap) focusCaptchaField(cap);
      return { ok: true, step: "login", skipped: true, message: "Captcha in progress." };
    }
    var fields = findLoginFields();
    var userOk = setInputValue(fields.user, String(creds.username || ""), { focus: false });
    if (cap) focusCaptchaField(cap);
    return {
      ok: userOk,
      step: "login",
      message: userOk
        ? "Login ID filled. Type 5-letter captcha — password encrypts on sign in."
        : "Login ID field not found on UBI login page.",
    };
  }

  function focusCaptchaField(cap) {
    cap = cap || findCaptchaField();
    if (!cap) return false;
    try {
      cap.focus();
    } catch (_e0) {}
    try {
      if (typeof cap.select === "function") cap.select();
    } catch (_e1) {}
    return true;
  }

  function findCaptchaField() {
    return (
      document.querySelector("#txtCapcha") ||
      document.querySelector('input[name="txtCapcha"]') ||
      document.querySelector('input[id*="capcha" i]') ||
      document.querySelector('input[name*="captcha" i]')
    );
  }

  function bindUbiCaptchaAutoSubmit(cap, creds) {
    if (!cap || cap.__kvUbiCaptchaBound) return;
    cap.__kvUbiCaptchaBound = true;
    function trySubmit() {
      var v = String(cap.value || "").trim();
      if (v.length < 5) return;
      if (global.__kvUbiLoginSubmitted) return;
      global.__kvUbiLoginSubmitted = true;
      setTimeout(function () {
        submitUbiLoginForm(creds || global.__kvUbiPendingCreds || {});
      }, 450);
    }
    cap.addEventListener("input", trySubmit, { passive: true });
  }

  function isJunkText(v) {
    var s = String(v || "");
    if (s.length > 120) return true;
    return /microsoft\.reporting|reportviewer|font-family|stylesheet|\.glyphui|reserved\.report|webforms|signout|change password|@font-face/i.test(
      s
    );
  }

  function isValidStudentName(name) {
    var s = String(name || "").replace(/\s+/g, " ").trim();
    if (s.length < 3 || s.length > 70) return false;
    if (isJunkText(s)) return false;
    if (/^(name|student|sr|s\.?\s*no|total|date|fee|report|section|class)/i.test(s) && s.length < 24) return false;
    if (/^\d+(\.\d+)?$/.test(s)) return false;
    return /[a-zA-Z]{2,}/.test(s);
  }

  function rowKey(r) {
    return String(r.srNo || "") + "|" + String(r.studentName || "").toLowerCase();
  }

  function mergeReportRows(existing, add) {
    var seen = {};
    var out = Array.isArray(existing) ? existing.slice() : [];
    var i;
    for (i = 0; i < out.length; i++) seen[rowKey(out[i])] = true;
    if (!Array.isArray(add)) return out;
    for (i = 0; i < add.length; i++) {
      var r = add[i];
      if (!r) continue;
      if (!isValidStudentName(r.studentName) && !String(r.srNo || "").match(/^\d+$/)) continue;
      var k = rowKey(r);
      if (seen[k]) continue;
      seen[k] = true;
      out.push(r);
    }
    return out;
  }

  function findHeaderMap(table, fieldLabels) {
    if (!table || !fieldLabels) return null;
    var rows = table.querySelectorAll("tr");
    var ri;
    for (ri = 0; ri < rows.length; ri++) {
      var cells = rows[ri].querySelectorAll("td, th");
      if (!cells.length) continue;
      var indices = {};
      var matchCount = 0;
      var usedCols = {};
      var fk;
      for (fk in fieldLabels) {
        if (!fieldLabels.hasOwnProperty(fk)) continue;
        indices[fk] = -1;
        var labels = fieldLabels[fk];
        var ci;
        for (ci = 0; ci < cells.length; ci++) {
          if (usedCols[ci]) continue;
          var h = normHeader(cells[ci].textContent);
          if (!h) continue;
          var li;
          for (li = 0; li < labels.length; li++) {
            if (h === labels[li] || h.indexOf(labels[li]) >= 0 || labels[li].indexOf(h) >= 0) {
              indices[fk] = ci;
              usedCols[ci] = true;
              matchCount++;
              break;
            }
          }
          if (indices[fk] >= 0) break;
        }
      }
      if (matchCount >= 2 && (indices.studentName >= 0 || indices.srNo >= 0)) {
        return { headerRow: ri, indices: indices, matchCount: matchCount };
      }
    }
    return null;
  }

  function extractRowsFromReportTable(table, fieldLabels) {
    var header = findHeaderMap(table, fieldLabels);
    if (!header) return [];
    var out = [];
    var rows = table.querySelectorAll("tr");
    var ri;
    for (ri = header.headerRow + 1; ri < rows.length; ri++) {
      var cells = rows[ri].querySelectorAll("td, th");
      if (!cells.length) continue;
      var item = {};
      var fk;
      for (fk in header.indices) {
        if (!header.indices.hasOwnProperty(fk)) continue;
        var ci = header.indices[fk];
        item[fk] = ci >= 0 && cells[ci] ? String(cells[ci].textContent || "").replace(/\s+/g, " ").trim() : "";
      }
      if (!isValidStudentName(item.studentName) && !/^\d+$/.test(String(item.srNo || ""))) continue;
      if (Object.keys(item).some(function (k) { return isJunkText(item[k]); })) continue;
      out.push(item);
    }
    return out;
  }

  function findReportDataTables(fieldLabels) {
    var roots = document.querySelectorAll('[id*="ReportViewer"], [class*="ReportViewer"]');
    var tables = [];
    var i;
    for (i = 0; i < roots.length; i++) {
      tables = tables.concat(Array.prototype.slice.call(roots[i].querySelectorAll("table")));
    }
    if (!tables.length) tables = Array.prototype.slice.call(document.querySelectorAll("table"));
    var best = [];
    var ti;
    for (ti = 0; ti < tables.length; ti++) {
      var chunk = extractRowsFromReportTable(tables[ti], fieldLabels);
      if (chunk.length > best.length) best = chunk;
    }
    return best;
  }

  function findReportViewerRoot() {
    return (
      document.querySelector('[id*="ReportViewer"]') ||
      document.querySelector('[class*="ReportViewer"]')
    );
  }

  function reportPageCounts() {
    var root = findReportViewerRoot();
    if (!root) return { current: 0, total: 0 };
    var text = String(root.innerText || "");
    var m = text.match(/(\d*)\s+of\s+(\d+)/i);
    if (!m) return { current: 0, total: 0 };
    return { current: parseInt(m[1], 10) || 0, total: parseInt(m[2], 10) || 0 };
  }

  function reportHasPages() {
    return reportPageCounts().total > 0;
  }

  function reportViewerNextPageEnabled() {
    var root = findReportViewerRoot();
    if (!root) return false;
    var counts = reportPageCounts();
    if (counts.current >= counts.total) return false;
    var next =
      root.querySelector('a[title="Next Page"]') ||
      root.querySelector('input[title="Next Page"]') ||
      root.querySelector('img[alt="Next Page"]');
    if (!next) return false;
    var el = next.closest("a") || next;
    if (el.disabled) return false;
    if (/disabled/i.test(String(el.className || ""))) return false;
    return true;
  }

  function clickReportNextPage() {
    var root = findReportViewerRoot();
    if (!root) return false;
    var next =
      root.querySelector('a[title="Next Page"]') ||
      root.querySelector('input[title="Next Page"]');
    if (next) {
      try {
        next.click();
        return true;
      } catch (_e) {}
    }
    var img = root.querySelector('img[alt="Next Page"]');
    if (img) {
      var link = img.closest("a");
      if (link) {
        try {
          link.click();
          return true;
        } catch (_e2) {}
      }
    }
    return false;
  }

  var RECEIPT_FIELD_LABELS = {
    srNo: ["sr. no", "sr no", "s. no", "s no", "serial"],
    studentName: ["name of student", "student name", "name of student"],
    dateReceipt: ["date of receipt by ubi", "date of receipt"],
    feePaid: ["total quarterly fee actually paid", "total quarterly fee payable", "fee actually paid"],
    lateFine: ["late payment fine", "late payment fine, if any", "late payment fine if any"],
    q1Paid: ["q1 paid"],
    q2Paid: ["q2 paid"],
    q3Paid: ["q3 paid"],
    q4Paid: ["q4 paid"],
  };

  var DEFAULTER_FIELD_LABELS = {
    srNo: ["sr. no", "sr no", "s. no", "s no", "serial"],
    studentName: ["name of student", "student name", "name"],
    totalFeePayable: [
      "total fee payable",
      "total quarterly fee payable",
      "total quarterly fee payabl",
      "fee payable",
    ],
  };

  function pickQuarterFeePaid(r) {
    var keys = ["q2Paid", "q1Paid", "q3Paid", "q4Paid"];
    var i;
    var v;
    for (i = 0; i < keys.length; i++) {
      v = String(r[keys[i]] || "").trim();
      if (v && v !== "0" && v !== "0.00") return v;
    }
    for (i = 0; i < keys.length; i++) {
      v = String(r[keys[i]] || "").trim();
      if (v) return v;
    }
    return "";
  }

  function normalizeReceiptRow(r) {
    var feePaid = String(r.feePaid || "").trim();
    if (!feePaid || feePaid === "0" || feePaid === "0.00") {
      feePaid = pickQuarterFeePaid(r);
    }
    return {
      srNo: String(r.srNo || "").trim(),
      studentName: String(r.studentName || "").trim(),
      dateReceipt: String(r.dateReceipt || "").trim(),
      feePaid: feePaid,
      lateFine: String(r.lateFine || "").trim(),
    };
  }

  function normalizeDefaulterRow(r) {
    return {
      srNo: String(r.srNo || "").trim(),
      studentName: String(r.studentName || "").trim(),
      totalFeePayable: String(r.totalFeePayable || "").trim(),
    };
  }

  function extractReportRowsFromPage(fieldLabels, mode) {
    var rows = findReportDataTables(fieldLabels);
    if (rows.length) {
      return rows.map(mode === "defaulter" ? normalizeDefaulterRow : normalizeReceiptRow);
    }
    return [];
  }

  function isReportReady() {
    if (reportHasPages()) return true;
    if (findReportDataTables(RECEIPT_FIELD_LABELS).length > 0) return true;
    if (findReportDataTables(DEFAULTER_FIELD_LABELS).length > 0) return true;
    var text = String(document.body ? document.body.innerText : "");
    if (/Report for Fee/i.test(text) && /Unique ID No/i.test(text)) return true;
    if (/Fee Defaulter/i.test(text) && /Name of student/i.test(text) && reportHasPages()) return true;
    return false;
  }

  function beginPagedReportExtract(mode, fieldLabels, stateKey, waitStep) {
    if (!isReportReady()) {
      return {
        ok: false,
        step: mode,
        mode: mode,
        rows: [],
        message: "Report not ready yet.",
      };
    }
    if (!global[stateKey]) global[stateKey] = [];
    var pageRows = extractReportRowsFromPage(fieldLabels, mode);
    if (pageRows.length) {
      global[stateKey] = mergeReportRows(global[stateKey], pageRows);
      global.__kvUbiReportPageNavigating = false;
    }
    if (reportViewerNextPageEnabled()) {
      if (!global.__kvUbiReportPageNavigating) {
        global.__kvUbiReportPageNavigating = true;
        clickReportNextPage();
      }
      return {
        ok: true,
        step: waitStep,
        mode: mode,
        rows: [],
        message: "Reading report page " + (reportPageCounts().current + 1) + " of " + reportPageCounts().total + "…",
      };
    }
    global.__kvUbiReportPageNavigating = false;
    var finalRows = global[stateKey] || [];
    global[stateKey] = null;
    return {
      ok: finalRows.length > 0,
      step: mode,
      mode: mode,
      rows: finalRows,
      message:
        finalRows.length > 0
          ? "Extracted " + finalRows.length + " row(s) from the visible UBI report."
          : "No report rows found. Generate the report on UBI first.",
    };
  }

  function rowLooksLikeData(cells) {
    if (!cells || !cells.length) return false;
    var txt = "";
    var i;
    for (i = 0; i < cells.length; i++) txt += String(cells[i].textContent || "");
    txt = txt.replace(/\s+/g, " ").trim();
    if (txt.length < 2) return false;
    if (/^(sn|s\.?\s*no|name|student|fee|amount|date|total|login|submit|select)/i.test(txt) && txt.length < 40) {
      return false;
    }
    return /[a-zA-Z]{2,}/.test(txt) || /\d/.test(txt);
  }

  function extractFromTable(table, colMap) {
    var out = [];
    var rows = table.querySelectorAll("tbody tr");
    if (!rows.length) rows = table.querySelectorAll("tr");
    var ri;
    for (ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      if (row.querySelector("th") && !row.querySelector("td")) continue;
      var cells = row.querySelectorAll("td, th");
      if (!rowLooksLikeData(cells)) continue;
      var item = {};
      var k;
      for (k in colMap) {
        if (!colMap.hasOwnProperty(k)) continue;
        var idx = colMap[k];
        if (idx >= 0) item[k] = cellText(row, idx);
      }
      var hasData = false;
      for (k in colMap) {
        if (!colMap.hasOwnProperty(k)) continue;
        if (item[k]) {
          hasData = true;
          break;
        }
      }
      if (hasData) out.push(item);
    }
    return out;
  }

  function extractReceiptPage() {
    return beginPagedReportExtract("receipt", RECEIPT_FIELD_LABELS, "__kvUbiReceiptAccumRows", "receipt_page_wait");
  }

  function currentAcademicYearLabel() {
    var d = new Date();
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var start = m >= 4 ? y : y - 1;
    return start + "-" + (start + 1);
  }

  function currentQuarterLabel() {
    var m = new Date().getMonth() + 1;
    if (m >= 7 && m <= 9) return "Jul - Sep";
    if (m >= 10 && m <= 12) return "Oct - Dec";
    if (m >= 1 && m <= 3) return "Jan - Mar";
    return "Apr - Jun";
  }

  function isReceiptFormPage() {
    return /RptClass_FeeReceipt/i.test(String(location.pathname || ""));
  }

  function findSelectByLabelText(labelText) {
    var want = normHeader(labelText);
    var nodes = document.querySelectorAll("td, label, span, th, div, p");
    var i;
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var t = normHeader(node.textContent);
      if (!t || t.indexOf(want) !== 0) continue;
      var sel = node.querySelector("select");
      if (sel) return sel;
      var next = node.nextElementSibling;
      if (next) {
        sel = next.tagName === "SELECT" ? next : next.querySelector("select");
        if (sel) return sel;
      }
      var parent = node.parentElement;
      if (parent) {
        sel = parent.querySelector("select");
        if (sel) return sel;
      }
    }
    return null;
  }

  function pickSelectOption(select, fragment) {
    if (!select || !select.options || !select.options.length) return false;
    var frag = String(fragment || "")
      .replace(/[()]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!frag) return false;
    var i;
    for (i = 0; i < select.options.length; i++) {
      var opt = select.options[i];
      var t = String(opt.textContent || "")
        .replace(/[()]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (!t) continue;
      if (t === frag || t.indexOf(frag) >= 0 || frag.indexOf(t) >= 0) {
        select.selectedIndex = i;
        select.value = opt.value;
        try {
          select.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (_e) {}
        return true;
      }
    }
    return false;
  }

  function clickGenerateReport() {
    var candidates = document.querySelectorAll('input[type="submit"], input[type="button"], button, a');
    var i;
    for (i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var v = String(el.value || el.textContent || "").replace(/\s+/g, " ").trim();
      if (/generate\s*report/i.test(v)) {
        el.click();
        return true;
      }
    }
    return false;
  }

  var REPORT_WAIT_AFTER_GENERATE_MS = 5000;
  var REPORT_WAIT_AFTER_EXPORT_MS = 7500;
  var REPORT_MAX_LOAD_MS = 45000;
  var RECEIPT_PAGE_SETTLE_MS = 2500;

  function markReceiptPageLanded() {
    if (!global.__kvUbiReceiptLandedAt && isReceiptFormPage()) {
      global.__kvUbiReceiptLandedAt = Date.now();
    }
  }

  function receiptFormReadyToGenerate() {
    markReceiptPageLanded();
    if (document.readyState !== "complete") return false;
    if (!global.__kvUbiReceiptLandedAt) return false;
    return Date.now() - global.__kvUbiReceiptLandedAt >= RECEIPT_PAGE_SETTLE_MS;
  }

  function isUbiReportLoadingOverlay() {
    var nodes = document.querySelectorAll("div, span, td, label");
    var i;
    for (i = 0; i < nodes.length; i++) {
      var t = String(nodes[i].textContent || "").replace(/\s+/g, " ").trim();
      if (!/^Loading\.{0,3}$/i.test(t)) continue;
      var rect = nodes[i].getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }

  function persistReportTiming(mode) {
    try {
      sessionStorage.setItem("kv_ubi_report_generate_at", String(global.__kvUbiReportGenerateAt || Date.now()));
      if (mode === "defaulter") {
        sessionStorage.setItem("kv_ubi_defaulter_generated", "1");
      } else {
        sessionStorage.setItem("kv_ubi_receipt_generated", "1");
      }
    } catch (_e) {}
  }

  function restoreReportTimingFromStorage() {
    try {
      if (!global.__kvUbiReportGenerateAt) {
        var t = parseInt(sessionStorage.getItem("kv_ubi_report_generate_at") || "0", 10);
        if (t > 0) global.__kvUbiReportGenerateAt = t;
      }
      if (sessionStorage.getItem("kv_ubi_receipt_generated") === "1") {
        global.__kvUbiReceiptGenerateClicked = true;
      }
      if (sessionStorage.getItem("kv_ubi_defaulter_generated") === "1") {
        global.__kvUbiDefaulterGenerateClicked = true;
      }
    } catch (_e) {}
  }

  function clearReportTimingStorage() {
    try {
      sessionStorage.removeItem("kv_ubi_report_generate_at");
      sessionStorage.removeItem("kv_ubi_receipt_generated");
      sessionStorage.removeItem("kv_ubi_defaulter_generated");
    } catch (_e) {}
  }

  function resetReportTimingState() {
    global.__kvUbiReportGenerateAt = 0;
    global.__kvUbiExportMenuOpened = false;
    global.__kvUbiExportDone = false;
    global.__kvUbiExportClickAt = 0;
    global.__kvUbiGenerateRetried = false;
    global.__kvUbiReceiptLandedAt = 0;
    clearReportTimingStorage();
  }

  function msSinceGenerate() {
    if (!global.__kvUbiReportGenerateAt) return 999999;
    return Date.now() - global.__kvUbiReportGenerateAt;
  }

  function msSinceExport() {
    if (!global.__kvUbiExportClickAt) return 0;
    return Date.now() - global.__kvUbiExportClickAt;
  }

  function clickExportFloppy(root) {
    root = root || findReportViewerRoot() || document;
    var candidates = root.querySelectorAll(
      'a[title="Export"], input[title="Export"], img[title="Export"], img[alt="Export"], img[src*="save" i], a[title*="Export" i], input[src*="save" i]'
    );
    var i;
    for (i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var clickEl = el.closest("a") || el.closest("button") || el;
      try {
        clickEl.click();
        return true;
      } catch (_e) {}
    }
    return false;
  }

  function clickExportExcel() {
    var nodes = document.querySelectorAll("a, span, div, li, td, button");
    var i;
    for (i = 0; i < nodes.length; i++) {
      var t = String(nodes[i].textContent || "").replace(/\s+/g, " ").trim();
      if (/^excel$/i.test(t)) {
        var clickEl = nodes[i].closest("a") || nodes[i];
        try {
          clickEl.click();
          return true;
        } catch (_e) {}
      }
    }
    return false;
  }

  function isExportExcelOptionVisible() {
    var nodes = document.querySelectorAll("a, span, div, li, td, button");
    var i;
    for (i = 0; i < nodes.length; i++) {
      var t = String(nodes[i].textContent || "").replace(/\s+/g, " ").trim();
      if (!/^excel$/i.test(t)) continue;
      var rect = nodes[i].getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }

  function tryClickExportExcelOnly() {
    if (global.__kvUbiExportDone) return true;
    if (!isExportExcelOptionVisible()) return false;
    global.__kvUbiExportMenuOpened = true;
    if (clickExportExcel()) {
      global.__kvUbiExportDone = true;
      global.__kvUbiExportClickAt = Date.now();
      return true;
    }
    return false;
  }

  function tryOpenExportExcel() {
    if (global.__kvUbiExportDone) return true;
    if (!global.__kvUbiExportMenuOpened) {
      if (clickExportFloppy()) {
        global.__kvUbiExportMenuOpened = true;
        return false;
      }
    }
    if (clickExportExcel()) {
      global.__kvUbiExportDone = true;
      global.__kvUbiExportClickAt = Date.now();
      return true;
    }
    return false;
  }

  function markExportSkippedForDomExtract() {
    if (!global.__kvUbiExportDone) {
      global.__kvUbiExportDone = true;
      global.__kvUbiExportClickAt = Date.now() - REPORT_WAIT_AFTER_EXPORT_MS - 1;
    }
  }

  function retryGenerateIfEmpty(opts, mode) {
    if (global.__kvUbiGenerateRetried) return false;
    global.__kvUbiGenerateRetried = true;
    if (mode === "defaulter") {
      global.__kvUbiDefaulterGenerateClicked = false;
      var dprep = prepareDefaulterReport(opts);
      return !!(dprep && dprep.clicked);
    }
    global.__kvUbiReceiptGenerateClicked = false;
    var prep = prepareReceiptReport(opts);
    return !!(prep && prep.clicked);
  }

  function reportPageFlow(opts, mode) {
    opts = opts || {};
    restoreReportTimingFromStorage();
    var isReceipt = mode === "receipt";
    var isForm = isReceipt ? isReceiptFormPage() : isDefaulterFormPage();
    var waitStep = isReceipt ? "receipt_wait" : "defaulter_wait";
    var exportWaitStep = "report_export_wait";
    var pageWaitStep = isReceipt ? "receipt_page_wait" : "defaulter_page_wait";
    var fieldLabels = isReceipt ? RECEIPT_FIELD_LABELS : DEFAULTER_FIELD_LABELS;
    var stateKey = isReceipt ? "__kvUbiReceiptAccumRows" : "__kvUbiDefaulterAccumRows";
    var flowDoneKey = isReceipt ? "__kvUbiReceiptFlowDone" : "__kvUbiDefaulterFlowDone";
    var generateKey = isReceipt ? "__kvUbiReceiptGenerateClicked" : "__kvUbiDefaulterGenerateClicked";

    if (global[flowDoneKey]) {
      return { ok: false, step: mode, mode: mode, rows: [], message: "Done." };
    }

    if (isForm && !global[generateKey]) {
      var prep = isReceipt ? prepareReceiptReport(opts) : prepareDefaulterReport(opts);
      if (prep.needsWait || prep.clicked) {
        return {
          ok: true,
          step: waitStep,
          mode: mode,
          rows: [],
          academicYear: prep.academicYear,
          quarter: prep.quarter,
          message: "Generating report…",
        };
      }
      if (!prep.clicked) {
        return {
          ok: false,
          step: mode,
          mode: mode,
          rows: [],
          message: "Could not find Generate Report.",
        };
      }
    }

    if (global[generateKey] || global.__kvUbiReportGenerateAt) {
      if (isUbiReportLoadingOverlay()) {
        return {
          ok: true,
          step: waitStep,
          mode: mode,
          rows: [],
          message: "Report loading… (same as live UBI Loading dialog)",
        };
      }
      if (msSinceGenerate() < REPORT_WAIT_AFTER_GENERATE_MS) {
        var left = Math.ceil((REPORT_WAIT_AFTER_GENERATE_MS - msSinceGenerate()) / 1000);
        return {
          ok: true,
          step: waitStep,
          mode: mode,
          rows: [],
          message: "Waiting for report (" + left + "s)…",
        };
      }
      if (!reportHasPages() && !isReportReady()) {
        if (msSinceGenerate() < REPORT_MAX_LOAD_MS) {
          return {
            ok: true,
            step: waitStep,
            mode: mode,
            rows: [],
            message: "Waiting for report to load (pages: " + reportPageCounts().total + ")…",
          };
        }
        if (retryGenerateIfEmpty(opts, mode)) {
          return {
            ok: true,
            step: waitStep,
            mode: mode,
            rows: [],
            message: "Retrying Generate Report…",
          };
        }
      }
      if (reportHasPages() || isReportReady()) {
        markExportSkippedForDomExtract();
      }
    }

    var extracted = beginPagedReportExtract(mode, fieldLabels, stateKey, pageWaitStep);
    if (extracted.step === pageWaitStep) return extracted;
    if (extracted.rows.length > 0) {
      global[flowDoneKey] = true;
      clearReportTimingStorage();
      extracted.academicYear = opts.academicYear || currentAcademicYearLabel();
      extracted.quarter = opts.quarter || currentQuarterLabel();
    }
    return extracted;
  }

  function prepareReceiptReport(opts) {
    opts = opts || {};
    var yearWant = String(opts.academicYear || currentAcademicYearLabel()).trim();
    var quarterWant = String(opts.quarter || currentQuarterLabel()).trim();
    if (!receiptFormReadyToGenerate()) {
      var leftMs = RECEIPT_PAGE_SETTLE_MS - (Date.now() - (global.__kvUbiReceiptLandedAt || Date.now()));
      return {
        ok: true,
        academicYear: yearWant,
        quarter: quarterWant,
        clicked: false,
        needsWait: true,
        message: "Waiting for receipt page (" + Math.max(1, Math.ceil(leftMs / 1000)) + "s)…",
      };
    }
    var clicked = false;
    if (!global.__kvUbiReceiptGenerateClicked) {
      clicked = clickGenerateReport();
      if (clicked) {
        global.__kvUbiReceiptGenerateClicked = true;
        global.__kvUbiReportGenerateAt = Date.now();
        persistReportTiming("receipt");
      }
    }
    return {
      ok: clicked,
      academicYear: yearWant,
      quarter: quarterWant,
      clicked: clicked,
      needsWait: clicked,
    };
  }

  function receiptReportFlow(opts) {
    return reportPageFlow(opts, "receipt");
  }

  function isDefaulterFormPage() {
    return /RptClass_FeeDefaulter/i.test(String(location.pathname || ""));
  }

  function prepareDefaulterReport(opts) {
    opts = opts || {};
    var yearWant = String(opts.academicYear || currentAcademicYearLabel()).trim();
    var periodWant = String(opts.quarter || currentQuarterLabel()).trim();
    var periodSel =
      findSelectByLabelText("payment period") ||
      findSelectByLabelText("quarter");
    var yearSel = findSelectByLabelText("academic year");
    if (!periodSel && !yearSel) {
      var all = document.querySelectorAll("select");
      if (all.length >= 2 && isDefaulterFormPage()) {
        periodSel = all[0];
        yearSel = all[1];
      }
    }
    var periodSet = periodSel ? pickSelectOption(periodSel, periodWant) : false;
    var yearSet = yearSel ? pickSelectOption(yearSel, yearWant) : false;
    var clicked = false;
    if (!global.__kvUbiDefaulterGenerateClicked) {
      clicked = clickGenerateReport();
      if (clicked) {
        global.__kvUbiDefaulterGenerateClicked = true;
        global.__kvUbiReportGenerateAt = Date.now();
        persistReportTiming("defaulter");
      }
    }
    return {
      ok: periodSet || yearSet || clicked,
      academicYear: yearWant,
      quarter: periodWant,
      periodSet: periodSet,
      yearSet: yearSet,
      clicked: clicked,
      needsWait: clicked,
    };
  }

  function defaulterReportFlow(opts) {
    return reportPageFlow(opts, "defaulter");
  }

  function resetReceiptFlowState() {
    global.__kvUbiReceiptGenerateClicked = false;
    global.__kvUbiReceiptFlowDone = false;
    global.__kvUbiReceiptAccumRows = null;
    global.__kvUbiReportPageNavigating = false;
    resetReportTimingState();
  }

  function resetDefaulterFlowState() {
    global.__kvUbiDefaulterGenerateClicked = false;
    global.__kvUbiDefaulterFlowDone = false;
    global.__kvUbiDefaulterAccumRows = null;
    global.__kvUbiReportPageNavigating = false;
    resetReportTimingState();
  }

  function resetReportFlowState() {
    resetReceiptFlowState();
    resetDefaulterFlowState();
    global.__kvUbiLoginSubmitted = false;
    global.__kvUbiPendingCreds = null;
  }

  function extractDefaulterPage() {
    return beginPagedReportExtract("defaulter", DEFAULTER_FIELD_LABELS, "__kvUbiDefaulterAccumRows", "defaulter_page_wait");
  }

  function extractPage(mode) {
    if (mode === "defaulter") return extractDefaulterPage();
    return extractReceiptPage();
  }

  global.KVUbiFeeInject = {
    submitUbiLoginForm: submitUbiLoginForm,
    loginPage: loginPage,
    extractReceiptPage: extractReceiptPage,
    extractDefaulterPage: extractDefaulterPage,
    extractPage: extractPage,
    isCaptchaActive: isCaptchaActive,
    currentAcademicYearLabel: currentAcademicYearLabel,
    currentQuarterLabel: currentQuarterLabel,
    prepareReceiptReport: prepareReceiptReport,
    receiptReportFlow: receiptReportFlow,
    resetReceiptFlowState: resetReceiptFlowState,
    isReceiptFormPage: isReceiptFormPage,
    prepareDefaulterReport: prepareDefaulterReport,
    defaulterReportFlow: defaulterReportFlow,
    resetDefaulterFlowState: resetDefaulterFlowState,
    resetReportFlowState: resetReportFlowState,
    restoreReportTimingFromStorage: restoreReportTimingFromStorage,
    isDefaulterFormPage: isDefaulterFormPage,
    reportHasPages: reportHasPages,
  };
})(typeof window !== "undefined" ? window : this);
