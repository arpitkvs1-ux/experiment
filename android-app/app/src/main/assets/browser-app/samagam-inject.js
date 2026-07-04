/**
 * Injection helpers executed inside samagam.kvs.gov.in (WebView / userscript).
 * Attendance matching uses student name only (not roll number).
 */
(function (global) {
  "use strict";

  function normName(v) {
    return String(v == null ? "" : v)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.,]+/g, " ");
  }

  function setInputValue(el, value, opts) {
    if (!el) return false;
    opts = opts || {};
    var v = String(value == null ? "" : value);
    if (String(el.value || "") === v) return true;
    if (opts.focus) {
      try {
        el.focus();
      } catch (_ef) {}
    }
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

  function isCaptchaActive() {
    var cap = document.querySelector('input[name="captcha"]');
    if (!cap) return false;
    if (document.activeElement === cap) return true;
    if (String(cap.value || "").trim().length > 0) return true;
    return false;
  }

  function loginFieldsFilled(user, pass, fields) {
    return (
      fields.user &&
      fields.pass &&
      String(fields.user.value || "") === user &&
      String(fields.pass.value || "") === pass
    );
  }

  function findLoginFields() {
    var u =
      document.querySelector('input[name="username"]') ||
      document.querySelector("#loginForm input[type='text']") ||
      document.querySelector(".login-form input[type='text']") ||
      document.querySelector('input[placeholder*="Login" i]');
    var p =
      document.querySelector('input[name="password"]') ||
      document.querySelector("#loginForm input[type='password']") ||
      document.querySelector(".login-form input[type='password']");
    return { user: u, pass: p };
  }

  function captchaRequiredLength(cap) {
    if (!cap) return 6;
    var max = parseInt(String(cap.getAttribute("maxlength") || ""), 10);
    if (!isNaN(max) && max > 0) return max;
    return 6;
  }

  function bindCaptchaAutoSubmit(cap) {
    if (!cap || cap.__kvSamagamBound) return;
    cap.__kvSamagamBound = true;
    function trySubmit() {
      var v = String(cap.value || "").trim();
      var need = captchaRequiredLength(cap);
      if (v.length < need) return;
      var form = document.getElementById("loginForm") || cap.closest("form");
      if (!form || global.__kvSamagamLoginSubmitted) return;
      global.__kvSamagamLoginSubmitted = true;
      setTimeout(function () {
        try {
          form.submit();
        } catch (_e) {}
      }, 250);
    }
    cap.addEventListener("input", trySubmit, { passive: true });
  }

  function loginPage(creds) {
    creds = creds || {};
    var user = String(creds.username || "");
    var pass = String(creds.password || "");
    if (isCaptchaActive()) {
      return { ok: true, step: "login", skipped: true, message: "Captcha in progress." };
    }
    var fields = findLoginFields();
    if (loginFieldsFilled(user, pass, fields)) {
      return { ok: true, step: "login", already: true, message: "Login fields already filled." };
    }
    var filled =
      setInputValue(fields.user, user, { focus: false }) &&
      setInputValue(fields.pass, pass, { focus: false });
    var cap = document.querySelector('input[name="captcha"]');
    bindCaptchaAutoSubmit(cap);
    return { ok: filled, step: "login", message: "Username and password filled. Enter captcha to sign in." };
  }


  function findStatusSelect(row, table) {
    var idx = findColumnIndex(table, ["present", "attendance", "status", "p/a"]);
    if (idx >= 0) {
      var cells = row.querySelectorAll("td, th");
      if (cells[idx]) {
        var sel = cells[idx].querySelector("select");
        if (sel) return sel;
      }
    }
    return row.querySelector("select");
  }

  function readRowStatus(row, table) {
    var idx = findColumnIndex(table, ["present", "attendance", "status", "p/a"]);
    if (idx >= 0) {
      var txt = cellText(row, idx).toLowerCase();
      if (/\babsent\b/.test(txt) || txt === "a") return "A";
      if (/\bpresent\b/.test(txt) || txt === "p") return "P";
    }
    var sel = findStatusSelect(row, table);
    if (sel) {
      var opt = sel.options[sel.selectedIndex];
      var st = String((opt && opt.textContent) || sel.value || "").toLowerCase();
      if (/\babsent\b/.test(st) || st === "a") return "A";
      if (/\bpresent\b/.test(st) || st === "p") return "P";
    }
    return "P";
  }

  function setSelectOption(sel, wantAbsent) {
    if (!sel) return false;
    var i;
    for (i = 0; i < sel.options.length; i++) {
      var t = String(sel.options[i].textContent || sel.options[i].value || "").toLowerCase();
      var isAbsent = /\babsent\b/.test(t) || t === "a";
      var isPresent = /\bpresent\b/.test(t) || t === "p";
      if (wantAbsent && isAbsent) {
        sel.selectedIndex = i;
        sel.value = sel.options[i].value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        markAbsentElement(sel, true);
        return true;
      }
      if (!wantAbsent && isPresent) {
        sel.selectedIndex = i;
        sel.value = sel.options[i].value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        markAbsentElement(sel, false);
        return true;
      }
    }
    return false;
  }

  function openDropdownPickAbsent(row, table) {
    var idx = findColumnIndex(table, ["present", "attendance", "status", "p/a"]);
    var cell = idx >= 0 ? row.querySelectorAll("td, th")[idx] : null;
    var scope = cell || row;
    var toggle = scope.querySelector(
      '[data-bs-toggle="dropdown"], .dropdown-toggle, button, a.btn, .btn'
    );
    if (toggle) {
      try {
        toggle.click();
      } catch (_e0) {}
    }
    var items = scope.querySelectorAll(
      ".dropdown-menu a, .dropdown-menu button, .dropdown-menu .dropdown-item, .dropdown-menu li a"
    );
    if (!items.length) {
      items = document.querySelectorAll(
        ".dropdown-menu.show a, .dropdown-menu.show button, .dropdown-menu.show .dropdown-item"
      );
    }
    var ii;
    for (ii = 0; ii < items.length; ii++) {
      var txt = String(items[ii].textContent || "").trim().toLowerCase();
      if (txt === "absent" || txt === "a") {
        items[ii].click();
        return items[ii];
      }
    }
    return null;
  }

  function setRowStatusFromVaayu(row, status, table) {
    table = table || (row && row.closest ? row.closest("table") : null);
    var wantAbsent = normalizeEntryStatus(status) === "A";

    if (statusAlreadyCorrect(row, table, status)) {
      return { ok: true, action: "already", target: row };
    }

    if (!wantAbsent) {
      if (readRowStatus(row, table) !== "A") {
        return { ok: true, action: "present_default", target: row };
      }
      var selP = findStatusSelect(row, table);
      if (selP && setSelectOption(selP, false)) {
        return { ok: true, action: "set_present", target: selP };
      }
      return { ok: true, action: "present_default", target: row };
    }

    var selA = findStatusSelect(row, table);
    if (selA && setSelectOption(selA, true)) {
      return { ok: true, action: "set_absent", target: selA };
    }
    var dropped = openDropdownPickAbsent(row, table);
    if (dropped) {
      return { ok: true, action: "set_absent_dropdown", target: dropped };
    }
    return { ok: false, action: "absent_manual", target: null };
  }

  function isAbsentLabel(txt) {
    var t = String(txt == null ? "" : txt).trim().toLowerCase();
    return t === "absent" || t === "a";
  }

  function selectedSelectLabel(sel) {
    if (!sel || !sel.options || sel.selectedIndex < 0) return "";
    var opt = sel.options[sel.selectedIndex];
    return String((opt && (opt.textContent || opt.label)) || opt.value || "").trim();
  }

  function markAbsentElement(el, absent) {
    if (!el) return;
    if (absent) {
      el.classList.add("kv-vaayu-absent");
      el.style.setProperty("color", "#b91c1c", "important");
      el.style.setProperty("-webkit-text-fill-color", "#b91c1c", "important");
      el.style.setProperty("font-weight", "700", "important");
    } else if (el.classList.contains("kv-vaayu-absent")) {
      el.classList.remove("kv-vaayu-absent");
      el.style.removeProperty("color");
      el.style.removeProperty("-webkit-text-fill-color");
      el.style.removeProperty("font-weight");
    }
  }

  function bindAbsentSelectListeners() {
    if (global.__kvAbsentSelectBound) return;
    global.__kvAbsentSelectBound = true;
    document.addEventListener(
      "change",
      function (ev) {
        var t = ev.target;
        if (t && t.tagName === "SELECT") {
          markAbsentElement(t, isAbsentLabel(selectedSelectLabel(t)));
        }
      },
      true
    );
  }

  function applyAbsentRedHighlight(root) {
    root = root || document.body;
    if (!document.getElementById("kv-samagam-absent-style")) {
      var style = document.createElement("style");
      style.id = "kv-samagam-absent-style";
      style.textContent =
        "select.kv-vaayu-absent, .kv-vaayu-absent { color: #b91c1c !important; -webkit-text-fill-color: #b91c1c !important; font-weight: 700 !important; }" +
        "select.kv-vaayu-absent option { color: #b91c1c !important; font-weight: 700 !important; }" +
        ".dropdown-toggle.kv-vaayu-absent, button.kv-vaayu-absent, a.kv-vaayu-absent { color: #b91c1c !important; font-weight: 700 !important; }";
      document.head.appendChild(style);
    }
    bindAbsentSelectListeners();

    var selects = (root || document).querySelectorAll("table select, select");
    var si;
    for (si = 0; si < selects.length; si++) {
      var sel = selects[si];
      var absent = isAbsentLabel(selectedSelectLabel(sel));
      markAbsentElement(sel, absent);
      var oi;
      for (oi = 0; oi < sel.options.length; oi++) {
        var opt = sel.options[oi];
        if (isAbsentLabel(opt.textContent || opt.value)) {
          opt.classList.add("kv-vaayu-absent");
          opt.style.setProperty("color", "#b91c1c", "important");
          opt.style.setProperty("font-weight", "700", "important");
        }
      }
    }

    var toggles = (root || document).querySelectorAll(
      "table [data-bs-toggle='dropdown'], table .dropdown-toggle, table button, table a.btn, table .btn"
    );
    var ti;
    for (ti = 0; ti < toggles.length; ti++) {
      var btn = toggles[ti];
      var btnTxt = String(btn.textContent || "").replace(/\s+/g, " ").trim();
      if (isAbsentLabel(btnTxt)) {
        markAbsentElement(btn, true);
      }
    }

    var nodes = (root || document).querySelectorAll(
      "table td, table th, table span, table a, .dropdown-item, .dropdown-menu a, .dropdown-menu button"
    );
    var ni;
    for (ni = 0; ni < nodes.length; ni++) {
      var el = nodes[ni];
      if (el.tagName === "SELECT" || el.closest("select")) continue;
      var txt = String(el.textContent || "").replace(/\s+/g, " ").trim();
      if (isAbsentLabel(txt)) {
        markAbsentElement(el, true);
      }
    }
  }

  function startAbsentRedObserver() {
    if (global.__kvAbsentRedObserver) return;
    applyAbsentRedHighlight(document.body);
    try {
      global.__kvAbsentRedObserver = new MutationObserver(function () {
        applyAbsentRedHighlight(document.body);
      });
      global.__kvAbsentRedObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    } catch (_e) {}
  }

  function namesMatch(localName, samagamName) {
    var a = normName(localName);
    var b = normName(samagamName);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 4 && b.indexOf(a) >= 0) return true;
    if (b.length >= 4 && a.indexOf(b) >= 0) return true;
    var aw = a.split(" ").filter(Boolean);
    var bw = b.split(" ").filter(Boolean);
    if (aw.length >= 2 && bw.length >= 2) {
      var hits = 0;
      for (var i = 0; i < aw.length; i++) {
        if (aw[i].length < 2) continue;
        for (var j = 0; j < bw.length; j++) {
          if (aw[i] === bw[j]) hits++;
        }
      }
      if (hits >= 2) return true;
    }
    return false;
  }

  function findColumnIndex(table, labels) {
    if (!table) return -1;
    var headers = table.querySelectorAll("thead th, thead td");
    if (!headers.length) {
      var first = table.querySelector("tr");
      if (first) headers = first.querySelectorAll("th, td");
    }
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i].textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (!h) continue;
      for (var j = 0; j < labels.length; j++) {
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

  function collectSamagamRows() {
    var tables = document.querySelectorAll("table");
    var out = [];
    var ti;
    for (ti = 0; ti < tables.length; ti++) {
      var table = tables[ti];
      var nameIdx = findColumnIndex(table, ["name", "student name"]);
      var rows = table.querySelectorAll("tbody tr");
      if (!rows.length) rows = table.querySelectorAll("tr");
      var ri;
      for (ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        if (row.querySelector("th") && !row.querySelector("td")) continue;
        var name = nameIdx >= 0 ? cellText(row, nameIdx) : "";
        if (!name || !/[a-zA-Z]{2,}/.test(name)) {
          name = extractNameFromRowLegacy(row);
        }
        if (!name || name.length < 2) continue;
        if (/^(sn|s\.?\s*no|roll|name|student|present|absent|login|submit)/i.test(name)) continue;
        out.push({
          row: row,
          table: table,
          name: name,
          norm: normName(name),
        });
      }
    }
    return out;
  }

  function extractNameFromRowLegacy(row) {
    var cells = row.querySelectorAll("td, th");
    var best = "";
    for (var i = 0; i < cells.length; i++) {
      var t = String(cells[i].textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (t.length < 3) continue;
      if (/^\d+$/.test(t)) continue;
      if (/^(present|absent|p|a)$/i.test(t)) continue;
      if (/[a-zA-Z]/.test(t) && t.length > best.length) best = t;
    }
    return best;
  }

  function extractNameFromRow(row) {
    var table = row.closest("table");
    var nameIdx = findColumnIndex(table, ["name", "student name"]);
    if (nameIdx >= 0) {
      var t = cellText(row, nameIdx);
      if (t && /[a-zA-Z]{2,}/.test(t)) return t;
    }
    return extractNameFromRowLegacy(row);
  }

  function normalizeEntryStatus(status) {
    var s = String(status || "P").trim().toUpperCase();
    if (s === "A" || s === "ABSENT") return "A";
    return "P";
  }

  function statusAlreadyCorrect(row, table, status) {
    var wantAbsent = normalizeEntryStatus(status) === "A";
    var idx = findColumnIndex(table, ["present", "attendance", "status", "p/a"]);
    if (idx >= 0) {
      var txt = cellText(row, idx).toLowerCase();
      if (wantAbsent && (txt === "absent" || txt === "a")) return true;
      if (!wantAbsent && (txt === "present" || txt === "p")) return true;
    }
    return false;
  }

  function findSamagamRowForEntry(entry, samagamRows) {
    var localName = String(entry.studentName || "").trim();
    var i;
    for (i = 0; i < samagamRows.length; i++) {
      if (namesMatch(localName, samagamRows[i].name)) return samagamRows[i];
    }
    return null;
  }

  function buildSummaryMessage(summary) {
    var presentCount = summary.presentCount || 0;
    var absentCount = summary.absentCount || 0;
    var notFound = summary.notFound || [];
    var extraOnSamagam = summary.extraOnSamagam || [];
    var lines = ["Present: " + presentCount, "Absent: " + absentCount];
    var mismatchLines = [];
    var i;

    for (i = 0; i < notFound.length; i++) {
      mismatchLines.push("• Not on SAMAGAM: " + notFound[i]);
    }
    for (i = 0; i < extraOnSamagam.length; i++) {
      mismatchLines.push("• Not in Vaayu: " + extraOnSamagam[i]);
    }

    if (mismatchLines.length) {
      lines.push("");
      lines.push("Name mismatch (" + mismatchLines.length + "):");
      lines = lines.concat(mismatchLines);
    }

    return {
      message: lines.join("\n"),
      hasMismatch: mismatchLines.length > 0,
      presentCount: presentCount,
      absentCount: absentCount,
    };
  }

  function closeSamagamSummaryDialog() {
    var existing = document.getElementById("kv-samagam-summary-dialog");
    if (existing) existing.remove();
    if (global.__kvSamagamSummaryTimer) {
      clearTimeout(global.__kvSamagamSummaryTimer);
      global.__kvSamagamSummaryTimer = null;
    }
  }

  function showSamagamSummaryDialog(result) {
    result = result || {};
    var summary = buildSummaryMessage({
      presentCount: (result.presentOk || []).length,
      absentCount: (result.absentSet || []).length + (result.absentManual || []).length,
      notFound: result.missingOnSamagam || [],
      extraOnSamagam: result.excessOnSamagam || [],
    });

    closeSamagamSummaryDialog();

    var overlay = document.createElement("div");
    overlay.id = "kv-samagam-summary-dialog";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(26,21,18,0.45);display:flex;align-items:center;justify-content:center;padding:16px;";

    var panel = document.createElement("div");
    panel.style.cssText =
      "width:min(420px,100%);background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.2);padding:18px 20px;font-family:system-ui,sans-serif;";

    var title = document.createElement("h3");
    title.textContent = "Vaayu → SAMAGAM";
    title.style.cssText = "margin:0 0 12px;font-size:1.05rem;color:#6b1c23;";

    var body = document.createElement("pre");
    body.textContent = summary.message;
    body.style.cssText =
      "margin:0 0 14px;white-space:pre-wrap;font:14px/1.5 system-ui,sans-serif;color:#4a3728;";

    var hint = document.createElement("p");
    hint.textContent = summary.hasMismatch
      ? "Fix mismatches if needed, then press Submit on SAMAGAM."
      : "Press Submit on SAMAGAM when ready.";
    hint.style.cssText = "margin:0 0 14px;font-size:13px;color:#6b5344;";

    panel.appendChild(title);
    panel.appendChild(body);
    panel.appendChild(hint);

    if (summary.hasMismatch) {
      var okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.textContent = "OK";
      okBtn.style.cssText =
        "display:block;margin-left:auto;padding:8px 20px;border:none;border-radius:8px;background:#6b1c23;color:#fff;font-weight:600;cursor:pointer;";
      okBtn.addEventListener("click", closeSamagamSummaryDialog);
      panel.appendChild(okBtn);
    }

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    if (!summary.hasMismatch) {
      global.__kvSamagamSummaryTimer = setTimeout(closeSamagamSummaryDialog, 2000);
    }
  }

  function attendancePage(entries) {
    entries = Array.isArray(entries) ? entries : [];
    startAbsentRedObserver();
    var samagamRows = collectSamagamRows();
    var filled = 0;
    var presentOk = [];
    var absentSet = [];
    var absentManual = [];
    var notFound = [];
    var matchedSamagamNorm = {};

    for (var e = 0; e < entries.length; e++) {
      var entry = entries[e];
      var localName = String(entry.studentName || "").trim();
      var vaayuStatus = normalizeEntryStatus(entry.status);
      if (!localName) {
        notFound.push("(no name)");
        continue;
      }
      var sr = findSamagamRowForEntry(entry, samagamRows);
      if (!sr) {
        notFound.push(localName + " (Vaayu: " + (vaayuStatus === "A" ? "Absent" : "Present") + ")");
        continue;
      }
      var outcome = setRowStatusFromVaayu(sr.row, entry.status, sr.table);
      if (outcome.ok) {
        filled++;
        matchedSamagamNorm[sr.norm] = sr.name;
        if (vaayuStatus === "A") {
          if (outcome.action === "set_absent" || outcome.action === "set_absent_dropdown") {
            absentSet.push(localName);
          } else {
            absentSet.push(localName + " (already Absent)");
          }
        } else {
          presentOk.push(localName);
        }
      } else if (vaayuStatus === "A") {
        absentManual.push(localName);
      } else {
        presentOk.push(localName + " (check Present column)");
      }
    }

    applyAbsentRedHighlight(document.body);

    var excessOnSamagam = [];
    for (var j = 0; j < samagamRows.length; j++) {
      if (!matchedSamagamNorm[samagamRows[j].norm]) {
        excessOnSamagam.push(samagamRows[j].name);
      }
    }

    var summary = buildSummaryMessage({
      presentCount: presentOk.length,
      absentCount: absentSet.length + absentManual.length,
      notFound: notFound,
      extraOnSamagam: excessOnSamagam,
    });

    return {
      ok: filled > 0 || entries.length === 0,
      step: "attendance",
      filled: filled,
      total: entries.length,
      missingOnSamagam: notFound,
      absentManual: absentManual,
      presentOk: presentOk,
      absentSet: absentSet,
      excessOnSamagam: excessOnSamagam,
      hasMismatch: summary.hasMismatch,
      presentCount: summary.presentCount,
      absentCount: summary.absentCount,
      message: summary.message
    };
  }

  global.KVSamagamInject = {
    loginPage: loginPage,
    attendancePage: attendancePage,
    namesMatch: namesMatch,
    normName: normName,
    applyAbsentRedHighlight: applyAbsentRedHighlight,
    startAbsentRedObserver: startAbsentRedObserver,
    showSamagamSummaryDialog: showSamagamSummaryDialog,
  };
})(typeof window !== "undefined" ? window : this);
