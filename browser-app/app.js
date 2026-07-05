(function () {
  "use strict";

  var STORAGE_KEY = "kv_studentapp_v1";
  var MARKS_STORAGE_KEY = "kv_marksheets_v1";
  var MARKS_PENDING_KEY = "kv_marks_pending_v1";
  var STUDENT_STATUS_PENDING_KEY = "kv_student_status_pending_v1";
  var STUDENT_ADD_PENDING_KEY = "kv_student_add_pending_v1";
  var CONS_STATUS_CACHE_KEY = "kv_cons_status_cache_v1";
  var CONS_ABSENT_CACHE_KEY = "kv_cons_absent_cache_v1";
  var SHEET_SLIP_DETAIL_CACHE_KEY = "kv_sheet_slip_detail_cache_v1";
  var DRIVE_BACKUP_META_KEY = "kv_drive_backup_meta_v1";
  var DRIVE_BACKUP_SCHEMA_VERSION = 1;
  var ACTIVE_USER_KEY = "__kv_active_user_v1";
  var MARKS_ENTRY_DISABLED_MSG =
    "Marks Entry/Edit is currently disabled. Please contact the class teacher";

  function normalizeUserKey(raw) {
    var s = String(raw == null ? "" : raw).trim().toLowerCase();
    if (!s) return "guest";
    return s.replace(/[^a-z0-9@._-]+/g, "_");
  }

  function currentUserKey() {
    try {
      var k = window.__kvUserKey || localStorage.getItem(ACTIVE_USER_KEY) || "guest";
      return normalizeUserKey(k);
    } catch (_e) {
      return "guest";
    }
  }

  function setCurrentUserKey(k) {
    var nk = normalizeUserKey(k);
    window.__kvUserKey = nk;
    try {
      localStorage.setItem(ACTIVE_USER_KEY, nk);
    } catch (_e) {}
  }

  function storageScopedKey(rawKey) {
    var key = String(rawKey || "");
    if (!/^kv_/i.test(key)) return key;
    return "u::" + currentUserKey() + "::" + key;
  }

  (function patchLocalStorageForUserScope() {
    if (window.__kvStorageScopedPatched) return;
    window.__kvStorageScopedPatched = true;
    var proto = Storage && Storage.prototype;
    if (!proto) return;
    var _get = proto.getItem;
    var _set = proto.setItem;
    var _rem = proto.removeItem;
    proto.getItem = function (key) {
      var mapped = storageScopedKey(key);
      var scopedVal = _get.call(this, mapped);
      if (scopedVal != null) return scopedVal;
      var rawKey = String(key || "");
      if (/^kv_/i.test(rawKey)) {
        var legacyVal = _get.call(this, rawKey);
        if (legacyVal != null) {
          _set.call(this, mapped, legacyVal);
          return legacyVal;
        }
      }
      return null;
    };
    proto.setItem = function (key, value) {
      return _set.call(this, storageScopedKey(key), value);
    };
    proto.removeItem = function (key) {
      return _rem.call(this, storageScopedKey(key));
    };
  })();

  function formatShortUserMessage(raw, maxLen) {
    maxLen = maxLen || 160;
    var s = String(raw == null ? "" : raw)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    if (!s) return "Something went wrong.";
    if (/DOCTYPE|<html|\.google\.com\/macros/i.test(s) && s.length > 50) {
      return "Network or server error. Check connection and web app URL.";
    }
    if (s.length > maxLen) return s.slice(0, maxLen - 1) + "\u2026";
    return s;
  }

  var HEADERS = [
    "R. No.",
    "Admission Year",
    "Admission No.",
    "Date of Admission",
    "Student Name",
    "House",
    "Date Of Birth",
    "Gender",
    "Category",
    "KV Category",
    "Mother's Name",
    "Mobile No",
    "Mother's Occupation",
    "Fathers Name",
    "Father's Occupation",
    "Address",
    "Admission Class",
    "Admission Quota",
    "Blood Group",
    "Single Girl Child",
    "RTE",
    "Minority",
    "Email ID",
    "UBI ID",
    "Aadhar Card No",
    "APPAR ID",
    "PEN",
    "Reimbursement Claimed",
    "Total Quarterly Fee",
    "Photo",
    "Remark",
  ];
  var COMMON_FIELD_PRESETS = {
    Gender: ["Boy", "Girl"],
    Category: ["SC", "ST", "OBC(CL)", "OBC(NCL)", "GEN", "EWS"],
    "KV Category": ["I", "II", "III", "IV", "V", "VI"],
    "Single Girl Child": ["YES", "NO"],
    RTE: ["YES", "NO"],
    Minority: ["Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Parsi"],
    "Admission Quota": ["SGC", "RTE", "NONE"],
    House: ["Subhash", "Tagore", "Ashoka", "Raman"],
    "Blood Group": ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    "Reimbursement Claimed": ["YES", "NO"],
  };
  var ADD_FORM_FIELD_CONFIG = {
    "R. No.": { type: "text", required: true },
    "Admission Year": { type: "yearSelect" },
    "Admission No.": { type: "text", required: true },
    "Date of Admission": { type: "dateText" },
    "Student Name": { type: "text", required: true },
    House: { type: "select", options: ["Subhash", "Tagore", "Ashoka", "Raman"] },
    "Date Of Birth": { type: "dateText" },
    Gender: { type: "select" },
    Category: { type: "select", options: ["SC", "ST", "OBC(CL)", "OBC(NCL)", "GEN", "EWS"] },
    "KV Category": { type: "select", options: ["I", "II", "III", "IV", "V", "VI"] },
    "Mother's Name": { type: "text" },
    "Mobile No": { type: "text" },
    "Mother's Occupation": { type: "text" },
    "Fathers Name": { type: "text" },
    "Father's Occupation": { type: "text" },
    Address: { type: "text" },
    "Admission Class": { type: "text" },
    "Admission Quota": { type: "select" },
    "Blood Group": { type: "select" },
    "Single Girl Child": { type: "select", options: ["YES", "NO", "NA"] },
    RTE: { type: "select" },
    Minority: { type: "select", options: ["Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Parsi"] },
    "Email ID": { type: "text" },
    "UBI ID": { type: "text" },
    "Aadhar Card No": { type: "text" },
    "APPAR ID": { type: "text" },
    PEN: { type: "text" },
    "Reimbursement Claimed": { type: "select" },
    "Total Quarterly Fee": { type: "text" },
    Photo: { type: "photo" },
    Remark: { type: "text" },
  };

  /** Raw Photo field from row (sheet header may be Photo / photo). */
  function studentPhotoRawFromRow(st) {
    if (!st || typeof st !== "object") return "";
    if (st.Photo != null && String(st.Photo).trim() !== "") return String(st.Photo).trim();
    var k;
    for (k in st) {
      if (!Object.prototype.hasOwnProperty.call(st, k)) continue;
      if (/^photo$/i.test(String(k).trim()) && st[k] != null && String(st[k]).trim() !== "") {
        return String(st[k]).trim();
      }
    }
    return "";
  }

  /** Google Drive share links are HTML pages; use thumbnail endpoint for &lt;img src&gt; (file must be shared). */
  function normalizePhotoUrlForImg(url) {
    if (!url) return "";
    var u = String(url).trim();
    var dm = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
    if (dm) return "https://drive.google.com/thumbnail?id=" + dm[1] + "&sz=s400";
    if (/drive\.google\.com\/open\?/i.test(u)) {
      var om = u.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
      if (om) return "https://drive.google.com/thumbnail?id=" + om[1] + "&sz=s400";
    }
    return u;
  }

  function extractFirstHttpUrl(s) {
    var m = String(s).match(/https?:\/\/[^\s"'<>\]]+/i);
    if (!m) return "";
    return m[0].replace(/[),.;]+$/g, "");
  }

  /** Master "Photo" cell: plain https URL, or Sheets formulas =IMAGE("url") / =HYPERLINK("url",...). */
  function photoUrlFromMasterCell(raw) {
    if (raw == null) return "";
    var s = String(raw)
      .trim()
      .replace(/[\u201c\u201d\u2018\u2019]/g, '"');
    if (!s) return "";
    var m = s.match(/^=IMAGE\s*\(\s*"([^"]+)"/i);
    if (m) return normalizePhotoUrlForImg(m[1].trim());
    m = s.match(/^=IMAGE\s*\(\s*'([^']+)'/i);
    if (m) return normalizePhotoUrlForImg(m[1].trim());
    m = s.match(/^=HYPERLINK\s*\(\s*"([^"]+)"/i);
    if (m) return normalizePhotoUrlForImg(m[1].trim());
    m = s.match(/^=HYPERLINK\s*\(\s*'([^']+)'/i);
    if (m) return normalizePhotoUrlForImg(m[1].trim());
    if (/^https?:\/\//i.test(s)) return normalizePhotoUrlForImg(s);
    var extracted = extractFirstHttpUrl(s);
    if (extracted) return normalizePhotoUrlForImg(extracted);
    return "";
  }

  function emptyRowObject() {
    var o = {};
    for (var i = 0; i < HEADERS.length; i++) o[HEADERS[i]] = "";
    return o;
  }

  function parseCSVLine(line) {
    var out = [];
    var cur = "";
    var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = false;
        } else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") {
          out.push(cur);
          cur = "";
        } else cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, "");
    var lines = text.split(/\r?\n/).filter(function (l) {
      return l.trim().length > 0;
    });
    if (!lines.length) return [];
    var headerCells = parseCSVLine(lines[0]);
    var records = [];
    for (var li = 1; li < lines.length; li++) {
      var vals = parseCSVLine(lines[li]);
      if (vals.every(function (v) { return !String(v).trim(); })) continue;
      if (String(vals[0] != null ? vals[0] : "").trim().indexOf("#") === 0) continue;
      var o = {};
      for (var hi = 0; hi < headerCells.length; hi++) {
        var h = headerCells[hi].trim();
        o[h] = vals[hi] != null ? String(vals[hi]).trim() : "";
      }
      records.push(o);
    }
    return records;
  }

  function loadStudents() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveStudents(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function isStudentActive(st) {
    return !(st && st.isActive === false);
  }

  function activeStudentsOnly(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (isStudentActive(list[i])) out.push(list[i]);
    }
    return out;
  }

  function attendanceEntryKey(rollNo, studentName) {
    var r = String(rollNo != null ? rollNo : "").trim().toLowerCase();
    var n = String(studentName != null ? studentName : "").trim().toLowerCase();
    return r + "::" + n;
  }

  function activeAttendanceKeySetFromStudents(list) {
    var set = {};
    var active = activeStudentsOnly(list || []);
    for (var i = 0; i < active.length; i++) {
      set[attendanceEntryKey(active[i]["R. No."], active[i]["Student Name"])] = true;
    }
    return set;
  }

  function filterAttendanceEntriesToActive(entries, list) {
    var keySet = activeAttendanceKeySetFromStudents(list || []);
    var out = [];
    var src = Array.isArray(entries) ? entries : [];
    for (var i = 0; i < src.length; i++) {
      var e = src[i] || {};
      if (keySet[attendanceEntryKey(e.rollNo, e.studentName)]) out.push(e);
    }
    return out;
  }

  function normalizeAdmnNo(v) {
    return String(v != null ? v : "")
      .trim()
      .toUpperCase();
  }

  function fieldGuideText(header) {
    var cfg = ADD_FORM_FIELD_CONFIG[header] || { type: "text" };
    var requiredTag = cfg.required ? "Required. " : "";
    if (cfg.type === "select") {
      if (Array.isArray(cfg.options) && cfg.options.length) {
        return requiredTag + "Allowed: " + cfg.options.join(" | ");
      }
      if (header === "Admission Quota") {
        var quotaOpts = commonFieldOptions("Admission Quota", students);
        if (quotaOpts && quotaOpts.length) {
          return requiredTag + "Allowed: " + quotaOpts.join(" | ");
        }
        return requiredTag + "Allowed: SGC | RTE | NONE";
      }
      var presets = commonFieldOptions(header, students);
      if (presets && presets.length) return requiredTag + "Allowed: " + presets.join(" | ");
      return requiredTag + "Use dropdown values from Students -> Add/Edit form.";
    }
    if (header === "R. No.") return "Required. Roll number (digits recommended).";
    if (header === "Admission Year") return requiredTag + "Year format: YYYY.";
    if (header === "Admission No.") return "Required. Must be unique.";
    if (header === "Date of Admission" || header === "Date Of Birth") return "Date format: dd/mm/yyyy.";
    if (header === "Mobile No") return "10 digits only.";
    if (header === "Email ID") return "Valid email format (e.g., name@domain.com).";
    if (header === "UBI ID" || header === "APPAR ID" || header === "PEN") return "Numeric only.";
    if (header === "Aadhar Card No") return "12 digits only.";
    if (header === "Total Quarterly Fee") return "Numeric value (e.g., 0, 2500, 2500.50).";
    if (header === "Photo") return "Optional URL or =IMAGE()/=HYPERLINK() formula text.";
    if (header === "Student Name") return "Required text.";
    return requiredTag + "Free text.";
  }

  function buildCsvTemplateRows() {
    var rows = [];
    rows.push(HEADERS.slice());
    rows.push(
      HEADERS.map(function (h, i) {
        if (i === 0) return "# FIELD RULES";
        return fieldGuideText(h);
      })
    );
    rows.push(
      HEADERS.map(function (_, i) {
        if (i === 0) return "# START DATA FROM NEXT ROW";
        return "";
      })
    );
    return rows;
  }

  function buildTemplateInstructionRows() {
    var rows = [];
    rows.push(["Student Bulk Upload - Instructions"]);
    rows.push([""]);
    rows.push(["1) Do not change column names in Data Entry sheet."]);
    rows.push(["2) Fill one student per row in Data Entry sheet."]);
    rows.push(["3) Required fields: R. No., Admission No., Student Name."]);
    rows.push(["4) Date format: dd/mm/yyyy (Date of Admission, Date Of Birth)."]);
    rows.push(["5) Admission No. must be unique for each student."]);
    rows.push(["6) Keep values consistent with allowed options below."]);
    rows.push([""]);
    rows.push(["Field", "Allowed values / format"]);
    for (var i = 0; i < HEADERS.length; i++) {
      rows.push([HEADERS[i], fieldGuideText(HEADERS[i])]);
    }
    return rows;
  }

  function hasDuplicateAdmnNos(list) {
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var admn = normalizeAdmnNo(list[i] && list[i]["Admission No."]);
      if (!admn) return { ok: false, error: 'Missing "Admission No." in one or more rows.' };
      if (seen[admn]) return { ok: false, error: 'Duplicate "Admission No." found: ' + admn };
      seen[admn] = true;
    }
    return { ok: true };
  }

  function admnNoExists(list, admnNo, ignoreId) {
    var want = normalizeAdmnNo(admnNo);
    if (!want) return false;
    for (var i = 0; i < list.length; i++) {
      var st = list[i] || {};
      if (ignoreId != null && Number(st.id) === Number(ignoreId)) continue;
      if (normalizeAdmnNo(st["Admission No."]) === want) return true;
    }
    return false;
  }

  function commonFieldOptions(header, list) {
    var h = String(header || "");
    var preset = COMMON_FIELD_PRESETS[h] || [];
    var seen = {};
    var out = [];
    var i;
    for (i = 0; i < preset.length; i++) {
      var pv = String(preset[i] != null ? preset[i] : "").trim();
      if (!pv) continue;
      if (h === "Admission Quota" && /^saq\??$/i.test(pv)) continue;
      var pk = pv.toLowerCase();
      if (seen[pk]) continue;
      seen[pk] = true;
      out.push(pv);
    }
    var src = Array.isArray(list) ? list : [];
    for (i = 0; i < src.length; i++) {
      var v = String(src[i] && src[i][h] != null ? src[i][h] : "").trim();
      if (!v) continue;
      if (h === "Admission Quota" && /^saq\??$/i.test(v)) continue;
      var k = v.toLowerCase();
      if (seen[k]) continue;
      seen[k] = true;
      out.push(v);
    }
    return out;
  }

  function isDigitsOnly(s) {
    return /^\d+$/.test(String(s || "").trim());
  }

  function normalizeDateToDmy(v) {
    var s = String(v || "").trim();
    if (!s) return "";
    var m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m1) {
      var d1 = parseInt(m1[1], 10);
      var mo1 = parseInt(m1[2], 10);
      var y1 = parseInt(m1[3], 10);
      var dt1 = new Date(y1, mo1 - 1, d1);
      if (dt1.getFullYear() === y1 && dt1.getMonth() === mo1 - 1 && dt1.getDate() === d1) return s;
      return null;
    }
    var m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) {
      var y2 = parseInt(m2[1], 10);
      var mo2 = parseInt(m2[2], 10);
      var d2 = parseInt(m2[3], 10);
      var dt2 = new Date(y2, mo2 - 1, d2);
      if (dt2.getFullYear() !== y2 || dt2.getMonth() !== mo2 - 1 || dt2.getDate() !== d2) return null;
      return (d2 < 10 ? "0" : "") + d2 + "/" + (mo2 < 10 ? "0" : "") + mo2 + "/" + y2;
    }
    var d3 = new Date(s);
    if (!isNaN(d3.getTime())) {
      var d = d3.getDate();
      var m = d3.getMonth() + 1;
      var y = d3.getFullYear();
      return (d < 10 ? "0" : "") + d + "/" + (m < 10 ? "0" : "") + m + "/" + y;
    }
    return null;
  }

  function normalizeStudentDateFields(row) {
    if (!row || typeof row !== "object") return row;
    var keys = ["Date of Admission", "Date Of Birth"];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var raw = String(row[k] != null ? row[k] : "").trim();
      if (!raw) {
        row[k] = "";
        continue;
      }
      var dmy = normalizeDateToDmy(raw);
      row[k] = dmy || "";
    }
    return row;
  }

  function normalizeStudentsDateFields(list) {
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      var row = list[i] || {};
      var beforeDoa = String(row["Date of Admission"] != null ? row["Date of Admission"] : "");
      var beforeDob = String(row["Date Of Birth"] != null ? row["Date Of Birth"] : "");
      normalizeStudentDateFields(row);
      if (beforeDoa !== String(row["Date of Admission"] != null ? row["Date of Admission"] : "") || beforeDob !== String(row["Date Of Birth"] != null ? row["Date Of Birth"] : "")) {
        changed = true;
      }
    }
    return changed;
  }

  function loadMarksheets() {
    try {
      var raw = localStorage.getItem(MARKS_STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveMarksheets(list) {
    localStorage.setItem(MARKS_STORAGE_KEY, JSON.stringify(list));
  }

  function loadMarksPending() {
    try {
      var raw = localStorage.getItem(MARKS_PENDING_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveMarksPending(list) {
    try {
      localStorage.setItem(MARKS_PENDING_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (_e) {}
  }

  function loadStudentStatusPending() {
    try {
      var raw = localStorage.getItem(STUDENT_STATUS_PENDING_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_e) {
      return [];
    }
  }

  function saveStudentStatusPending(list) {
    try {
      localStorage.setItem(STUDENT_STATUS_PENDING_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (_e) {}
  }

  function upsertStudentStatusPending(admnNo, isActive) {
    var key = normalizeAdmnNo(admnNo);
    if (!key) return;
    var q = loadStudentStatusPending();
    var next = [];
    var replaced = false;
    for (var i = 0; i < q.length; i++) {
      var it = q[i] || {};
      if (normalizeAdmnNo(it.admnNo) === key) {
        next.push({ admnNo: key, isActive: !!isActive });
        replaced = true;
      } else {
        next.push(it);
      }
    }
    if (!replaced) next.push({ admnNo: key, isActive: !!isActive });
    saveStudentStatusPending(next);
  }

  function removeStudentStatusPending(admnNo) {
    var key = normalizeAdmnNo(admnNo);
    var q = loadStudentStatusPending();
    q = q.filter(function (it) {
      return normalizeAdmnNo((it || {}).admnNo) !== key;
    });
    saveStudentStatusPending(q);
  }

  function loadStudentAddPending() {
    try {
      var raw = localStorage.getItem(STUDENT_ADD_PENDING_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_e) {
      return [];
    }
  }

  function saveStudentAddPending(list) {
    try {
      localStorage.setItem(STUDENT_ADD_PENDING_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (_e) {}
  }

  function upsertStudentAddPending(studentRow) {
    if (!studentRow || typeof studentRow !== "object") return;
    var admnNo = normalizeAdmnNo(studentRow["Admission No."]);
    if (!admnNo) return;
    var q = loadStudentAddPending();
    var next = [];
    var replaced = false;
    for (var i = 0; i < q.length; i++) {
      var it = q[i] || {};
      if (normalizeAdmnNo(it["Admission No."]) === admnNo) {
        next.push(studentRow);
        replaced = true;
      } else {
        next.push(it);
      }
    }
    if (!replaced) next.push(studentRow);
    saveStudentAddPending(next);
  }

  function removeStudentAddPending(admnNo) {
    var key = normalizeAdmnNo(admnNo);
    var q = loadStudentAddPending().filter(function (it) {
      return normalizeAdmnNo((it || {})["Admission No."]) !== key;
    });
    saveStudentAddPending(q);
  }

  function loadObjectCache(key) {
    try {
      var raw = localStorage.getItem(key);
      var obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" ? obj : {};
    } catch (_e) {
      return {};
    }
  }

  function saveObjectCache(key, obj) {
    try {
      localStorage.setItem(key, JSON.stringify(obj && typeof obj === "object" ? obj : {}));
    } catch (_e) {}
  }

  function backupStorageKeys() {
    return [
      STORAGE_KEY,
      MARKS_STORAGE_KEY,
      MARKS_PENDING_KEY,
      STUDENT_STATUS_PENDING_KEY,
      STUDENT_ADD_PENDING_KEY,
      CONS_STATUS_CACHE_KEY,
      CONS_ABSENT_CACHE_KEY,
      SHEET_SLIP_DETAIL_CACHE_KEY,
      "kv_attendance_cache_v1",
      "kv_attendance_pending_v1",
      "kv_attendance_bulk_pending_v1",
      "kv_attendance_backlog_queue_v1",
    ];
  }

  function collectLocalDatasetSnapshot() {
    var payload = {
      schemaVersion: DRIVE_BACKUP_SCHEMA_VERSION,
      app: "vaayu-browser-app",
      savedAt: new Date().toISOString(),
      storage: {},
    };
    var keys = backupStorageKeys();
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      payload.storage[k] = localStorage.getItem(k);
    }
    return payload;
  }

  function applyLocalDatasetSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") throw new Error("Invalid backup payload.");
    var storage = snapshot.storage || {};
    var keys = backupStorageKeys();
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!Object.prototype.hasOwnProperty.call(storage, k)) continue;
      var v = storage[k];
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, String(v));
    }
  }

  function getDailyBackupMeta() {
    try {
      var raw = localStorage.getItem(DRIVE_BACKUP_META_KEY);
      var obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" ? obj : {};
    } catch (_e) {
      return {};
    }
  }

  function setDailyBackupMeta(meta) {
    try {
      localStorage.setItem(DRIVE_BACKUP_META_KEY, JSON.stringify(meta || {}));
    } catch (_e) {}
  }

  function ymdTodayLocal() {
    var d = new Date();
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  function tryAutoDriveBackupDaily() {
    if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) return Promise.resolve(false);
    var today = ymdTodayLocal();
    var meta = getDailyBackupMeta();
    if (String(meta.ymd || "") === today) return Promise.resolve(false);
    var snapshot = collectLocalDatasetSnapshot();
    return KVSheets.sheetsCall("backupDriveJson", { snapshot: snapshot, source: "auto-daily", userKey: currentUserKey() })
      .then(function (res) {
        setDailyBackupMeta({
          ymd: today,
          fileId: String((res && res.fileId) || ""),
          savedAt: String((res && res.savedAt) || new Date().toISOString()),
        });
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function marksMergeKeyFromRecord(record) {
    return [
      String(record && record.examName != null ? record.examName : "").trim().toLowerCase(),
      String(record && record.subject != null ? record.subject : "").trim().toLowerCase(),
    ].join("::");
  }

  function toMillisSafe(isoLike) {
    var ms = Date.parse(String(isoLike || ""));
    return isNaN(ms) ? 0 : ms;
  }

  function mergeMarksByLatest(localRecords, incomingRecords) {
    var map = {};
    var i;
    function put(rec, source) {
      if (!rec) return;
      var key = marksMergeKeyFromRecord(rec);
      if (!key || key === "::") return;
      var existing = map[key];
      var ts = toMillisSafe(rec.savedAt);
      if (!existing || ts >= existing.ts) map[key] = { record: rec, ts: ts, source: source };
    }
    for (i = 0; i < (localRecords || []).length; i++) put(localRecords[i], "local");
    for (i = 0; i < (incomingRecords || []).length; i++) put(incomingRecords[i], "sheet");
    var out = [];
    var keys = Object.keys(map);
    for (i = 0; i < keys.length; i++) out.push(map[keys[i]].record);
    out.sort(function (a, b) {
      return toMillisSafe(b && b.savedAt) - toMillisSafe(a && a.savedAt);
    });
    return out;
  }

  function fetchAllSheetMarkRecords() {
    if (!window.KVSheets || typeof KVSheets.sheetsCall !== "function") {
      return Promise.reject(new Error("Sheets client not loaded."));
    }
    return KVSheets.sheetsCall("listMarkSlips", {}).then(function (res) {
      var slips = (res && res.slips) || [];
      var jobs = slips.map(function (s) {
        return KVSheets.sheetsCall("getMarkSlip", { slipId: s.slipId }).then(function (detail) {
          return sheetApiToRecord(detail.meta, detail.entries, s.slipId);
        });
      });
      return Promise.all(jobs);
    });
  }

  function upsertMarksPending(record, action) {
    if (!record || record.id == null) return;
    var q = loadMarksPending();
    var id = String(record.id);
    var next = [];
    var replaced = false;
    for (var i = 0; i < q.length; i++) {
      var it = q[i] || {};
      if (String(it.id) === id) {
        next.push({ id: id, action: action, record: record });
        replaced = true;
      } else {
        next.push(it);
      }
    }
    if (!replaced) next.push({ id: id, action: action, record: record });
    saveMarksPending(next);
  }

  function removeMarksPendingById(id) {
    var q = loadMarksPending();
    var sid = String(id);
    q = q.filter(function (it) {
      return String((it || {}).id) !== sid;
    });
    saveMarksPending(q);
  }

  function nextId(list) {
    var m = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id > m) m = list[i].id;
    }
    return m + 1;
  }

  function rowFromImport(rec) {
    var o = emptyRowObject();
    for (var i = 0; i < HEADERS.length; i++) {
      var h = HEADERS[i];
      if (rec[h] != null && String(rec[h]).trim() !== "") o[h] = String(rec[h]).trim();
    }
    return o;
  }

  function filteredStudentNames(students, category, subCategory) {
    if (!category || !subCategory || category === "Select" || subCategory === "Select") {
      return { error: "Please select a category and a value in sub category." };
    }
    var nameKey = "Student Name";
    var catKey = "Category";
    var admnCatKey = "KV Category";
    var houseKey = "House";
    var genderKey = "Gender";
    var minorityKey = "Minority";
    var sgcKey = "Single Girl Child";
    var rteKey = "RTE";
    var names = [];
    for (var i = 0; i < students.length; i++) {
      var s = students[i];
      var isMatch = false;
      if (category === "ADMISSION QUOTA" || category === "QUOTA") {
        if (subCategory === "SGC" && String(s[sgcKey] || "").trim().toUpperCase() === "YES") isMatch = true;
        else if (subCategory === "RTE" && String(s[rteKey] || "").trim().toUpperCase() === "YES") isMatch = true;
      } else if (category === "SOCIAL CAT") {
        var studentCat = String(s[catKey] || "").trim();
        if (subCategory === "OBC-All") {
          if (
            studentCat === "OBC(CL)" ||
            studentCat === "OBC(NCL)" ||
            studentCat === "OBC-CL" ||
            studentCat === "OBC-NCL"
          )
            isMatch = true;
        } else {
          if (studentCat === subCategory) isMatch = true;
          else if (subCategory === "OBC-CL" && studentCat === "OBC(CL)") isMatch = true;
          else if (subCategory === "OBC-NCL" && studentCat === "OBC(NCL)") isMatch = true;
        }
      } else {
        var targetKey = null;
        if (category === "HOUSE") targetKey = houseKey;
        else if (category === "KV CAT") targetKey = admnCatKey;
        else if (category === "GENDER") targetKey = genderKey;
        else if (category === "MINORITY") targetKey = minorityKey;
        if (targetKey && String(s[targetKey] || "").trim() === String(subCategory).trim()) isMatch = true;
      }
      if (isMatch) {
        var n = String(s[nameKey] || "").trim();
        if (n) names.push(n);
      }
    }
    names.sort();
    return { names: names };
  }

  function getUniqueValues(students, colIndex) {
    var h = HEADERS[colIndex];
    if (!h) return [];
    var set = {};
    for (var i = 0; i < students.length; i++) {
      var v = String(students[i][h] ?? "").trim();
      if (v) set[v] = true;
    }
    return Object.keys(set).sort();
  }

  function filteredListByColumn(students, colIndex, subValue) {
    var h = HEADERS[colIndex];
    var nameKey = "Student Name";
    if (!h) return [];
    var matches = [];
    for (var i = 0; i < students.length; i++) {
      var s = students[i];
      if (String(s[h] ?? "").trim() === String(subValue).trim()) {
        var n = String(s[nameKey] || "").trim();
        if (n) matches.push(n);
      }
    }
    matches.sort();
    return matches;
  }

  function getSingleValue(students, studentName, colIndex) {
    var h = HEADERS[colIndex];
    if (!h) return "-";
    var row = null;
    for (var i = 0; i < students.length; i++) {
      if (String(students[i]["Student Name"] || "").trim() === String(studentName).trim()) {
        row = students[i];
        break;
      }
    }
    if (!row) return "-";
    var v = row[h];
    return v != null && String(v).trim() !== "" ? String(v) : "-";
  }

  function studentProfile(students, studentName) {
    var row = null;
    for (var i = 0; i < students.length; i++) {
      if (String(students[i]["Student Name"] || "").trim() === String(studentName).trim()) {
        row = students[i];
        break;
      }
    }
    if (!row) return null;
    var out = [];
    for (var j = 0; j < HEADERS.length; j++) {
      var header = HEADERS[j];
      var val = row[header];
      out.push([header, val != null && val !== "" ? String(val) : "-"]);
    }
    return out;
  }

  function isDataStudentRow(s) {
    if (String(s["R. No."] != null ? s["R. No."] : "").trim() !== "") return true;
    if (String(s["Student Name"] != null ? s["Student Name"] : "").trim() !== "") return true;
    return false;
  }

  function studentsForMarksEntry(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (!isStudentActive(list[i])) continue;
      if (isDataStudentRow(list[i])) out.push(list[i]);
    }
    out.sort(function (a, b) {
      var sa = String(a["R. No."] != null ? a["R. No."] : "").trim();
      var sb = String(b["R. No."] != null ? b["R. No."] : "").trim();
      var na = parseFloat(sa.replace(/[^\d.]/g, ""));
      var nb = parseFloat(sb.replace(/[^\d.]/g, ""));
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return sa.localeCompare(sb, undefined, { numeric: true });
    });
    return out;
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatExamDateDisplay(ymd) {
    if (!ymd || !String(ymd).trim()) return "";
    var p = String(ymd).trim().split("-");
    if (p.length === 3) return pad2(parseInt(p[2], 10)) + "/" + pad2(parseInt(p[1], 10)) + "/" + p[0];
    return String(ymd);
  }

  function dateToDdMmYyyy(d) {
    if (!d || isNaN(d.getTime())) return "";
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  /** Display any sheet/API date string as dd/mm/yyyy where possible. */
  function formatIsoOrAnyDateStringToDdMmYyyy(v) {
    if (v == null || v === "") return "";
    var s = typeof v === "string" ? v : String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return formatExamDateDisplay(s.slice(0, 10));
    var d = new Date(s);
    if (!isNaN(d.getTime())) return dateToDdMmYyyy(d);
    return s;
  }

  function formatSubmittedWhenLine(raw) {
    if (raw == null || String(raw).trim() === "") return "";
    var s = String(raw).trim();
    var d = new Date(s);
    if (isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) {
      d = new Date(s.slice(0, 10) + "T12:00:00");
    }
    if (isNaN(d.getTime())) return "";
    var datePart = dateToDdMmYyyy(d);
    var h = d.getHours();
    var mi = d.getMinutes();
    var ampm = h >= 12 ? "pm" : "am";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return datePart + " at " + h12 + ":" + pad2(mi) + " " + ampm;
  }

  /**
   * YYYY-MM-DD for &lt;input type="date"&gt; from sheet/API (ISO, datetime string, or Date).
   * Same logic as teacher TeacherMarks.html examDateToInputValue.
   */
  function marksExamDateToInputValue(v) {
    if (v == null || v === "") return "";
    if (typeof v === "string") {
      var t = v.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    }
    var d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return "";
    var y = d.getFullYear();
    var mo = d.getMonth() + 1;
    var day = d.getDate();
    return y + "-" + (mo < 10 ? "0" : "") + mo + "-" + (day < 10 ? "0" : "") + day;
  }

  function applyKvBranding() {
    var school = String(typeof window.KV_SCHOOL_NAME !== "undefined" && window.KV_SCHOOL_NAME != null ? window.KV_SCHOOL_NAME : "").trim();
    var klass = String(typeof window.KV_SCHOOL_CLASS !== "undefined" && window.KV_SCHOOL_CLASS != null ? window.KV_SCHOOL_CLASS : "").trim();
    if (!school) school = "School name";
    var side = document.getElementById("appBrandSchool");
    if (side) side.textContent = school;
    var sideC = document.getElementById("appBrandClass");
    if (sideC) {
      var showC = klass && klass !== "—";
      sideC.textContent = showC ? klass : "";
      sideC.hidden = !showC;
    }
    var top = document.getElementById("appTopBarSchool");
    if (top) {
      top.textContent = klass && klass !== "—" ? school + " · " + klass : school;
    }
    document.title = "Vaayu";
    var modalSchool = document.getElementById("modalSchoolName");
    if (modalSchool) modalSchool.textContent = school;
  }

  function currentAccountInfo() {
    try {
      if (window.AndroidAccount && typeof window.AndroidAccount.getCurrentAccountJson === "function") {
        var raw = window.AndroidAccount.getCurrentAccountJson();
        var obj = raw ? JSON.parse(String(raw)) : {};
        if (obj && obj.signedIn) return obj;
      }
    } catch (_e) {}
    try {
      if (window.KVGoogleSignIn && typeof KVGoogleSignIn.getAccountInfo === "function") {
        var web = KVGoogleSignIn.getAccountInfo();
        if (web && web.signedIn) return web;
      }
    } catch (_e2) {}
    return { signedIn: false, email: "", displayName: "", id: "" };
  }

  function preferredAccountKey(info) {
    var email = String(info && info.email ? info.email : "").trim().toLowerCase();
    if (email) return email;
    var id = String(info && info.id ? info.id : "").trim();
    if (id) return "gid_" + id;
    return "guest";
  }

  function updateAccountUiLine() {
    var line = document.getElementById("settingsAccountLine");
    if (!line) return;
    var info = currentAccountInfo();
    if (info && info.signedIn) {
      var label = String(info.displayName || info.email || "Signed-in user");
      line.textContent = "Account: " + label + " (" + String(info.email || "").trim() + ")";
    } else {
      line.textContent = "Account: Guest (local only)";
    }
    updateGoogleSignInHint();
  }

  function updateGoogleSignInHint() {
    var el = document.getElementById("settingsGoogleSignInHint");
    if (!el) return;
    if (window.AndroidAccount && typeof window.AndroidAccount.getCurrentAccountJson === "function") {
      el.hidden = true;
      return;
    }
    var clientId = String(typeof window.KV_GOOGLE_WEB_CLIENT_ID !== "undefined" ? window.KV_GOOGLE_WEB_CLIENT_ID : "").trim();
    if (clientId) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML =
      "<strong>Web sign-in setup (one time):</strong> Open " +
      '<a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud → Credentials</a> ' +
      "(use the same GCP project as your Apps Script). Create an <strong>OAuth client ID</strong> → type <strong>Web application</strong>. " +
      "Under <strong>Authorized JavaScript origins</strong> add <code>http://localhost:3000</code> (must match the URL in your browser). " +
      "Copy the client ID into <code>KV_GOOGLE_WEB_CLIENT_ID</code> in <code>sheets-webapp-config.js</code>, save, and hard-refresh this page.";
  }

  function requireSignedInForDrive() {
    var info = currentAccountInfo();
    if (info && info.signedIn) return true;
    alert("Please sign in with Google first.");
    return false;
  }

  function modalClassSubtitle() {
    var klass = String(typeof window.KV_SCHOOL_CLASS !== "undefined" && window.KV_SCHOOL_CLASS != null ? window.KV_SCHOOL_CLASS : "").trim();
    return klass && klass !== "—" ? klass : "";
  }

  function marksValidHint(maxMarks) {
    var m = parseFloat(String(maxMarks).replace(/,/g, "."));
    if (!isNaN(m) && m > 0) {
      return "Enter valid marks less than or equal to " + m + " or AB.";
    }
    return "Enter valid marks or AB.";
  }

  function normalizeMarksInput(raw, maxMarks) {
    var s = String(raw).trim();
    var hint = marksValidHint(maxMarks);
    if (!s) return { error: "EMPTY", emptyMsg: "Enter a mark or AB for each student." };
    if (/^a(b)?$/i.test(s)) return { ok: true, isAb: true, display: "AB" };
    var n = parseFloat(s.replace(/,/g, "."));
    if (isNaN(n)) return { error: hint };
    if (n < 0) return { error: hint };
    if (n > maxMarks) return { error: hint };
    return { ok: true, isAb: false, num: n, display: s };
  }

  function getMarksMaxNumber() {
    var el = document.getElementById("marksMax");
    if (!el) return NaN;
    var maxStr = String(el.value).trim();
    if (!maxStr) return NaN;
    return parseFloat(maxStr.replace(/,/g, "."));
  }

  /** On blur/submit only: a / ab / Ab → display AB (absent). Do not run on input — allows typing "ab". */
  function normalizeAbsentOnBlur(inp) {
    var s = String(inp.value).trim();
    if (/^a(b)?$/i.test(s)) {
      inp.value = "AB";
      return true;
    }
    return false;
  }

  /** Real-time cell validation while typing (empty allowed until submit). */
  function validateMarksRealtime(raw, maxMarks) {
    if (maxMarks == null || isNaN(maxMarks) || maxMarks <= 0) {
      return { level: "nomax", message: "Set maximum marks first." };
    }
    var hint = marksValidHint(maxMarks);
    var s = String(raw).trim();
    if (!s) return { level: "empty" };
    if (/^a(b)?$/i.test(s)) return { level: "ok" };
    if (/[a-z]/i.test(s)) return { level: "bad", message: hint };
    if (!/^\d*\.?\d*$/.test(s)) return { level: "bad", message: hint };
    var n = parseFloat(s.replace(/,/g, "."));
    if (isNaN(n)) return { level: "partial", message: hint };
    if (n < 0) return { level: "bad", message: hint };
    if (n > maxMarks) return { level: "bad", message: hint };
    return { level: "ok" };
  }

  function applyMarksCellValidation(inp) {
    var maxN = getMarksMaxNumber();
    var wrap = inp.parentNode;
    var errSpan = wrap && wrap.querySelector ? wrap.querySelector(".marks-cell-error") : null;
    var v = validateMarksRealtime(inp.value, maxN);
    inp.classList.remove("marks-invalid");
    if (errSpan) errSpan.textContent = "";
    if (v.level === "nomax") {
      if (String(inp.value).trim()) {
        inp.classList.add("marks-invalid");
        if (errSpan) errSpan.textContent = v.message;
      }
      return;
    }
    if (v.level === "bad") {
      inp.classList.add("marks-invalid");
      if (errSpan) errSpan.textContent = v.message;
    }
  }

  function showMarksValidationMessage(message) {
    var m = formatShortUserMessage(String(message || "").trim() || "Invalid value.", 200);
    if (typeof window.KV_showOkDialog === "function") {
      window.KV_showOkDialog(m);
    } else {
      alert(m);
    }
  }

  /** On blur: normalize AB, then clear invalid / incomplete values and show a message. */
  function finalizeMarksCellOnBlur(inp) {
    normalizeAbsentOnBlur(inp);
    var maxN = getMarksMaxNumber();
    var v = validateMarksRealtime(inp.value, maxN);
    var s = String(inp.value).trim();
    if (s === "") {
      applyMarksCellValidation(inp);
      return;
    }
    if (v.level === "ok") {
      applyMarksCellValidation(inp);
      return;
    }
    var msg =
      v.message || (v.level === "partial" ? "Enter a number or AB." : "Use a number or AB.");
    inp.value = "";
    applyMarksCellValidation(inp);
    showMarksValidationMessage(msg);
  }

  function revalidateAllMarksInputs() {
    var nodes = document.querySelectorAll("#marksStudentTbody input.marks-cell-input");
    for (var vi = 0; vi < nodes.length; vi++) applyMarksCellValidation(nodes[vi]);
  }

  function focusAdjacentMarksInput(current, delta) {
    var all = Array.prototype.slice.call(
      document.querySelectorAll("#marksStudentTbody input.marks-cell-input")
    );
    var idx = all.indexOf(current);
    if (idx < 0) return;
    var next = all[idx + delta];
    if (next) {
      next.focus();
      if (typeof next.select === "function") next.select();
    }
  }

  /** True if Enter/arrow should not move to another marks cell. */
  function marksCellBlocksNavigation(inp) {
    if (!inp) return false;
    var maxN = getMarksMaxNumber();
    var v = validateMarksRealtime(inp.value, maxN);
    if (v.level === "bad") return true;
    if (v.level === "nomax" && String(inp.value).trim()) return true;
    if (v.level === "partial" && String(inp.value).trim()) return true;
    return false;
  }

  function marksCellNavigationWarningMessage(inp) {
    var maxN = getMarksMaxNumber();
    var v = validateMarksRealtime(inp.value, maxN);
    if (v.message) return v.message;
    if (v.level === "partial") return "Enter a number or AB.";
    return "Fix this cell first.";
  }

  /** Roll number (R. No.) stored as marks entry studentId and in Sheets column StudentId. */
  function marksStudentPersistId(st) {
    return String(st["R. No."] != null ? st["R. No."] : "").trim();
  }

  /** data-student-id value: roll when present, else stable internal key (empty rolls). */
  function marksStudentDomKey(st) {
    var r = marksStudentPersistId(st);
    return r || "__nir_" + String(st.id);
  }

  /** Validates form + marks; returns { meta, rows, record } or null. */
  function tryBuildMarksSlipRecord() {
    var maxStr = document.getElementById("marksMax").value.trim();
    var maxMarks = parseFloat(maxStr.replace(/,/g, "."));
    if (!maxStr || isNaN(maxMarks) || maxMarks <= 0) {
      showMarksValidationMessage("Enter valid maximum marks.");
      return null;
    }
    revalidateAllMarksInputs();
    if (document.querySelector("#marksStudentTbody input.marks-cell-input.marks-invalid")) {
      showMarksValidationMessage("Fix red cells first.");
      return null;
    }
    var teacher = document.getElementById("marksTeacher").value.trim();
    if (!teacher) {
      showMarksValidationMessage("Enter teacher name.");
      return null;
    }
    var examDate = document.getElementById("marksExamDate").value;
    if (!examDate) {
      showMarksValidationMessage("Select exam date.");
      return null;
    }
    var subject = document.getElementById("marksSubject").value;
    var examName = document.getElementById("marksExam").value;
    if (!subject || !examName) {
      showMarksValidationMessage("Select examination and subject.");
      return null;
    }
    var list = studentsForMarksEntry(students);
    if (!list.length) {
      showMarksValidationMessage("No students to mark.");
      return null;
    }
    var markNodes = document.querySelectorAll("#marksStudentTbody input.marks-cell-input");
    var inpByKey = {};
    for (var ki = 0; ki < markNodes.length; ki++) {
      var kAttr = markNodes[ki].getAttribute("data-student-id");
      if (kAttr) inpByKey[kAttr] = markNodes[ki];
    }
    var rows = [];
    var entries = [];
    for (var mi = 0; mi < list.length; mi++) {
      var st = list[mi];
      var want = marksStudentDomKey(st);
      var inp = inpByKey[want];
      if (!inp) {
        showMarksValidationMessage("Could not read marks for all students.");
        return null;
      }
      var stName = String(st["Student Name"] || "").trim() || "—";
      normalizeAbsentOnBlur(inp);
      var v = normalizeMarksInput(inp.value, maxMarks);
      if (v.error) {
        if (v.error === "EMPTY") {
          showMarksValidationMessage(v.emptyMsg);
        } else {
          showMarksValidationMessage(v.error);
        }
        return null;
      }
      var roll = String(st["R. No."] != null ? st["R. No."] : "").trim() || "—";
      var rollId = marksStudentPersistId(st);
      var nm = stName;
      var pctDisplay = v.isAb ? "—" : ((v.num / maxMarks) * 100).toFixed(2) + "%";
      rows.push({
        roll: roll,
        name: nm,
        marksDisplay: v.display,
        pctDisplay: pctDisplay,
      });
      entries.push({
        studentId: rollId,
        rollNo: roll,
        studentName: nm,
        marks: v.isAb ? "AB" : v.num,
      });
    }
    var record = {
      id: Date.now(),
      savedAt: new Date().toISOString(),
      maxMarks: maxMarks,
      teacherName: teacher,
      examDate: examDate,
      examDateDisplay: formatExamDateDisplay(examDate),
      subject: subject,
      examName: examName,
      entries: entries,
    };
    var meta = {
      subject: subject,
      examName: examName,
      examDateDisplay: formatExamDateDisplay(examDate),
      maxMarks: maxMarks,
      teacherName: teacher,
    };
    return { meta: meta, rows: rows, entries: entries, record: record };
  }

  /** Build PDF meta + rows from a slip stored in kv_marksheets_v1 (same as duplicate A4 mark slip). */
  function recordToPdfPayload(record) {
    if (!record || !record.entries || !record.entries.length) return null;
    var maxMarks = Number(record.maxMarks);
    if (isNaN(maxMarks) || maxMarks <= 0) maxMarks = 1;
    var meta = {
      subject: String(record.subject || ""),
      examName: String(record.examName || ""),
      examDateDisplay: String(
        record.examDateDisplay || formatExamDateDisplay(record.examDate || "")
      ),
      maxMarks: maxMarks,
      teacherName: String(record.teacherName || ""),
    };
    var pdfRows = [];
    for (var ri = 0; ri < record.entries.length; ri++) {
      var e = record.entries[ri];
      var m = String(e.marks != null ? e.marks : "").trim();
      var isAb = /^ab$/i.test(m);
      var n = parseFloat(m.replace(/,/g, "."));
      var pctDisplay = isAb ? "—" : !isNaN(n) ? ((n / maxMarks) * 100).toFixed(2) + "%" : "—";
      pdfRows.push({
        roll: String(e.rollNo != null ? e.rollNo : ""),
        name: String(e.studentName != null ? e.studentName : ""),
        marksDisplay: isAb ? "AB" : m,
        pctDisplay: pctDisplay,
      });
    }
    return { meta: meta, rows: pdfRows };
  }

  var MARKS_EXAMS_DEFAULT = ["PT1", "PT2", "Half Yearly", "SEE"];
  var MARKS_SUBJECTS_DEFAULT = ["English", "Hindi", "Maths", "Science", "Social Science", "Sanskrit", "AI"];
  var _marksSlipsSyncPromise = null;
  /** When true, full entry form is shown for edit/new regardless of resolved slip. */
  var _marksPickerEditing = false;
  /** Suppress exam/subject change handlers while applying a slip (avoids clearing date / edit state). */
  var _marksSelectProgrammatic = false;

  function syncMarkSlipsListFromSheets(opts) {
    if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
      return Promise.resolve();
    }
    if (_marksSlipsSyncPromise) return _marksSlipsSyncPromise;
    _marksSlipsSyncPromise = KVSheets.sheetsCall("listMarkSlips", {})
      .then(function (data) {
        _cachedSheetsSlips = data.slips || [];
      })
      .catch(function (e) {
        if (opts && opts.silent) console.warn("Mark slips sync:", e && e.message ? e.message : e);
        else alert(e.message || String(e));
      })
      .finally(function () {
        _marksSlipsSyncPromise = null;
      });
    return _marksSlipsSyncPromise;
  }

  var _studentsSyncPromise = null;
  var _onlineSyncDebounceTimer = null;
  var _editingStudentId = null;
  var _suppressEditResetOnce = false;

  function normalizeStudentsFromSheetApi(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || typeof s !== "object") continue;
      var o = {};
      for (var k in s) {
        if (Object.prototype.hasOwnProperty.call(s, k) && k !== "id") o[k] = s[k];
      }
      o.id = i + 1;
      var statusRaw = "";
      if (o.Status != null && String(o.Status).trim() !== "") statusRaw = String(o.Status).trim();
      else if (o["Student Status"] != null && String(o["Student Status"]).trim() !== "") statusRaw = String(o["Student Status"]).trim();
      else if (o.IsActive != null && String(o.IsActive).trim() !== "") statusRaw = String(o.IsActive).trim();
      else if (o.Active != null && String(o.Active).trim() !== "") statusRaw = String(o.Active).trim();
      if (!statusRaw) o.isActive = true;
      else {
        var sx = String(statusRaw).trim().toLowerCase();
        o.isActive = !(sx === "deactivated" || sx === "inactive" || sx === "false" || sx === "0" || sx === "no" || sx === "off");
      }
      normalizeStudentDateFields(o);
      out.push(o);
    }
    return out;
  }

  /** Replace local students from the Master tab when the API returns at least one row. */
  function syncStudentsFromSheets(opts) {
    if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
      return Promise.resolve(false);
    }
    if (_studentsSyncPromise) return _studentsSyncPromise;
    _studentsSyncPromise = KVSheets.sheetsCall("getStudents", {})
      .then(function (data) {
        var list = normalizeStudentsFromSheetApi(data.students || []);
        if (!list.length) {
          if (opts && opts.silent) console.warn("Master sync: no rows returned; keeping local list.");
          return false;
        }
        var check = hasDuplicateAdmnNos(list);
        if (!check.ok) {
          if (opts && opts.silent) console.warn("Master sync rejected:", check.error);
          else alert(check.error + " Sync skipped; local data unchanged.");
          return false;
        }
        var pending = loadStudentStatusPending();
        if (pending.length) {
          var map = {};
          for (var pi = 0; pi < pending.length; pi++) {
            var p = pending[pi] || {};
            var k = normalizeAdmnNo(p.admnNo);
            if (!k) continue;
            map[k] = p.isActive !== false;
          }
          for (var li = 0; li < list.length; li++) {
            var ak = normalizeAdmnNo(list[li] && list[li]["Admission No."]);
            if (ak && Object.prototype.hasOwnProperty.call(map, ak)) {
              list[li].isActive = !!map[ak];
            }
          }
        }
        students = list;
        saveStudents(students);
        return true;
      })
      .catch(function (e) {
        var msg = e && e.message ? e.message : String(e);
        if (/failed to fetch/i.test(msg)) {
          msg =
            "Could not reach Google Sheets (network/CORS). Hard-refresh the page and try Sync again.";
        }
        var emptyLocal = !students.length;
        if (opts && opts.silent && !emptyLocal) console.warn("Master sync:", msg);
        else alert(msg);
        return false;
      })
      .finally(function () {
        _studentsSyncPromise = null;
      });
    return _studentsSyncPromise;
  }

  /** Subject teachers may write only when true (Script property KV_MARKS_ENTRY_ENABLED). */
  var _marksEntryEnabled = true;
  var _marksEntryToggleProgrammatic = false;
  /** True while setMarksEntryPolicy request is in flight — avoid stale policy overwriting the toggle. */
  var _marksEntryPolicySaveInFlight = false;

  function refreshMarksEntryPolicyFromServer(opts) {
    opts = opts || {};
    var silent = !!opts.silent;
    if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
      return Promise.resolve();
    }
    return KVSheets.sheetsCall("getMarksEntryPolicy", {})
      .then(function (data) {
        if (_marksEntryPolicySaveInFlight) return;
        _marksEntryEnabled = data.marksEntryEnabled !== false;
      })
      .catch(function (e) {
        if (silent) console.warn("Marks entry policy:", e && e.message ? e.message : e);
        else alert(e.message || String(e));
      });
  }

  function syncMarksEntryToggleFromCache() {
    if (_marksEntryPolicySaveInFlight) return;
    var el = document.getElementById("marksEntryToggle");
    if (!el) return;
    _marksEntryToggleProgrammatic = true;
    el.checked = !!_marksEntryEnabled;
    _marksEntryToggleProgrammatic = false;
  }

  function updateMarksEntryToggleRowState() {
    var row = document.getElementById("marksEntryToggleRow");
    var tgl = document.getElementById("marksEntryToggle");
    if (!tgl) return;
    var has = !!(window.KVSheets && typeof KVSheets.getSheetsUrl === "function" && KVSheets.getSheetsUrl());
    tgl.disabled = !has;
    if (row) row.classList.toggle("marks-entry-policy-row--disabled", !has);
  }

  var _currentAppNavId = "home";
  var _foregroundPollTimer = null;
  var _foregroundPullInFlight = false;
  var _foregroundVisibilityBound = false;

  function retryPendingMarksInBackground() {
    if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
      return Promise.resolve(false);
    }
    var q = loadMarksPending();
    if (!q.length) return Promise.resolve(false);
    var i = 0;
    function next() {
      if (i >= q.length) return Promise.resolve(true);
      var item = q[i++] || {};
      if (!item.record || !item.action) return next();
      return KVSheets.sheetsCall(item.action, { record: item.record })
        .then(function () {
          removeMarksPendingById(item.id);
        })
        .catch(function () {})
        .then(next);
    }
    return next();
  }

  function retryPendingStudentStatusInBackground() {
    if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
      return Promise.resolve(false);
    }
    var q = loadStudentStatusPending();
    if (!q.length) return Promise.resolve(false);
    var i = 0;
    function next() {
      if (i >= q.length) return Promise.resolve(true);
      var item = q[i++] || {};
      var admnNo = normalizeAdmnNo(item.admnNo);
      if (!admnNo) return next();
      return KVSheets.sheetsCall("setStudentActiveStatus", { admnNo: admnNo, isActive: item.isActive !== false })
        .then(function () {
          removeStudentStatusPending(admnNo);
        })
        .catch(function () {})
        .then(next);
    }
    return next();
  }

  function retryPendingStudentAddsInBackground() {
    if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
      return Promise.resolve(false);
    }
    var q = loadStudentAddPending();
    if (!q.length) return Promise.resolve(false);
    var i = 0;
    function next() {
      if (i >= q.length) return Promise.resolve(true);
      var row = q[i++] || {};
      var admnNo = normalizeAdmnNo(row["Admission No."]);
      if (!admnNo) return next();
      return KVSheets.sheetsCall("addStudentToMaster", { row: row })
        .then(function () {
          removeStudentAddPending(admnNo);
        })
        .catch(function () {})
        .then(next);
    }
    return next();
  }

  function isAddStudentEntryActive() {
    var studentsView = document.getElementById("view-students");
    if (!studentsView || studentsView.hidden) return false;
    var panelAdd = document.getElementById("panelAdd");
    if (!panelAdd || panelAdd.hidden) return false;
    var form = document.getElementById("formAdd");
    if (!form) return false;
    var nodes = form.querySelectorAll("input, select, textarea");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.type === "file") {
        if (n.files && n.files.length) return true;
      } else if (String(n.value || "").trim()) {
        return true;
      }
    }
    return false;
  }

  function getForegroundPollIntervalMs() {
    try {
      var raw = window.KV_SHEETS_FOREGROUND_POLL_MS;
      if (raw === false || raw === -1) return 0;
      if (typeof raw === "string" && raw.toLowerCase() === "off") return 0;
      if (raw == null || raw === "") return 45000;
      var n = parseInt(String(raw), 10);
      if (isNaN(n) || n === 0) return 45000;
      if (n < 15000) return 15000;
      if (n > 600000) return 600000;
      return n;
    } catch (e) {
      return 45000;
    }
  }

  function shouldForegroundPollSheets() {
    if (document.visibilityState !== "visible") return false;
    if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
      return false;
    }
    if (_currentAppNavId === "setup") return false;
    return true;
  }

  function tickForegroundSheetPoll() {
    if (!shouldForegroundPollSheets()) return;
    if (_foregroundPullInFlight) return;
    _foregroundPullInFlight = true;
    pullSheetsIntoApp({ silent: true }).finally(function () {
      _foregroundPullInFlight = false;
    });
  }

  /** Periodic pull while the app is on-screen (not Setup) so other people’s sheet edits appear. */
  function startForegroundSheetPolling() {
    if (_foregroundPollTimer) clearInterval(_foregroundPollTimer);
    _foregroundPollTimer = null;
    var ms = getForegroundPollIntervalMs();
    if (ms <= 0) return;
    _foregroundPollTimer = setInterval(tickForegroundSheetPoll, ms);
    if (!_foregroundVisibilityBound) {
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
          tickForegroundSheetPoll();
        }
      });
      _foregroundVisibilityBound = true;
    }
  }

  /**
   * Pull Master + Marks slip index from Google Sheets into local state.
   * Use on app open, Sync button, when the browser goes online again, and foreground polling.
   */
  function pullSheetsIntoApp(opts) {
    opts = opts || {};
    var silent = !!opts.silent;
    return Promise.all([
      retryPendingMarksInBackground(),
      retryPendingStudentAddsInBackground(),
      retryPendingStudentStatusInBackground(),
      syncStudentsFromSheets({ silent: silent }),
      syncMarkSlipsListFromSheets({ silent: silent }),
      refreshMarksEntryPolicyFromServer({ silent: silent }),
    ]).finally(function () {
      if (isAddStudentEntryActive()) return;
      refreshUI();
      syncMarksEntryToggleFromCache();
      updateMarksEntryToggleRowState();
      if (!marksHasUnsavedMarksDraft()) {
        rebuildMarksExamSelectOptions();
        var mex = document.getElementById("marksExam");
        rebuildMarksSubjectSelectForExam(mex ? mex.value : "");
        updateMarksPickerUI();
      }
      try {
        if (typeof window.__kvRunAttendanceBackgroundSync === "function") {
          window.__kvRunAttendanceBackgroundSync({ refreshToday: true, preloadBacklog: true });
        }
        if (typeof window.__kvPrimeAttendanceTodayDraft === "function") {
          window.__kvPrimeAttendanceTodayDraft();
        }
        if (typeof window.__kvPrefetchTimetables === "function") {
          window.__kvPrefetchTimetables();
        }
      } catch (_e) {}
    });
  }

  function wireSheetsReconnectSync() {
    window.addEventListener("online", function () {
      if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
        return;
      }
      if (_onlineSyncDebounceTimer) clearTimeout(_onlineSyncDebounceTimer);
      _onlineSyncDebounceTimer = setTimeout(function () {
        _onlineSyncDebounceTimer = null;
        pullSheetsIntoApp({ silent: true });
      }, 400);
    });
  }

  function collectMarksExamKeys() {
    var set = {};
    var i;
    for (i = 0; i < MARKS_EXAMS_DEFAULT.length; i++) set[MARKS_EXAMS_DEFAULT[i]] = true;
    var local = loadMarksheets();
    for (i = 0; i < local.length; i++) {
      var ex = String(local[i].examName != null ? local[i].examName : "").trim();
      if (ex) set[ex] = true;
    }
    for (i = 0; i < _cachedSheetsSlips.length; i++) {
      var sx = String(_cachedSheetsSlips[i].exam != null ? _cachedSheetsSlips[i].exam : "").trim();
      if (sx) set[sx] = true;
    }
    return Object.keys(set).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function collectMarksSubjectKeysForExam(exam) {
    var ex = String(exam || "").trim();
    var set = {};
    var i;
    for (i = 0; i < MARKS_SUBJECTS_DEFAULT.length; i++) set[MARKS_SUBJECTS_DEFAULT[i]] = true;
    var local = loadMarksheets();
    for (i = 0; i < local.length; i++) {
      if (String(local[i].examName != null ? local[i].examName : "").trim() !== ex) continue;
      var su = String(local[i].subject != null ? local[i].subject : "").trim();
      if (su) set[su] = true;
    }
    for (i = 0; i < _cachedSheetsSlips.length; i++) {
      if (String(_cachedSheetsSlips[i].exam != null ? _cachedSheetsSlips[i].exam : "").trim() !== ex) continue;
      var ss = String(_cachedSheetsSlips[i].subject != null ? _cachedSheetsSlips[i].subject : "").trim();
      if (ss) set[ss] = true;
    }
    return Object.keys(set).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function rebuildMarksExamSelectOptions() {
    var sel = document.getElementById("marksExam");
    if (!sel) return;
    var cur = sel.value;
    var keys = collectMarksExamKeys();
    sel.innerHTML = '<option value="">— Select —</option>';
    for (var j = 0; j < keys.length; j++) {
      var o = document.createElement("option");
      o.value = keys[j];
      o.textContent = keys[j];
      sel.appendChild(o);
    }
    if (cur && keys.indexOf(cur) >= 0) sel.value = cur;
  }

  function rebuildMarksSubjectSelectForExam(exam) {
    var sel = document.getElementById("marksSubject");
    if (!sel) return;
    var cur = sel.value;
    var keys = exam ? collectMarksSubjectKeysForExam(exam) : [];
    sel.innerHTML = exam
      ? '<option value="">— Select —</option>'
      : '<option value="">— Select examination first —</option>';
    for (var j = 0; j < keys.length; j++) {
      var o = document.createElement("option");
      o.value = keys[j];
      o.textContent = keys[j];
      sel.appendChild(o);
    }
    if (cur && keys.indexOf(cur) >= 0) sel.value = cur;
  }

  function slipMatchesExamSubjectRecord(exam, subject, record) {
    return (
      String(record.examName != null ? record.examName : "")
        .trim()
        .toLowerCase() === String(exam || "")
          .trim()
          .toLowerCase() &&
      String(record.subject != null ? record.subject : "")
        .trim()
        .toLowerCase() === String(subject || "")
          .trim()
          .toLowerCase()
    );
  }

  function slipMatchesExamSubjectSummary(exam, subject, row) {
    return (
      String(row.exam != null ? row.exam : "")
        .trim()
        .toLowerCase() === String(exam || "")
          .trim()
          .toLowerCase() &&
      String(row.subject != null ? row.subject : "")
        .trim()
        .toLowerCase() === String(subject || "")
          .trim()
          .toLowerCase()
    );
  }

  function findLatestLocalSlipForExamSubject(exam, subject) {
    var list = loadMarksheets().filter(function (r) {
      return slipMatchesExamSubjectRecord(exam, subject, r);
    });
    if (!list.length) return null;
    list.sort(function (a, b) {
      return String(b.savedAt || "").localeCompare(String(a.savedAt || ""));
    });
    return list[0];
  }

  function savedAtToMillis(v) {
    var s = String(v || "").trim();
    if (!s) return NaN;
    var n = Date.parse(s);
    return isNaN(n) ? NaN : n;
  }

  function findLatestSheetSummaryForExamSubject(exam, subject) {
    var list = _cachedSheetsSlips.filter(function (s) {
      return slipMatchesExamSubjectSummary(exam, subject, s);
    });
    if (!list.length) return null;
    return list[0];
  }

  function resolveSlipForExamSubject(exam, subject) {
    var loc = findLatestLocalSlipForExamSubject(exam, subject);
    var sh = findLatestSheetSummaryForExamSubject(exam, subject);
    if (!loc && !sh) return { available: false };
    var locT = loc ? String(loc.savedAt || "") : "";
    var shT = sh ? String(sh.savedAt || "") : "";
    var locMs = savedAtToMillis(locT);
    var shMs = savedAtToMillis(shT);
    var preferLocal = false;
    if (loc && !sh) preferLocal = true;
    else if (loc && sh) {
      if (!isNaN(locMs) || !isNaN(shMs)) {
        preferLocal = (isNaN(shMs) && !isNaN(locMs)) || (!isNaN(locMs) && !isNaN(shMs) && locMs >= shMs);
      } else {
        preferLocal = locT >= shT;
      }
    }
    if (loc && preferLocal) {
      return { available: true, source: "local", record: loc };
    }
    if (sh) {
      return { available: true, source: "sheet", slipId: sh.slipId, summary: sh };
    }
    return { available: true, source: "local", record: loc };
  }

  function sheetApiToRecord(meta, entries, slipId) {
    var ent = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      ent.push({
        studentId: e.studentId,
        rollNo: e.rollNo,
        studentName: e.studentName,
        marks: e.marks,
      });
    }
    return {
      id: slipId,
      savedAt: meta.savedAt || "",
      maxMarks: meta.maxMarks,
      teacherName: meta.teacherName || "",
      examDate: meta.examDate || "",
      subject: meta.subject || "",
      examName: meta.examName || "",
      entries: ent,
    };
  }

  function getCachedSheetSlipDetail(slipId) {
    var k = String(slipId || "").trim();
    if (!k) return null;
    var c = loadObjectCache(SHEET_SLIP_DETAIL_CACHE_KEY);
    return c[k] || null;
  }

  function setCachedSheetSlipDetail(slipId, data) {
    var k = String(slipId || "").trim();
    if (!k || !data) return;
    var c = loadObjectCache(SHEET_SLIP_DETAIL_CACHE_KEY);
    c[k] = {
      meta: data.meta || {},
      entries: Array.isArray(data.entries) ? data.entries : [],
      savedAt: new Date().toISOString(),
    };
    saveObjectCache(SHEET_SLIP_DETAIL_CACHE_KEY, c);
  }

  /** Clears max / teacher / date only (same idea as teacher tmClearEntryMetaFields). */
  function marksClearEntryMetaFields() {
    var mx = document.getElementById("marksMax");
    var te = document.getElementById("marksTeacher");
    var dt = document.getElementById("marksExamDate");
    if (mx) mx.value = "";
    if (te) te.value = "";
    if (dt) dt.value = "";
  }

  /** Skip resetting the marks form while there is an in-progress draft (teacher tmHasUnsavedMarksDraft parity). */
  function marksHasUnsavedMarksDraft() {
    if (_marksPickerEditing) return true;
    var entry = document.getElementById("marksNewEntrySection");
    if (!entry || entry.hidden) return false;
    var ae = document.activeElement;
    if (ae && (ae.id === "marksMax" || ae.id === "marksTeacher" || ae.id === "marksExamDate")) return true;
    if (ae && ae.classList && ae.classList.contains("marks-cell-input")) return true;
    var mx = document.getElementById("marksMax");
    var te = document.getElementById("marksTeacher");
    var dt = document.getElementById("marksExamDate");
    if (mx && String(mx.value || "").trim()) return true;
    if (te && String(te.value || "").trim()) return true;
    if (dt && String(dt.value || "").trim()) return true;
    var nodes = document.querySelectorAll("#marksStudentTbody input.marks-cell-input");
    for (var i = 0; i < nodes.length; i++) {
      if (String(nodes[i].value || "").trim()) return true;
    }
    return false;
  }

  /** Top + footer cancel (same as teacher marks UI). */
  function setMarksCancelEditingVisible(visible) {
    var ids = ["btnMarksCancelEdit", "btnMarksCancelEditFooter"];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) el.hidden = !visible;
    }
  }

  function buildMarksExistingSummaryLine(res) {
    if (!res || !res.available) return "";
    if (res.source === "local" && res.record) {
      var r = res.record;
      var teacher = String(r.teacherName != null ? r.teacherName : "").trim() || "—";
      var whenRaw = String(r.savedAt != null ? r.savedAt : "").trim();
      if (!whenRaw) whenRaw = String(r.examDate != null ? r.examDate : "").trim();
      var whenFmt = formatSubmittedWhenLine(whenRaw);
      if (!whenFmt) whenFmt = formatIsoOrAnyDateStringToDdMmYyyy(r.examDate) || "—";
      return "Marks already entered by " + teacher + " on " + whenFmt + ".";
    }
    if (res.summary) {
      var s = res.summary;
      var teacher2 = String(s.teacher != null ? s.teacher : "").trim() || "—";
      var whenRaw2 = String(s.savedAt != null ? s.savedAt : "").trim();
      if (!whenRaw2) whenRaw2 = String(s.examDate != null ? s.examDate : "").trim();
      var whenFmt2 = formatSubmittedWhenLine(whenRaw2);
      if (!whenFmt2) whenFmt2 = "an unknown date and time";
      return "Marks already entered by " + teacher2 + " on " + whenFmt2 + ".";
    }
    return "";
  }

  /** Teacher portal: same web app, pick exam + subject on the page (?teacher=1). */
  function buildMarksTeacherPortalUrl() {
    var base = "";
    if (window.KVSheets && typeof KVSheets.getSheetsUrl === "function") base = KVSheets.getSheetsUrl();
    if (!base) base = String(typeof window !== "undefined" && window.KV_SHEETS_WEB_APP_URL != null ? window.KV_SHEETS_WEB_APP_URL : "").trim();
    if (!base || base.indexOf("PASTE_") === 0) return null;
    var sep = base.indexOf("?") >= 0 ? "&" : "?";
    return base + sep + "teacher=1";
  }

  /** URL only — used when copying the teacher marks link to the clipboard. */
  function buildMarksTeacherShareClipText() {
    return buildMarksTeacherPortalUrl();
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      try {
        if (document.execCommand("copy")) resolve();
        else reject(new Error("copy failed"));
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  function updateMarksPickerUI() {
    var quickEl = document.getElementById("marksQuickActions");
    var dynamicArea = document.getElementById("marksDynamicArea");
    var statusEl = document.getElementById("marksPickerStatus");
    var summaryEl = document.getElementById("marksExistingSummary");
    var entryEl = document.getElementById("marksNewEntrySection");
    var exEl = document.getElementById("marksExam");
    var subEl = document.getElementById("marksSubject");
    var bannerEl = document.getElementById("marksEntryLockBanner");
    var btnEdit = document.getElementById("btnMarksEditSelected");
    var btnDl = document.getElementById("btnMarksDownloadSelected");
    if (!exEl || !subEl) return;

    if (bannerEl) {
      if (!_marksEntryEnabled) {
        bannerEl.hidden = false;
        bannerEl.textContent = MARKS_ENTRY_DISABLED_MSG;
      } else {
        bannerEl.hidden = true;
        bannerEl.textContent = "";
      }
    }

    var ex = exEl.value.trim();
    var sub = subEl.value.trim();
    if (!ex || !sub) {
      if (quickEl) quickEl.hidden = true;
      if (dynamicArea) dynamicArea.hidden = true;
      if (statusEl) statusEl.textContent = "";
      if (entryEl) entryEl.hidden = true;
      _resolvedMarksSlip = null;
      if (btnEdit) btnEdit.hidden = false;
      if (btnDl) btnDl.hidden = false;
      return;
    }

    if (!_marksEntryEnabled && _marksPickerEditing) {
      _marksPickerEditing = false;
      editingMarksSlipId = null;
      if (typeof window !== "undefined") window.__marksEditRecord = null;
      setMarksCancelEditingVisible(false);
      marksClearEntryMetaFields();
    }

    if (_marksPickerEditing && _marksEntryEnabled) {
      if (quickEl) quickEl.hidden = true;
      if (dynamicArea) dynamicArea.hidden = false;
      if (entryEl) entryEl.hidden = false;
      if (statusEl) statusEl.textContent = "Editing — Submit to save, or Cancel.";
      if (btnEdit) btnEdit.hidden = false;
      if (btnDl) btnDl.hidden = false;
      return;
    }

    var res = resolveSlipForExamSubject(ex, sub);
    _resolvedMarksSlip = res;

    if (!_marksEntryEnabled) {
      if (res.available) {
        if (quickEl) quickEl.hidden = false;
        if (dynamicArea) dynamicArea.hidden = true;
        if (entryEl) entryEl.hidden = true;
        if (summaryEl) summaryEl.textContent = buildMarksExistingSummaryLine(res);
        if (statusEl) statusEl.textContent = "";
        if (btnEdit) btnEdit.hidden = true;
        if (btnDl) btnDl.hidden = false;
      } else {
        if (quickEl) quickEl.hidden = true;
        if (dynamicArea) dynamicArea.hidden = true;
        if (entryEl) entryEl.hidden = true;
        if (statusEl) statusEl.textContent = MARKS_ENTRY_DISABLED_MSG;
        if (btnEdit) btnEdit.hidden = true;
        if (btnDl) btnDl.hidden = true;
      }
      return;
    }

    if (btnEdit) btnEdit.hidden = false;
    if (btnDl) btnDl.hidden = false;

    if (res.available) {
      if (quickEl) quickEl.hidden = false;
      if (dynamicArea) dynamicArea.hidden = true;
      if (entryEl) entryEl.hidden = true;
      if (summaryEl) summaryEl.textContent = buildMarksExistingSummaryLine(res);
      if (statusEl) statusEl.textContent = "";
      setMarksCancelEditingVisible(false);
    } else {
      if (quickEl) quickEl.hidden = true;
      if (dynamicArea) dynamicArea.hidden = false;
      if (entryEl) entryEl.hidden = false;
      if (statusEl)
        statusEl.textContent = "No marks on file yet — enter details below and Submit.";
      if (!marksHasUnsavedMarksDraft()) {
        if (typeof window !== "undefined") window.__marksEditRecord = null;
        marksClearEntryMetaFields();
        editingMarksSlipId = null;
        setMarksCancelEditingVisible(false);
        renderMarksStudentTable();
      }
    }
  }

  function findMarksEntryForStudent(record, st) {
    var roll = marksStudentPersistId(st);
    var nm = String(st["Student Name"] || "").trim();
    var ent = record.entries || [];
    var i;
    for (i = 0; i < ent.length; i++) {
      if (String(ent[i].studentId) === roll) return ent[i];
    }
    var sid = String(st.id);
    for (i = 0; i < ent.length; i++) {
      if (String(ent[i].studentId) === sid) return ent[i];
    }
    for (var j = 0; j < ent.length; j++) {
      if (
        String(ent[j].rollNo || "").trim() === roll &&
        String(ent[j].studentName || "").trim() === nm
      )
        return ent[j];
    }
    return null;
  }

  function setMarksSelectOrAdd(selectId, value) {
    var sel = document.getElementById(selectId);
    if (!sel || value == null || value === "") return;
    var v = String(value);
    sel.value = v;
    if (sel.value !== v) {
      var o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
      sel.value = v;
    }
  }

  function applySlipToMarksForm(record) {
    if (!record) return;
    if (!_marksEntryEnabled) {
      showMarksValidationMessage(MARKS_ENTRY_DISABLED_MSG);
      return;
    }
    document.getElementById("marksMax").value = String(record.maxMarks != null ? record.maxMarks : "");
    document.getElementById("marksTeacher").value = String(record.teacherName || "");
    document.getElementById("marksExamDate").value = marksExamDateToInputValue(record.examDate);
    _marksSelectProgrammatic = true;
    try {
      setMarksSelectOrAdd("marksExam", record.examName || "");
      rebuildMarksSubjectSelectForExam(record.examName || "");
      setMarksSelectOrAdd("marksSubject", record.subject || "");
    } finally {
      _marksSelectProgrammatic = false;
    }
    editingMarksSlipId = record.id;
    if (typeof window !== "undefined") window.__marksEditRecord = record;
    setMarksCancelEditingVisible(true);
    renderMarksStudentTable();
    revalidateAllMarksInputs();
    _marksPickerEditing = true;
    updateMarksPickerUI();
  }

  function clearMarksEditMode() {
    _marksPickerEditing = false;
    editingMarksSlipId = null;
    if (typeof window !== "undefined") window.__marksEditRecord = null;
    setMarksCancelEditingVisible(false);
    marksClearEntryMetaFields();
    renderMarksStudentTable();
    updateMarksPickerUI();
  }

  function formatSheetsDateForPdf(v) {
    return formatIsoOrAnyDateStringToDdMmYyyy(v);
  }

  function sheetsMetaToPdfMeta(meta) {
    var mm = Number(meta.maxMarks);
    if (isNaN(mm) || mm <= 0) mm = 1;
    return {
      subject: String(meta.subject || ""),
      examName: String(meta.examName || ""),
      examDateDisplay: formatSheetsDateForPdf(meta.examDate),
      maxMarks: mm,
      teacherName: String(meta.teacherName || ""),
    };
  }

  function sheetsEntriesToPdfRows(meta, entries) {
    var maxMarks = Number(meta.maxMarks);
    if (isNaN(maxMarks) || maxMarks <= 0) maxMarks = 1;
    var rows = [];
    for (var si = 0; si < entries.length; si++) {
      var e = entries[si];
      var m = String(e.marks != null ? e.marks : "").trim();
      var isAb = /^ab$/i.test(m);
      var n = parseFloat(m.replace(/,/g, "."));
      var pctDisplay = isAb ? "—" : !isNaN(n) ? ((n / maxMarks) * 100).toFixed(2) + "%" : "—";
      rows.push({
        roll: String(e.rollNo != null ? e.rollNo : ""),
        name: String(e.studentName != null ? e.studentName : ""),
        marksDisplay: isAb ? "AB" : m,
        pctDisplay: pctDisplay,
      });
    }
    return rows;
  }

  function genderCell(s) {
    var g = String(s.Gender != null ? s.Gender : "").trim();
    if (!g) return "—";
    var l = g.toLowerCase();
    if (l === "boy") return "Boy";
    if (l === "girl") return "Girl";
    return g;
  }

  function orderGenderColumns(genderSet) {
    var set = {};
    for (var x in genderSet) if (Object.prototype.hasOwnProperty.call(genderSet, x)) set[x] = true;
    var rest = [];
    for (var g in set) {
      if (set.hasOwnProperty(g) && g !== "Boy" && g !== "Girl" && g !== "—") rest.push(g);
    }
    rest.sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
    var out = [];
    if (set.Boy) out.push("Boy");
    if (set.Girl) out.push("Girl");
    for (var r = 0; r < rest.length; r++) out.push(rest[r]);
    if (set["—"]) out.push("—");
    return out;
  }

  function genderWiseSummary(students, rowKey, rowLabel) {
    var list = [];
    for (var i = 0; i < students.length; i++) {
      if (isDataStudentRow(students[i])) list.push(students[i]);
    }
    var gSeen = {};
    for (var j = 0; j < list.length; j++) gSeen[genderCell(list[j])] = true;
    var genders = orderGenderColumns(gSeen);

    var rowValues = {};
    for (var k = 0; k < list.length; k++) {
      var rv = String(list[k][rowKey] != null ? list[k][rowKey] : "").trim();
      if (rv) rowValues[rv] = true;
    }
    var rowList = Object.keys(rowValues).sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });

    var matrix = {};
    for (var ri = 0; ri < rowList.length; ri++) {
      var row = {};
      for (var gi = 0; gi < genders.length; gi++) row[genders[gi]] = 0;
      matrix[rowList[ri]] = row;
    }

    var colTotals = {};
    for (var gt = 0; gt < genders.length; gt++) colTotals[genders[gt]] = 0;
    var grand = 0;

    for (var si = 0; si < list.length; si++) {
      var st = list[si];
      var g = genderCell(st);
      var rk = String(st[rowKey] != null ? st[rowKey] : "").trim();
      grand += 1;
      colTotals[g] = (colTotals[g] || 0) + 1;
      if (rk && matrix[rk]) {
        matrix[rk][g] = (matrix[rk][g] || 0) + 1;
      }
    }

    var header = [rowLabel].concat(genders).concat(["Total"]);
    var out = [header];
    for (var rj = 0; rj < rowList.length; rj++) {
      var label = rowList[rj];
      var mr = matrix[label];
      var lineTotal = 0;
      var line = [label];
      for (var gj = 0; gj < genders.length; gj++) {
        var n = mr[genders[gj]] || 0;
        line.push(String(n));
        lineTotal += n;
      }
      line.push(String(lineTotal));
      out.push(line);
    }
    var totalLine = ["Total"];
    for (var gc = 0; gc < genders.length; gc++) {
      var gn = genders[gc];
      totalLine.push(String(colTotals[gn] || 0));
    }
    totalLine.push(String(grand));
    out.push(totalLine);
    return out;
  }

  function categoryEnrollmentSummary(students) {
    return genderWiseSummary(students, "Category", "Category");
  }

  function admissionCategorySummary(students) {
    return genderWiseSummary(students, "KV Category", "KV Category");
  }

  function customReportRows(students, selectedIndices) {
    var headers = [];
    for (var i = 0; i < selectedIndices.length; i++) {
      var idx = selectedIndices[i];
      if (HEADERS[idx] != null) headers.push(HEADERS[idx]);
    }
    var out = [headers];
    for (var r = 0; r < students.length; r++) {
      var s = students[r];
      if (!String(s["R. No."] ?? s["Student Name"] ?? "").trim()) continue;
      var line = [];
      for (var j = 0; j < selectedIndices.length; j++) {
        var ci = selectedIndices[j];
        line.push(HEADERS[ci] != null ? String(s[HEADERS[ci]] ?? "") : "");
      }
      out.push(line);
    }
    return out;
  }

  function studentNamesSorted(students) {
    var names = [];
    for (var i = 0; i < students.length; i++) {
      var n = String(students[i]["Student Name"] || "").trim();
      if (n) names.push(n);
    }
    names.sort();
    return names;
  }

  function buildSubOptions(category, students) {
    var houseIdx = HEADERS.indexOf("House");
    var admnIdx = HEADERS.indexOf("KV Category");
    var genderIdx = HEADERS.indexOf("Gender");
    var minorityIdx = HEADERS.indexOf("Minority");
    var catIdx = HEADERS.indexOf("Category");
    function uniq(idx) {
      if (idx < 0) return [];
      return getUniqueValues(students, idx);
    }
    if (category === "ADMISSION QUOTA" || category === "QUOTA") return ["SGC", "RTE"];
    if (category === "SOCIAL CAT") {
      var base = uniq(catIdx);
      var extra = ["OBC-All", "OBC-CL", "OBC-NCL"];
      var map = {};
      for (var i = 0; i < extra.length; i++) map[extra[i]] = true;
      for (var j = 0; j < base.length; j++) map[base[j]] = true;
      return Object.keys(map).sort();
    }
    if (category === "HOUSE") return uniq(houseIdx);
    if (category === "KV CAT") return uniq(admnIdx);
    if (category === "GENDER") return uniq(genderIdx);
    if (category === "MINORITY") return uniq(minorityIdx);
    return [];
  }

  var students = [];
  var selectedCols = {};
  var _cachedSheetsSlips = [];
  /** Latest resolveSlipForExamSubject result for the current exam+subject picker. */
  var _resolvedMarksSlip = null;
  /** When set, Submit replaces this slip id locally and uses replaceMarkSlip in Sheets. */
  var editingMarksSlipId = null;

  function isMarksViewVisible() {
    var view = document.getElementById("view-marks");
    return !!(view && !view.hidden);
  }

  /** True while the marks entry form is open (new slip or edit) — avoid wiping inputs during sync. */
  function isMarksEntryActive() {
    if (!isMarksViewVisible()) return false;
    if (_marksPickerEditing) return true;
    var entryEl = document.getElementById("marksNewEntrySection");
    return !!(entryEl && !entryEl.hidden);
  }

  function refreshUI() {
    students = loadStudents();
    if (normalizeStudentsDateFields(students)) saveStudents(students);
    var activeStudents = activeStudentsOnly(students);
    buildAddForm();
    fillNameSelects(activeStudents);
    fillManageTable();
    updateDashSub(activeStudents);
    updateSec2Sub(activeStudents);
    renderColCheckboxes();
    var rc = document.getElementById("recordCount");
    if (rc) rc.textContent = String(students.length);
    var hc = document.getElementById("homeRecordCount");
    if (hc) hc.textContent = String(activeStudents.length);
    if (!isMarksEntryActive()) {
      renderMarksStudentTable();
    }
  }

  function openStudentEditFormById(id) {
    var idx = -1;
    for (var i = 0; i < students.length; i++) {
      if (Number(students[i].id) === Number(id)) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    _editingStudentId = Number(id);
    var st = students[idx];
    normalizeStudentDateFields(st);
    var submitBtn = document.getElementById("btnAddStudentSubmit");
    if (submitBtn) submitBtn.textContent = "Modify record";
    var addTabBtn = document.querySelector('.tab[data-tab="add"]');
    if (addTabBtn) addTabBtn.textContent = "Modify record";
    var addTab = document.querySelector('.tab[data-tab="add"]');
    _suppressEditResetOnce = true;
    if (addTab) addTab.click();
    if (!window.__addPhotoDataByHeader) window.__addPhotoDataByHeader = {};
    window.__addPhotoDataByHeader.Photo = String(st.Photo || "").trim();
    for (var hi = 0; hi < HEADERS.length; hi++) {
      var h = HEADERS[hi];
      if (h === "Photo") continue;
      var el = document.getElementById("add_" + fieldId(h));
      if (!el) continue;
      var vv = String(st[h] != null ? st[h] : "");
      if (h === "Date of Admission" || h === "Date Of Birth") vv = normalizeDateToDmy(vv) || "";
      el.value = vv;
    }
    var admnEl = document.getElementById("add_" + fieldId("Admission No."));
    if (admnEl) admnEl.disabled = true;
    syncSingleGirlChildByGender();
  }

  function resetStudentFormMode() {
    _editingStudentId = null;
    var submitBtn = document.getElementById("btnAddStudentSubmit");
    if (submitBtn) submitBtn.textContent = "Add to database";
    var addTabBtn = document.querySelector('.tab[data-tab="add"]');
    if (addTabBtn) addTabBtn.textContent = "Add student";
    var admnEl = document.getElementById("add_" + fieldId("Admission No."));
    if (admnEl) admnEl.disabled = false;
    var form = document.getElementById("formAdd");
    if (form) form.reset();
    if (window.__addPhotoDataByHeader) window.__addPhotoDataByHeader.Photo = "";
    var photoHint = document.getElementById("add_" + fieldId("Photo") + "_hint");
    if (photoHint) photoHint.textContent = "Upload JPG";
    clearAddFormErrors();
    syncSingleGirlChildByGender();
  }

  function syncSingleGirlChildByGender() {
    var gEl = document.getElementById("add_" + fieldId("Gender"));
    var sgcEl = document.getElementById("add_" + fieldId("Single Girl Child"));
    if (!gEl || !sgcEl) return;
    var g = String(gEl.value || "").trim().toLowerCase();
    if (g === "boy" || g === "male") {
      sgcEl.value = "NA";
      sgcEl.disabled = true;
    } else {
      sgcEl.disabled = false;
      if (!sgcEl.value) sgcEl.value = "";
    }
  }

  function clearAddFormErrors() {
    var nodes = document.querySelectorAll("#addFormGrid .add-field-error");
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = "";
  }

  function setAddFieldError(header, msg) {
    var el = document.getElementById("add_err_" + fieldId(header));
    if (!el) return;
    el.textContent = String(msg || "");
  }

  function renderMarksStudentTable() {
    var tbody = document.getElementById("marksStudentTbody");
    var table = document.getElementById("marksStudentTable");
    var hint = document.getElementById("marksTableHint");
    if (!tbody || !table || !hint) return;
    tbody.innerHTML = "";
    var list = studentsForMarksEntry(students);
    if (!list.length) {
      table.hidden = true;
      hint.textContent = "Add or import students first to enter marks.";
      return;
    }
    table.hidden = false;
    var slipN = loadMarksheets().length;
    var baseHint = "Students listed: " + list.length + ". Saved slips on this device: " + slipN + ".";
    if (editingMarksSlipId != null) {
      hint.textContent =
        baseHint +
        " Editing slip …" +
        String(editingMarksSlipId).slice(-8) +
        " — Submit replaces it in storage and Google Sheets.";
    } else {
      hint.textContent = baseHint;
    }
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      var tr = document.createElement("tr");
      var roll = String(st["R. No."] != null ? st["R. No."] : "").trim() || "—";
      var nm = String(st["Student Name"] || "").trim() || "—";
      var domKey = marksStudentDomKey(st);
      tr.innerHTML =
        "<td>" +
        escapeHtml(roll) +
        "</td><td>" +
        escapeHtml(nm) +
        '</td><td><div class="marks-cell-wrap"><input type="text" class="marks-cell-input" data-student-id="' +
        escapeHtml(domKey) +
        '" placeholder="marks or AB" inputmode="decimal" autocomplete="off" /><span class="marks-cell-error" aria-live="polite"></span></div></td>';
      tbody.appendChild(tr);
      var inp = tr.querySelector(".marks-cell-input");
      var editRec =
        typeof window !== "undefined" && window.__marksEditRecord && window.__marksEditRecord.entries
          ? window.__marksEditRecord
          : null;
      if (editRec) {
        var en = findMarksEntryForStudent(editRec, st);
        if (en) {
          var mk = en.marks;
          var ms = String(mk != null ? mk : "").trim();
          if (ms === "" || /^ab$/i.test(ms)) inp.value = /^ab$/i.test(ms) ? "AB" : "";
          else if (typeof mk === "number" && mk % 1 === 0) inp.value = String(mk);
          else inp.value = ms;
        }
      }
      inp.addEventListener("input", function () {
        applyMarksCellValidation(this);
      });
      inp.addEventListener("blur", function () {
        finalizeMarksCellOnBlur(this);
      });
    }
    revalidateAllMarksInputs();
  }

  function fillNameSelects(sourceStudents) {
    var base = Array.isArray(sourceStudents) ? sourceStudents : activeStudentsOnly(students);
    var names = studentNamesSorted(base);
    var selects = ["sec1Student", "profileStudent"];
    for (var s = 0; s < selects.length; s++) {
      var el = document.getElementById(selects[s]);
      if (!el) continue;
      var v = el.value;
      el.innerHTML = '<option value="">— Choose name —</option>';
      for (var i = 0; i < names.length; i++) {
        var opt = document.createElement("option");
        opt.value = names[i];
        opt.textContent = names[i];
        el.appendChild(opt);
      }
      el.value = names.indexOf(v) >= 0 ? v : "";
    }
  }

  function updateDashSub(sourceStudents) {
    var base = Array.isArray(sourceStudents) ? sourceStudents : activeStudentsOnly(students);
    var cat = document.getElementById("dashCat").value;
    var opts = buildSubOptions(cat, base);
    var sub = document.getElementById("dashSub");
    var prev = sub.value;
    sub.innerHTML = "";
    for (var i = 0; i < opts.length; i++) {
      var o = document.createElement("option");
      o.value = opts[i];
      o.textContent = opts[i];
      sub.appendChild(o);
    }
    if (opts.indexOf(prev) >= 0) sub.value = prev;
    else if (opts.length) sub.selectedIndex = 0;
  }

  function updateSec2Sub(sourceStudents) {
    var base = Array.isArray(sourceStudents) ? sourceStudents : activeStudentsOnly(students);
    var col = document.getElementById("sec2Header").value;
    var sub = document.getElementById("sec2SubValue");
    if (!col) {
      sub.innerHTML = '<option value="">— Select header first —</option>';
      return;
    }
    var vals = getUniqueValues(base, parseInt(col, 10));
    sub.innerHTML = "";
    for (var i = 0; i < vals.length; i++) {
      var o = document.createElement("option");
      o.value = vals[i];
      o.textContent = vals[i];
      sub.appendChild(o);
    }
  }

  function renderColCheckboxes() {
    var host = document.getElementById("checkboxGrid");
    if (!host) return;
    host.innerHTML = "";
    for (var i = 0; i < HEADERS.length; i++) {
      var label = document.createElement("label");
      label.className = "check-item";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = String(i);
      cb.name = "reportCol";
      if (selectedCols[i]) cb.checked = true;
      cb.addEventListener("change", function () {
        syncSelectedFromDom();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + HEADERS[i]));
      host.appendChild(label);
    }
  }

  function syncSelectedFromDom() {
    selectedCols = {};
    var boxes = document.querySelectorAll('input[name="reportCol"]');
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].checked) selectedCols[parseInt(boxes[i].value, 10)] = true;
    }
  }

  function getSelectedIndices() {
    syncSelectedFromDom();
    var keys = Object.keys(selectedCols)
      .map(function (k) {
        return parseInt(k, 10);
      })
      .filter(function (n) {
        return !isNaN(n);
      })
      .sort(function (a, b) {
        return a - b;
      });
    return keys;
  }

  function fillModalPhotoCell(td, rawCell) {
    var url = photoUrlFromMasterCell(rawCell);
    if (!url) {
      td.textContent = rawCell === "" || rawCell == null ? "—" : String(rawCell);
      return;
    }
    var img = document.createElement("img");
    img.className = "query-photo-modal-thumb";
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.src = url;
    img.addEventListener("error", function () {
      td.textContent = "—";
    });
    td.appendChild(img);
  }

  function openModal(title, data, opts) {
    opts = opts || {};
    var titleEl = document.getElementById("modalTitle");
    var subtitleText = String(opts.subtitle || "").trim();
    var titleText = String(title || "");
    if (opts.classOnSecondLine && subtitleText) {
      titleText = subtitleText;
      subtitleText = String(title || "");
    }
    if (titleEl) titleEl.textContent = titleText;
    var subtitleEl = document.getElementById("modalSubtitle");
    var summaryEl = document.getElementById("modalSummaryGrid");
    if (subtitleEl) {
      subtitleEl.textContent = subtitleText;
      subtitleEl.hidden = !subtitleText;
      subtitleEl.classList.toggle("report-subtitle--neutral", !!opts.classOnSecondLine && !!subtitleText);
    }
    if (summaryEl) {
      summaryEl.innerHTML = "";
      var pairs = Array.isArray(opts.summaryPairs) ? opts.summaryPairs : [];
      for (var pi = 0; pi < pairs.length; pi++) {
        var pair = pairs[pi] || {};
        var item = document.createElement("div");
        item.className = "report-summary-item";
        var label = document.createElement("div");
        label.className = "report-summary-label";
        label.textContent = String(pair.label || "");
        var value = document.createElement("div");
        value.className = "report-summary-value";
        value.textContent = String(pair.value == null ? "" : pair.value);
        item.appendChild(label);
        item.appendChild(value);
        summaryEl.appendChild(item);
      }
      summaryEl.hidden = !pairs.length;
    }
    var thead = document.querySelector("#modalTable thead tr");
    var tbody = document.querySelector("#modalTable tbody");
    thead.innerHTML = "";
    tbody.innerHTML = "";
    if (!data || !data.length) return;
    var padded = window.KVReports ? window.KVReports.padRectangular(data) : data;
    var hdr = padded[0];
    var isProfileKV =
      hdr.length === 2 && String(hdr[0]) === "Property" && String(hdr[1]) === "Information";
    for (var h = 0; h < hdr.length; h++) {
      var th = document.createElement("th");
      th.textContent = hdr[h];
      if (opts.headerBlue) th.style.background = "#003366";
      thead.appendChild(th);
    }
    for (var r = 1; r < padded.length; r++) {
      var tr = document.createElement("tr");
      for (var c = 0; c < padded[r].length; c++) {
        var td = document.createElement("td");
        var cell = padded[r][c];
        var prop0 = String(padded[r][0]).trim();
        var hdrName = String(hdr[c]).trim();
        var usePhoto =
          photoUrlFromMasterCell(cell) &&
          ((isProfileKV && c === 1 && /^photo$/i.test(prop0)) ||
            (!isProfileKV && /^photo$/i.test(hdrName)));
        if (usePhoto) fillModalPhotoCell(td, cell);
        else td.textContent = cell === "" ? "—" : String(cell);
        if (
          opts.percentColumns &&
          opts.percentColumns.indexOf(c) >= 0 &&
          r >= Number(opts.percentStartRow || 1)
        ) {
          var num = parseFloat(String(cell).replace(/%/g, "").trim());
          if (!isNaN(num)) {
            if (num >= 75) td.style.color = "#1e6b3a";
            else if (num >= 60) td.style.color = "#b45309";
            else td.style.color = "#b91c1c";
            td.style.fontWeight = "700";
          }
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    document.getElementById("modalBackdrop").hidden = false;
    window._modalData = padded;
    window._modalTitle = title;
    var modalExcelBtn = document.getElementById("modalExcel");
    var modalPdfBtn = document.getElementById("modalPdf");
    var allowExport = opts.exportable !== false;
    if (modalExcelBtn) modalExcelBtn.hidden = !allowExport;
    if (modalPdfBtn) modalPdfBtn.hidden = !allowExport;
  }

  function closeModal() {
    document.getElementById("modalBackdrop").hidden = true;
  }

  function fillManageTable() {
    var tbody = document.querySelector("#manageTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    for (var i = 0; i < students.length; i++) {
      var s = students[i];
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        escapeHtml(String(s["R. No."] != null ? s["R. No."] : "").trim() || "—") +
        "</td><td>" +
        escapeHtml(s["Student Name"] || "—") +
        "</td><td>" +
        escapeHtml(s["Admission No."] || "—") +
        "</td><td>" +
        (isStudentActive(s) ? "Active" : "Deactivated") +
        '</td><td><button type="button" class="btn outline sm edit-btn" data-id="' +
        s.id +
        '">Edit</button>' +
        '</td><td><button type="button" class="btn outline sm toggle-active-btn" data-id="' +
        s.id +
        '">' +
        (isStudentActive(s) ? "Deactivate" : "Activate") +
        "</button></td>";
      tbody.appendChild(tr);
    }
    var edits = tbody.querySelectorAll(".edit-btn");
    for (var e = 0; e < edits.length; e++) {
      edits[e].addEventListener("click", function () {
        var id = parseInt(this.getAttribute("data-id"), 10);
        openStudentEditFormById(id);
      });
    }
    var dels = tbody.querySelectorAll(".toggle-active-btn");
    for (var j = 0; j < dels.length; j++) {
      dels[j].addEventListener("click", function () {
        var id = parseInt(this.getAttribute("data-id"), 10);
        var idx = -1;
        for (var i = 0; i < students.length; i++) {
          if (Number(students[i].id) === Number(id)) {
            idx = i;
            break;
          }
        }
        if (idx < 0) return;
        var nextState = !isStudentActive(students[idx]);
        students[idx].isActive = nextState;
        saveStudents(students);
        refreshUI();
        var admnNo = normalizeAdmnNo(students[idx]["Admission No."]);
        if (!admnNo) return;
        if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
          upsertStudentStatusPending(admnNo, nextState);
          return;
        }
        KVSheets.sheetsCall("setStudentActiveStatus", { admnNo: admnNo, isActive: nextState })
          .then(function () {
            removeStudentStatusPending(admnNo);
            pullSheetsIntoApp({ silent: true });
          })
          .catch(function () {
            upsertStudentStatusPending(admnNo, nextState);
          });
      });
    }
  }

  function escapeHtml(t) {
    var d = document.createElement("div");
    d.textContent = t;
    return d.innerHTML;
  }

  function showAppView(navId) {
    _currentAppNavId = String(navId || "home");
    document.querySelectorAll(".app-view").forEach(function (el) {
      el.hidden = el.getAttribute("data-view") !== navId;
    });
    document.querySelectorAll(".sidebar-nav .nav-item[data-nav]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-nav") === navId);
    });
    if (navId === "timetable" && typeof window.__kvTimetableOnShow === "function") {
      window.__kvTimetableOnShow();
    }
    if (navId !== "settings" && typeof window.__resetSettingsTimetableEditor === "function") {
      window.__resetSettingsTimetableEditor();
    }
    if (navId === "marks") {
      refreshMarksEntryPolicyFromServer({ silent: true }).finally(function () {
        syncMarksEntryToggleFromCache();
        updateMarksEntryToggleRowState();
        rebuildMarksExamSelectOptions();
        var exEl = document.getElementById("marksExam");
        rebuildMarksSubjectSelectForExam(exEl ? exEl.value : "");
        updateMarksPickerUI();
        revalidateAllMarksInputs();
        if (!_marksPickerEditing && (!(_resolvedMarksSlip && _resolvedMarksSlip.available))) {
          var first = document.querySelector("#marksStudentTbody input.marks-cell-input");
          if (first) setTimeout(function () { first.focus(); }, 80);
        }
      });
    }
  }

  function wireAppNavigation() {
    document.querySelectorAll(".sidebar-nav .nav-item[data-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        resetStudentFormMode();
        showAppView(this.getAttribute("data-nav"));
      });
    });
  }

  function wireInstructionsModal() {
    var modal = document.getElementById("appInstructionsModal");
    var body = document.getElementById("appInstrBody");
    var titleEl = document.getElementById("appInstrTitle");
    var panel = document.getElementById("appInstrPanel");
    var backdrop = document.getElementById("appInstrBackdrop");
    var btnClose = document.getElementById("appInstrClose");
    if (!modal || !body || !titleEl || !panel) return;

    function closeInstr() {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      body.innerHTML = "";
      panel.classList.remove("app-instr-modal-panel--wide");
    }

    function openFrom(btn) {
      var tid = btn.getAttribute("data-instr-template");
      var tpl = tid ? document.getElementById(tid) : null;
      if (!tpl) return;
      titleEl.textContent = btn.getAttribute("data-instr-title") || "Instructions";
      if (btn.getAttribute("data-instr-wide") === "1") {
        panel.classList.add("app-instr-modal-panel--wide");
      } else {
        panel.classList.remove("app-instr-modal-panel--wide");
      }
      body.innerHTML = "";
      body.appendChild(tpl.content.cloneNode(true));
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
    }

    document.querySelectorAll(".js-instructions-open").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openFrom(btn);
      });
    });
    if (backdrop) {
      backdrop.addEventListener("click", closeInstr);
    }
    if (btnClose) {
      btnClose.addEventListener("click", closeInstr);
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !modal.hidden) closeInstr();
    });
  }

  function wireFeeSubtabs() {
    var tabs = document.querySelectorAll(".fee-tab[data-fee-tab]");
    if (!tabs.length) return;
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        resetStudentFormMode();
        var id = this.getAttribute("data-fee-tab");
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle("active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        document.querySelectorAll("#view-fee .fee-panel").forEach(function (p) {
          p.hidden = p.id !== "fee-panel-" + id;
        });
      });
    });
  }

  function wireFeeModule() {
    var receiptBtn = document.getElementById("btnFeeReceiptFetch");
    var defaulterBtn = document.getElementById("btnFeeDefaulterFetch");
    var receiptStatus = document.getElementById("feeReceiptStatus");
    var defaulterStatus = document.getElementById("feeDefaulterStatus");
    var receiptTbody = document.getElementById("feeReceiptTbody");
    var defaulterTbody = document.getElementById("feeDefaulterTbody");
    var receiptLastUpdated = document.getElementById("feeReceiptLastUpdated");
    var receiptPeriod = document.getElementById("feeReceiptPeriod");
    var defaulterLastUpdated = document.getElementById("feeDefaulterLastUpdated");
    var defaulterPeriod = document.getElementById("feeDefaulterPeriod");
    if (!receiptBtn || !defaulterBtn) return;

    function formatFeeLastUpdated(iso) {
      if (window.KVUbiFee && typeof KVUbiFee.formatLastUpdated === "function") {
        return KVUbiFee.formatLastUpdated(iso);
      }
      return iso ? String(iso) : "Never";
    }

    function updatePeriodLine(el, cache) {
      if (!el) return;
      var period = cache || {};
      var ay = period.academicYear;
      var q = period.quarter;
      if (!ay && window.KVUbiFee && typeof KVUbiFee.receiptPeriod === "function") {
        var auto = KVUbiFee.receiptPeriod();
        ay = auto.academicYear;
        q = auto.quarter;
      }
      if (ay && q) {
        el.textContent = "Report period: " + ay + " · " + q;
      } else if (ay) {
        el.textContent = "Report period: " + ay;
      } else {
        el.textContent = "";
      }
    }

    function updateReceiptPeriodLine(cache) {
      updatePeriodLine(receiptPeriod, cache);
    }

    function renderReceiptRows(rows) {
      if (!receiptTbody) return;
      rows = Array.isArray(rows) ? rows : [];
      if (!rows.length) {
        receiptTbody.innerHTML = '<tr><td colspan="5" class="muted">No data yet.</td></tr>';
        return;
      }
      receiptTbody.innerHTML = rows
        .map(function (r) {
          return (
            "<tr><td>" +
            escapeHtml(String(r.srNo || "")) +
            "</td><td>" +
            escapeHtml(String(r.studentName || "")) +
            "</td><td>" +
            escapeHtml(String(r.dateReceipt || r.dateSubmitted || "")) +
            "</td><td>" +
            escapeHtml(String(r.feePaid || r.feeSubmitted || "")) +
            "</td><td>" +
            escapeHtml(String(r.lateFine || "")) +
            "</td></tr>"
          );
        })
        .join("");
    }

    function applyReceiptCache(cache) {
      cache = cache || null;
      if (receiptLastUpdated) {
        receiptLastUpdated.textContent =
          "Last updated: " + formatFeeLastUpdated(cache && cache.updatedAt);
      }
      updateReceiptPeriodLine(cache);
      if (cache && Array.isArray(cache.rows)) {
        renderReceiptRows(cache.rows);
        if (receiptStatus) {
          receiptStatus.textContent = "Status: " + cache.rows.length + " receipt row(s) saved.";
        }
      } else {
        renderReceiptRows([]);
        if (receiptStatus) receiptStatus.textContent = "Status: idle.";
      }
    }

    window.__kvApplyUbiReceiptCache = applyReceiptCache;

    function renderDefaulterRows(rows) {
      if (!defaulterTbody) return;
      rows = Array.isArray(rows) ? rows : [];
      if (!rows.length) {
        defaulterTbody.innerHTML = '<tr><td colspan="3" class="muted">No data yet.</td></tr>';
        return;
      }
      defaulterTbody.innerHTML = rows
        .map(function (r) {
          return (
            "<tr><td>" +
            escapeHtml(String(r.srNo || "")) +
            "</td><td>" +
            escapeHtml(String(r.studentName || "")) +
            "</td><td>" +
            escapeHtml(String(r.totalFeePayable || "")) +
            "</td></tr>"
          );
        })
        .join("");
    }

    function applyDefaulterCache(cache) {
      cache = cache || null;
      if (defaulterLastUpdated) {
        defaulterLastUpdated.textContent =
          "Last updated: " + formatFeeLastUpdated(cache && cache.updatedAt);
      }
      updatePeriodLine(defaulterPeriod, cache);
      if (cache && Array.isArray(cache.rows)) {
        renderDefaulterRows(cache.rows);
        if (defaulterStatus) {
          defaulterStatus.textContent = "Status: " + cache.rows.length + " defaulter(s) saved.";
        }
      } else {
        renderDefaulterRows([]);
        if (defaulterStatus) defaulterStatus.textContent = "Status: idle.";
      }
    }

    window.__kvApplyUbiDefaulterCache = applyDefaulterCache;

    window.__kvRenderUbiFeeResults = function (mode, rows) {
      if (mode === "defaulter") {
        renderDefaulterRows(rows);
        if (defaulterStatus) defaulterStatus.textContent = "Status: " + (rows.length || 0) + " defaulter(s) loaded.";
      } else {
        renderReceiptRows(rows);
        if (receiptStatus) receiptStatus.textContent = "Status: " + (rows.length || 0) + " receipt row(s) loaded.";
      }
    };

    if (window.KVUbiFee && typeof KVUbiFee.applyReceiptCacheToUi === "function") {
      KVUbiFee.applyReceiptCacheToUi();
    } else {
      applyReceiptCache(null);
    }

    if (window.KVUbiFee && typeof KVUbiFee.applyDefaulterCacheToUi === "function") {
      KVUbiFee.applyDefaulterCacheToUi();
    } else {
      applyDefaulterCache(null);
    }

    receiptBtn.addEventListener("click", function () {
      if (!window.KVUbiFee || typeof KVUbiFee.startFlow !== "function") {
        alert("UBI fee module not loaded. Refresh the page.");
        return;
      }
      if (receiptStatus) receiptStatus.textContent = "Status: opening UBI portal…";
      KVUbiFee.startFlow("receipt");
    });

    defaulterBtn.addEventListener("click", function () {
      if (!window.KVUbiFee || typeof KVUbiFee.startFlow !== "function") {
        alert("UBI fee module not loaded. Refresh the page.");
        return;
      }
      if (defaulterStatus) defaulterStatus.textContent = "Status: opening UBI portal…";
      KVUbiFee.startFlow("defaulter");
    });
  }

  function wireQuerySubtabs() {
    var tabs = document.querySelectorAll(".query-tab[data-query-tab]");
    if (!tabs.length) return;
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        resetStudentFormMode();
        var id = this.getAttribute("data-query-tab");
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle("active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        document.querySelectorAll("#view-queries .query-panel").forEach(function (p) {
          p.hidden = p.id !== "query-panel-" + id;
        });
      });
    });
  }

  function wireConsolidatedSheets() {
    var consolidatedPendingExam = null;
    var fetchBtn = document.getElementById("btnConsolidatedFetch");
    var modal = document.getElementById("kvConsolidatedModal");
    var statusModal = document.getElementById("kvConsolidatedStatusModal");
    var absentModal = document.getElementById("kvConsolidatedAbsentModal");
    if (!fetchBtn || !modal) return;
    var cancelBtn = document.getElementById("consolidatedBtnCancel");
    var genBtn = document.getElementById("consolidatedBtnGenerate");
    var bd = document.getElementById("kvConsolidatedBackdrop");

    function closeConsolidatedModal() {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      consolidatedPendingExam = null;
    }

    fetchBtn.addEventListener("click", function () {
      var sel = document.getElementById("consolidatedExamSelect");
      var exam = sel ? String(sel.value || "").trim() : "";
      if (!exam) return;
      var list = studentsForMarksEntry(students);
      if (!list.length) {
        alert("Add or import students first.");
        return;
      }
      if (!window.KVConsolidated || !window.KVReports || typeof window.KVReports.downloadWorkbookXlsx !== "function") {
        alert("Consolidated export module not loaded. Refresh the page.");
        return;
      }
      var marksList = loadMarksheets();
      var hints = window.KVConsolidated.collectMissingHints(marksList, exam);
      consolidatedPendingExam = exam;
      var hintBox = document.getElementById("kvConsolidatedHints");
      var exBox = document.getElementById("consolidatedExaminerFields");
      hintBox.innerHTML = "";
      exBox.innerHTML = "";
      var hi;
      for (hi = 0; hi < hints.length; hi++) {
        var h = hints[hi];
        if (h.type === "examiner" && h.subjectKey) {
          var wrap = document.createElement("div");
          wrap.className = "field consolidated-dynamic-field";
          var span = document.createElement("span");
          span.textContent = h.text;
          var inp = document.createElement("input");
          inp.type = "text";
          inp.setAttribute("data-examiner-key", h.subjectKey);
          inp.setAttribute("placeholder", "Leave blank for —");
          inp.autocomplete = "off";
          wrap.appendChild(span);
          wrap.appendChild(inp);
          exBox.appendChild(wrap);
        } else {
          var p = document.createElement("p");
          p.className = "card-desc small consolidated-hint-line";
          p.textContent = h.text;
          hintBox.appendChild(p);
        }
      }
      var lineEl = document.getElementById("kvConsolidatedExamLine");
      if (lineEl) lineEl.textContent = "Examination: " + exam;
      document.getElementById("consolidatedInputSession").value = window.KVConsolidated.defaultSessionLabel();
      document.getElementById("consolidatedInputPtm").value = "";
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
    });

    if (cancelBtn) cancelBtn.addEventListener("click", closeConsolidatedModal);
    if (bd) bd.addEventListener("click", closeConsolidatedModal);
    if (genBtn) {
      genBtn.addEventListener("click", function () {
        if (!consolidatedPendingExam) return;
        if (typeof XLSX === "undefined") {
          alert("Excel library not available.");
          return;
        }
        var exam = consolidatedPendingExam;
        var sessionEl = document.getElementById("consolidatedInputSession");
        var ptmEl = document.getElementById("consolidatedInputPtm");
        var session = sessionEl ? String(sessionEl.value || "").trim() : "";
        var ptm = ptmEl ? String(ptmEl.value || "").trim() : "";
        var examinerByKey = {};
        var inps = document.querySelectorAll("#consolidatedExaminerFields input[data-examiner-key]");
        var ji;
        for (ji = 0; ji < inps.length; ji++) {
          var k = inps[ji].getAttribute("data-examiner-key");
          if (k) examinerByKey[k] = String(inps[ji].value || "").trim();
        }
        var classLine = String(
          typeof window.KV_SCHOOL_CLASS !== "undefined" && window.KV_SCHOOL_CLASS != null ? window.KV_SCHOOL_CLASS : ""
        ).trim();
        if (classLine === "—") classLine = "";
        var wb;
        try {
          wb = window.KVConsolidated.buildWorkbook({
            exam: exam,
            students: studentsForMarksEntry(students),
            marksList: loadMarksheets(),
            session: session || window.KVConsolidated.defaultSessionLabel(),
            ptmDate: ptm,
            schoolName: window.KVReports.getSchoolName(),
            classLine: classLine,
            examinerByKey: examinerByKey,
            answerBookByKey: {},
          });
        } catch (err) {
          alert(err && err.message ? err.message : String(err));
          return;
        }
        var fname = "KV_Consolidated_" + String(exam).replace(/\s+/g, "_") + ".xlsx";
        window.KVReports.downloadWorkbookXlsx(wb, fname);
        closeConsolidatedModal();
        var hintFooter = document.getElementById("consolidatedFetchHint");
        if (hintFooter) {
          hintFooter.hidden = false;
          hintFooter.textContent = "Last generated: " + exam + " — check your downloads folder.";
        }
      });
    }

    function closeConsolidatedStatusModal() {
      if (!statusModal) return;
      statusModal.hidden = true;
      statusModal.setAttribute("aria-hidden", "true");
    }

    function openConsolidatedStatusModal() {
      if (!statusModal) return;
      statusModal.hidden = false;
      statusModal.setAttribute("aria-hidden", "false");
    }

    var statusBtn = document.getElementById("btnConsolidatedStatus");
    var statusBd = document.getElementById("kvConsolidatedStatusBackdrop");
    var statusClose = document.getElementById("consolidatedStatusBtnClose");
    var statusTbody = document.getElementById("consolidatedStatusTbody");
    var statusExamLine = document.getElementById("kvConsolidatedStatusExamLine");
    var statusRefreshInFlight = false;

    function renderConsolidatedStatusRows(exam, rows) {
      if (statusExamLine) statusExamLine.textContent = "Examination: " + exam;
      statusTbody.innerHTML = "";
      var ri;
      for (ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        var tr = document.createElement("tr");
        var tdSub = document.createElement("td");
        tdSub.textContent = row.subject;
        var tdSt = document.createElement("td");
        tdSt.textContent = row.entered ? "Entered" : "Not entered";
        if (!row.entered) tdSt.className = "consolidated-status-missing";
        var tdTe = document.createElement("td");
        tdTe.textContent = row.teacher || "—";
        var tdSv = document.createElement("td");
        var savedDisp = row.savedAt ? formatSubmittedWhenLine(row.savedAt) || row.savedAt : "";
        tdSv.textContent = savedDisp || "—";
        var tdId = document.createElement("td");
        tdId.className = "consolidated-status-slipid";
        tdId.textContent = row.slipId || "—";
        tr.appendChild(tdSub);
        tr.appendChild(tdSt);
        tr.appendChild(tdTe);
        tr.appendChild(tdSv);
        tr.appendChild(tdId);
        statusTbody.appendChild(tr);
      }
      openConsolidatedStatusModal();
    }

    if (
      statusBtn &&
      statusModal &&
      statusTbody &&
      window.KVSheets &&
      typeof window.KVSheets.sheetsCall === "function" &&
      window.KVConsolidated &&
      typeof window.KVConsolidated.buildMarksEntryStatusRows === "function"
    ) {
      statusBtn.addEventListener("click", function () {
        var sel = document.getElementById("consolidatedExamSelect");
        var exam = sel ? String(sel.value || "").trim() : "";
        if (!exam) return;
        if (!window.KVSheets || typeof window.KVSheets.getSheetsUrl !== "function" || !window.KVSheets.getSheetsUrl()) {
          alert("Configure the Google Apps Script web app URL in settings first.");
          return;
        }
        var c = loadObjectCache(CONS_STATUS_CACHE_KEY);
        var cachedRows = c[exam] && Array.isArray(c[exam].rows) ? c[exam].rows : null;
        if (cachedRows && cachedRows.length) renderConsolidatedStatusRows(exam, cachedRows);
        if (statusRefreshInFlight) return;
        statusRefreshInFlight = true;
        var prevLabel = statusBtn.textContent;
        statusBtn.disabled = true;
        statusBtn.textContent = cachedRows ? "Refreshing…" : "Loading…";
        window.KVSheets
          .sheetsCall("listMarkSlips", {})
          .then(function (res) {
            var slips = res && res.slips ? res.slips : [];
            var rows = window.KVConsolidated.buildMarksEntryStatusRows(exam, slips);
            var next = loadObjectCache(CONS_STATUS_CACHE_KEY);
            next[exam] = { rows: rows, savedAt: new Date().toISOString() };
            saveObjectCache(CONS_STATUS_CACHE_KEY, next);
            renderConsolidatedStatusRows(exam, rows);
          })
          .catch(function (err) {
            if (!(cachedRows && cachedRows.length)) {
              alert(formatShortUserMessage(err && err.message ? err.message : err));
            }
          })
          .finally(function () {
            statusRefreshInFlight = false;
            statusBtn.disabled = false;
            statusBtn.textContent = prevLabel;
          });
      });
    }
    if (statusClose) statusClose.addEventListener("click", closeConsolidatedStatusModal);
    if (statusBd) statusBd.addEventListener("click", closeConsolidatedStatusModal);

    function closeConsolidatedAbsentModal() {
      if (!absentModal) return;
      absentModal.hidden = true;
      absentModal.setAttribute("aria-hidden", "true");
    }

    function openConsolidatedAbsentModal() {
      if (!absentModal) return;
      absentModal.hidden = false;
      absentModal.setAttribute("aria-hidden", "false");
    }

    var absentBtn = document.getElementById("btnConsolidatedAbsent");
    var absentBd = document.getElementById("kvConsolidatedAbsentBackdrop");
    var absentClose = document.getElementById("consolidatedAbsentBtnClose");
    var absentBody = document.getElementById("consolidatedAbsentBody");
    var absentExamLine = document.getElementById("kvConsolidatedAbsentExamLine");
    var absentRefreshInFlight = false;

    function renderConsolidatedAbsentBlocks(exam, parts) {
      if (absentExamLine) absentExamLine.textContent = "Examination: " + exam;
      absentBody.innerHTML = "";
      var pi;
      for (pi = 0; pi < parts.length; pi++) {
        var pack = parts[pi];
        var sr = pack.statusRow;
        var block = document.createElement("div");
        block.className = "consolidated-absent-block";
        var h = document.createElement("h3");
        h.className = "consolidated-absent-subject";
        h.textContent = sr.subject;
        block.appendChild(h);
        if (pack.entries == null) {
          var pMiss = document.createElement("p");
          pMiss.className = "card-desc small consolidated-absent-note";
          pMiss.textContent = "Marks not entered for this subject.";
          block.appendChild(pMiss);
        } else {
          var absList = window.KVConsolidated.absentStudentsFromSheetEntries(pack.entries);
          if (!absList.length) {
            var pNone = document.createElement("p");
            pNone.className = "card-desc small consolidated-absent-note";
            pNone.textContent = "No absent students (no AB marks on this slip).";
            block.appendChild(pNone);
          } else {
            var ul = document.createElement("ul");
            ul.className = "consolidated-absent-list";
            var ai;
            for (ai = 0; ai < absList.length; ai++) {
              var a = absList[ai];
              var li = document.createElement("li");
              li.textContent = a.rollNo + " — " + a.studentName;
              ul.appendChild(li);
            }
            block.appendChild(ul);
          }
        }
        absentBody.appendChild(block);
      }
      openConsolidatedAbsentModal();
    }

    if (
      absentBtn &&
      absentModal &&
      absentBody &&
      window.KVSheets &&
      typeof window.KVSheets.sheetsCall === "function" &&
      window.KVConsolidated &&
      typeof window.KVConsolidated.buildMarksEntryStatusRows === "function" &&
      typeof window.KVConsolidated.absentStudentsFromSheetEntries === "function"
    ) {
      absentBtn.addEventListener("click", function () {
        var sel = document.getElementById("consolidatedExamSelect");
        var exam = sel ? String(sel.value || "").trim() : "";
        if (!exam) return;
        if (!window.KVSheets || typeof window.KVSheets.getSheetsUrl !== "function" || !window.KVSheets.getSheetsUrl()) {
          alert("Configure the Google Apps Script web app URL in settings first.");
          return;
        }
        var c = loadObjectCache(CONS_ABSENT_CACHE_KEY);
        var cachedParts = c[exam] && Array.isArray(c[exam].parts) ? c[exam].parts : null;
        if (cachedParts && cachedParts.length) renderConsolidatedAbsentBlocks(exam, cachedParts);
        if (absentRefreshInFlight) return;
        absentRefreshInFlight = true;
        var prevAbsent = absentBtn.textContent;
        absentBtn.disabled = true;
        absentBtn.textContent = cachedParts ? "Refreshing…" : "Loading…";
        window.KVSheets
          .sheetsCall("listMarkSlips", {})
          .then(function (res) {
            var slips = res && res.slips ? res.slips : [];
            var statusRows = window.KVConsolidated.buildMarksEntryStatusRows(exam, slips);
            return Promise.all(
              statusRows.map(function (r) {
                if (!r.entered || !r.slipId) {
                  return Promise.resolve({ statusRow: r, entries: null });
                }
                return window.KVSheets
                  .sheetsCall("getMarkSlip", { slipId: r.slipId })
                  .then(function (detail) {
                    return {
                      statusRow: r,
                      entries: detail && detail.entries ? detail.entries : null,
                    };
                  })
                  .catch(function () {
                    return { statusRow: r, entries: null };
                  });
              })
            );
          })
          .then(function (parts) {
            var next = loadObjectCache(CONS_ABSENT_CACHE_KEY);
            next[exam] = { parts: parts, savedAt: new Date().toISOString() };
            saveObjectCache(CONS_ABSENT_CACHE_KEY, next);
            renderConsolidatedAbsentBlocks(exam, parts);
          })
          .catch(function (err) {
            if (!(cachedParts && cachedParts.length)) {
              alert(formatShortUserMessage(err && err.message ? err.message : err));
            }
          })
          .finally(function () {
            absentRefreshInFlight = false;
            absentBtn.disabled = false;
            absentBtn.textContent = prevAbsent;
          });
      });
    }
    if (absentClose) absentClose.addEventListener("click", closeConsolidatedAbsentModal);
    if (absentBd) absentBd.addEventListener("click", closeConsolidatedAbsentModal);

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (absentModal && !absentModal.hidden) {
        closeConsolidatedAbsentModal();
        return;
      }
      if (statusModal && !statusModal.hidden) {
        closeConsolidatedStatusModal();
        return;
      }
      if (modal && !modal.hidden) closeConsolidatedModal();
    });
  }

  function wireAttendanceModule() {
    var markBtn = document.getElementById("btnAttendanceMarkToday");
    var absBtn = document.getElementById("btnAttendanceAbsentees");
    var waBtn = document.getElementById("btnAttendanceWhatsApp");
    var sumBtn = document.getElementById("btnAttendanceSummary");
    var samagamBtn = document.getElementById("btnAttendanceSamagam");
    var monthlyBtn = document.getElementById("btnAttendanceMonthlyReport");
    var submitBtn = document.getElementById("btnAttendanceSubmit");
    var panel = document.getElementById("attendanceMarkPanel");
    var tbody = document.getElementById("attendanceStudentTbody");
    var statusLine = document.getElementById("attendanceStatusLine");
    var backlogDialog = document.getElementById("attendanceBacklogDialog");
    var backlogMsg = document.getElementById("attendanceBacklogMsg");
    var backlogHolidayBtn = document.getElementById("attendanceBacklogHoliday");
    var backlogFillBtn = document.getElementById("attendanceBacklogFill");
    var backlogIgnoreBtn = document.getElementById("attendanceBacklogIgnore");
    var backlogBackdrop = document.getElementById("attendanceBacklogBackdrop");
    var monthlyDialog = document.getElementById("attendanceMonthlyDialog");
    var monthlyBackdrop = document.getElementById("attendanceMonthlyBackdrop");
    var monthlySel = document.getElementById("attendanceMonthlySelect");
    var monthlyGoBtn = document.getElementById("attendanceMonthlyGo");
    var monthlyCloseBtn = document.getElementById("attendanceMonthlyClose");
    var shouldFastOpenToday = false;
    if (!markBtn || !absBtn || !sumBtn || !submitBtn || !panel || !tbody || !statusLine) return;

    var ATT_CACHE_KEY = "kv_attendance_cache_v1";
    var ATT_PENDING_KEY = "kv_attendance_pending_v1";
    var ATT_BULK_PENDING_KEY = "kv_attendance_bulk_pending_v1";
    var ATT_BACKLOG_QUEUE_KEY = "kv_attendance_backlog_queue_v1";
    var attendanceEditMode = false;
    var currentAttendanceDate = todayYmd();

    function todayYmd() {
      var d = new Date();
      var y = d.getFullYear();
      var m = d.getMonth() + 1;
      var dd = d.getDate();
      return y + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd;
    }

    function ymdToDmy(ymd) {
      var s = String(ymd || "").trim();
      var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return s;
      return m[3] + "/" + m[2] + "/" + m[1];
    }

    function number2(v) {
      var n = Number(v);
      if (isNaN(n)) return "0.00";
      return n.toFixed(2);
    }

    function currentSessionMonths() {
      var now = new Date();
      var startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
      var out = [];
      for (var i = 0; i < 12; i++) {
        var d = new Date(startYear, 3 + i, 1);
        var y = d.getFullYear();
        var m = d.getMonth() + 1;
        var val = y + "-" + (m < 10 ? "0" : "") + m;
        var label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
        out.push({ value: val, label: label });
      }
      return out;
    }

    function openBacklogDialog(dateIso) {
      if (!backlogDialog || !backlogMsg || !backlogHolidayBtn || !backlogFillBtn || !backlogIgnoreBtn) {
        return Promise.resolve("fill");
      }
      backlogMsg.textContent = "Attendance for " + ymdToDmy(dateIso) + " is pending, choose one";
      backlogDialog.hidden = false;
      backlogDialog.setAttribute("aria-hidden", "false");
      return new Promise(function (resolve) {
        function done(val) {
          backlogDialog.hidden = true;
          backlogDialog.setAttribute("aria-hidden", "true");
          backlogHolidayBtn.onclick = null;
          backlogFillBtn.onclick = null;
          backlogIgnoreBtn.onclick = null;
          if (backlogBackdrop) backlogBackdrop.onclick = null;
          resolve(val);
        }
        backlogHolidayBtn.onclick = function () { done("holiday"); };
        backlogFillBtn.onclick = function () { done("fill"); };
        backlogIgnoreBtn.onclick = function () { done("ignore"); };
        if (backlogBackdrop) backlogBackdrop.onclick = function () { done("fill"); };
      });
    }

    function openMonthlyDialog() {
      if (!monthlyDialog || !monthlySel) return;
      var months = currentSessionMonths();
      monthlySel.innerHTML = "";
      for (var i = 0; i < months.length; i++) {
        var o = document.createElement("option");
        o.value = months[i].value;
        o.textContent = months[i].label;
        monthlySel.appendChild(o);
      }
      var t = todayYmd().slice(0, 7);
      if ([].some.call(monthlySel.options, function (x) { return x.value === t; })) monthlySel.value = t;
      monthlyDialog.hidden = false;
      monthlyDialog.setAttribute("aria-hidden", "false");
    }

    function closeMonthlyDialog() {
      if (!monthlyDialog) return;
      monthlyDialog.hidden = true;
      monthlyDialog.setAttribute("aria-hidden", "true");
    }

    function renderMonthlyReportModal(monthVal, res) {
      var title = "Monthly attendance report of " + String(res.monthLabel || monthVal);
      var table = [[
        "Roll No",
        "Name of student",
        "Attendance for the selected month",
        "Total attendance upto month preceding selected month",
        "Total attendance upto selected month",
        "Selected month percentage attendance",
        "Overall percentage attendance upto selected month",
      ]];
      var rows = res.rows || [];
      for (var i = 0; i < rows.length; i++) {
        table.push([
          String(rows[i].rollNo || ""),
          String(rows[i].studentName || ""),
          String(rows[i].monthAttendance || 0),
          String(rows[i].uptoPrev || 0),
          String(rows[i].uptoMonth || 0),
          number2(rows[i].monthPct || 0) + "%",
          number2(rows[i].overallPct || 0) + "%",
        ]);
      }
      openModal(title, table, {
        subtitle: "",
        summaryPairs: [
          { label: "Number of working days of selected month", value: String(res.workingDaysMonth || 0) },
          { label: "Total attendance of the selected month", value: String(res.totalAttendanceMonth || 0) },
          { label: "Average attendance of the selected month", value: number2(res.averageAttendanceMonth || 0) },
          { label: "Total working days upto month preceding selected month", value: String(res.workingDaysPrev || 0) },
          { label: "Total working days till selected month", value: String(res.workingDaysTill || 0) },
        ],
        exportable: true,
        headerBlue: true,
        percentColumns: [5, 6],
        percentStartRow: 1,
      });
    }

    function setAttendanceStatus(msg) {
      statusLine.textContent = "Status: " + String(msg || "");
    }

    function hasSheets() {
      return !!(window.KVSheets && typeof KVSheets.getSheetsUrl === "function" && KVSheets.getSheetsUrl());
    }

    function loadAttendanceCache() {
      try {
        var raw = localStorage.getItem(ATT_CACHE_KEY);
        var obj = raw ? JSON.parse(raw) : {};
        return obj && typeof obj === "object" ? obj : {};
      } catch (_e) {
        return {};
      }
    }

    function saveAttendanceCache(cache) {
      try {
        localStorage.setItem(ATT_CACHE_KEY, JSON.stringify(cache || {}));
      } catch (_e) {}
    }

    function loadAttendancePending() {
      try {
        var raw = localStorage.getItem(ATT_PENDING_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (_e) {
        return [];
      }
    }

    function saveAttendancePending(arr) {
      try {
        localStorage.setItem(ATT_PENDING_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
      } catch (_e) {}
    }

    function loadAttendanceBulkPending() {
      try {
        var raw = localStorage.getItem(ATT_BULK_PENDING_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (_e) {
        return [];
      }
    }

    function saveAttendanceBulkPending(arr) {
      try {
        localStorage.setItem(ATT_BULK_PENDING_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
      } catch (_e) {}
    }

    function loadBacklogQueueCache() {
      try {
        var raw = localStorage.getItem(ATT_BACKLOG_QUEUE_KEY);
        var obj = raw ? JSON.parse(raw) : null;
        if (!obj || typeof obj !== "object") return { beforeDate: "", dates: [] };
        return {
          beforeDate: String(obj.beforeDate || ""),
          dates: Array.isArray(obj.dates) ? obj.dates.slice() : [],
        };
      } catch (_e) {
        return { beforeDate: "", dates: [] };
      }
    }

    function saveBacklogQueueCache(beforeDate, dates) {
      try {
        localStorage.setItem(ATT_BACKLOG_QUEUE_KEY, JSON.stringify({
          beforeDate: String(beforeDate || ""),
          dates: Array.isArray(dates) ? dates : [],
        }));
      } catch (_e) {}
    }

    function upsertBulkPending(date, status) {
      var q = loadAttendanceBulkPending();
      var found = false;
      for (var i = 0; i < q.length; i++) {
        if (String(q[i] && q[i].date || "") === String(date)) {
          q[i] = { date: date, status: status };
          found = true;
          break;
        }
      }
      if (!found) q.push({ date: date, status: status });
      saveAttendanceBulkPending(q);
    }

    function removeBulkPending(date) {
      var q = loadAttendanceBulkPending().filter(function (x) {
        return String(x && x.date || "") !== String(date);
      });
      saveAttendanceBulkPending(q);
    }

    function upsertPending(date, entries) {
      var q = loadAttendancePending();
      var found = false;
      for (var i = 0; i < q.length; i++) {
        if (String(q[i] && q[i].date || "") === date) {
          q[i] = { date: date, entries: entries };
          found = true;
          break;
        }
      }
      if (!found) q.push({ date: date, entries: entries });
      saveAttendancePending(q);
    }

    function removePending(date) {
      var q = loadAttendancePending().filter(function (x) {
        return String(x && x.date || "") !== String(date);
      });
      saveAttendancePending(q);
    }

    function setStatusSelectClass(sel) {
      if (!sel) return;
      var v = String(sel.value || "P").toUpperCase();
      sel.classList.remove("status-present", "status-absent");
      sel.classList.add(v === "A" ? "status-absent" : "status-present");
    }

    function sortedAttendanceEntries(entries) {
      return (entries || []).slice().sort(function (a, b) {
        var ar = String(a && a.rollNo != null ? a.rollNo : "").trim();
        var br = String(b && b.rollNo != null ? b.rollNo : "").trim();
        var an = Number(ar);
        var bn = Number(br);
        var aIsNum = !isNaN(an);
        var bIsNum = !isNaN(bn);
        if (aIsNum && bIsNum) return an - bn;
        return ar.localeCompare(br);
      });
    }

    function renderAttendanceMarkTable(entries) {
      var list = sortedAttendanceEntries(filterAttendanceEntriesToActive(entries, students));
      tbody.innerHTML = "";
      if (!list.length) {
        panel.hidden = true;
        return;
      }
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var tr = document.createElement("tr");
        var roll = String(e.rollNo != null ? e.rollNo : "").trim() || "—";
        var name = String(e.studentName != null ? e.studentName : "").trim() || "—";
        var cur = String(e.status || "").toUpperCase() === "A" ? "A" : "P";
        tr.innerHTML =
          "<td>" + escapeHtml(roll) + "</td>" +
          "<td>" + escapeHtml(name) + "</td>" +
          '<td><select class="attendance-status-select" data-roll="' + escapeHtml(roll) + '" data-name="' + escapeHtml(name) + '" data-gender="' + escapeHtml(String(e.gender || "")) + '">' +
          '<option value="P">Present</option>' +
          '<option value="A">Absent</option>' +
          "</select></td>";
        tbody.appendChild(tr);
        var sel = tr.querySelector("select.attendance-status-select");
        if (sel) {
          sel.value = cur;
          setStatusSelectClass(sel);
          sel.addEventListener("change", function () {
            setStatusSelectClass(this);
          });
        }
      }
      panel.hidden = false;
    }

    function setSubmitLabel() {
      submitBtn.textContent = attendanceEditMode ? "Update" : "Submit";
    }

    function setMarkBtnLabel(marked) {
      markBtn.textContent = marked ? "Modify Today's Attendance" : "Mark today attendance";
    }

    function setAttendancePostMarkButtonsVisible(markedToday) {
      absBtn.hidden = !markedToday;
      if (waBtn) waBtn.hidden = !markedToday;
      sumBtn.hidden = !markedToday;
      if (samagamBtn) samagamBtn.hidden = !markedToday;
    }

    function todayAbsenteesFromCache(date) {
      var c = loadAttendanceCache()[date || todayYmd()];
      if (!(c && c.marked && c.entries && c.entries.length)) return null;
      return c.entries.filter(function (e) {
        return String(e.status || "P").toUpperCase() === "A";
      });
    }

    function shareTodayAbsenteesOnWhatsApp() {
      if (!window.KVWhatsAppParents || typeof KVWhatsAppParents.shareOnWhatsApp !== "function") {
        alert("WhatsApp share is not loaded. Refresh the page.");
        return;
      }
      var err = KVWhatsAppParents.validateBeforeShare();
      if (err) {
        alert(err);
        return;
      }
      var date = todayYmd();
      var absentees = todayAbsenteesFromCache(date);
      if (absentees === null) {
        alert("Attendance is not marked yet.");
        return;
      }
      var msg = KVWhatsAppParents.buildAbsenteesMessage(absentees, date);
      KVWhatsAppParents.shareOnWhatsApp(msg);
    }

    function todayAttendanceEntriesForSamagam() {
      var today = todayYmd();
      var c = loadAttendanceCache()[today];
      if (!(c && c.marked && c.entries && c.entries.length)) return [];
      return filterAttendanceEntriesToActive(c.entries, students);
    }

    function buildEntriesFromLocalStudents() {
      var list = studentsForMarksEntry(students);
      var out = [];
      for (var i = 0; i < list.length; i++) {
        out.push({
          rollNo: String(list[i]["R. No."] != null ? list[i]["R. No."] : "").trim(),
          studentName: String(list[i]["Student Name"] || "").trim(),
          gender: String(list[i]["Gender"] || "").trim(),
          status: "P",
        });
      }
      return out;
    }

    function primeTodayAttendanceDraftFromStudents() {
      var date = todayYmd();
      var cache = loadAttendanceCache();
      var cur = cache[date];
      if (cur && cur.marked) return;
      cache[date] = {
        date: date,
        dayLabel: date,
        entries: buildEntriesFromLocalStudents(),
        marked: false,
        synced: !!(cur && cur.synced),
        pending: false,
        savedAt: new Date().toISOString(),
      };
      saveAttendanceCache(cache);
    }

    function syncAttendanceDateInBackground(date, entries) {
      if (!hasSheets()) return Promise.resolve(false);
      return KVSheets.sheetsCall("saveAttendanceByDate", { date: date, entries: entries })
        .then(function () {
          removePending(date);
          var cache = loadAttendanceCache();
          if (cache[date]) {
            cache[date].synced = true;
            cache[date].pending = false;
            cache[date].savedAt = new Date().toISOString();
            saveAttendanceCache(cache);
          }
          setAttendanceStatus("Attendance synced to Google Sheets.");
          return true;
        })
        .catch(function () {
          upsertPending(date, entries);
          var cache = loadAttendanceCache();
          if (cache[date]) {
            cache[date].synced = false;
            cache[date].pending = true;
            saveAttendanceCache(cache);
          }
          setAttendanceStatus("Saved locally. Sync pending (network/server slow).");
          return false;
        });
    }

    function retryPendingAttendanceInBackground() {
      if (!hasSheets()) return;
      var q = loadAttendancePending();
      if (!q.length) return;
      var i = 0;
      function next() {
        if (i >= q.length) return;
        var item = q[i++];
        KVSheets.sheetsCall("saveAttendanceByDate", { date: item.date, entries: item.entries })
          .then(function () {
            removePending(item.date);
            var cache = loadAttendanceCache();
            if (cache[item.date]) {
              cache[item.date].synced = true;
              cache[item.date].pending = false;
              saveAttendanceCache(cache);
            }
          })
          .catch(function () {})
          .finally(next);
      }
      next();
    }

    function runAttendanceBackgroundSync(opts) {
      opts = opts || {};
      retryPendingAttendanceInBackground();
      retryPendingBulkAttendanceInBackground();
      if (opts.refreshToday) refreshAttendanceByDateFromSheets(todayYmd());
      if (opts.preloadBacklog && hasSheets()) {
        KVSheets.sheetsCall("getPendingAttendanceDates", { beforeDate: todayYmd(), skipDates: [] })
          .then(function (res) {
            var dates = Array.isArray(res && res.dates) ? res.dates : [];
            saveBacklogQueueCache(todayYmd(), dates);
          })
          .catch(function () {});
      }
    }

    function retryPendingBulkAttendanceInBackground() {
      if (!hasSheets()) return;
      var q = loadAttendanceBulkPending();
      if (!q.length) return;
      var i = 0;
      function next() {
        if (i >= q.length) return;
        var item = q[i++];
        KVSheets.sheetsCall("markAttendanceDateBulk", { date: item.date, status: item.status })
          .then(function () {
            removeBulkPending(item.date);
            var cache = loadAttendanceCache();
            if (cache[item.date]) {
              cache[item.date].synced = true;
              cache[item.date].pending = false;
              saveAttendanceCache(cache);
            }
          })
          .catch(function () {})
          .finally(next);
      }
      next();
    }

    function summaryFromEntries(entries, dayLabel, date) {
      entries = filterAttendanceEntriesToActive(entries, students);
      var out = {
        dayLabel: dayLabel || date,
        totals: { girls: 0, boys: 0, total: 0 },
        present: { girls: 0, boys: 0, total: 0 },
        absent: { girls: 0, boys: 0, total: 0 },
      };
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i] || {};
        var g = String(e.gender || "").trim().toLowerCase();
        var isGirl = g === "female" || g === "f" || g === "girl";
        var isBoy = g === "male" || g === "m" || g === "boy";
        var st = String(e.status || "P").toUpperCase() === "A" ? "A" : "P";
        out.totals.total++;
        if (isGirl) out.totals.girls++;
        else if (isBoy) out.totals.boys++;
        if (st === "A") {
          out.absent.total++;
          if (isGirl) out.absent.girls++;
          else if (isBoy) out.absent.boys++;
        } else {
          out.present.total++;
          if (isGirl) out.present.girls++;
          else if (isBoy) out.present.boys++;
        }
      }
      return out;
    }

    function refreshAttendanceByDateFromSheets(date) {
      if (!hasSheets()) return Promise.resolve(null);
      return KVSheets.sheetsCall("getAttendanceByDate", { date: date })
        .then(function (res) {
          var cache = loadAttendanceCache();
          var local = cache[date];
          var filteredEntries = filterAttendanceEntriesToActive((res && res.entries) || [], students);
          if (!(local && local.pending)) {
            cache[date] = {
              date: date,
              dayLabel: res.dayLabel || date,
              entries: filteredEntries,
              marked: !!(res && res.marked),
              synced: true,
              pending: false,
              savedAt: new Date().toISOString(),
            };
            saveAttendanceCache(cache);
            if (date === todayYmd()) {
              setMarkBtnLabel(!!cache[date].marked);
              setAttendancePostMarkButtonsVisible(!!cache[date].marked);
            }
          }
          return res;
        })
        .catch(function () {
          return null;
        });
    }

    function openAttendanceForDate(date, forceFillMode) {
      currentAttendanceDate = String(date || todayYmd());
      var cache = loadAttendanceCache();
      var c = cache[currentAttendanceDate];
      var marked = !!(c && c.marked) && !forceFillMode;
      attendanceEditMode = marked;
      setSubmitLabel();
      var entries = (c && c.entries && c.entries.length) ? c.entries : buildEntriesFromLocalStudents();
      entries = filterAttendanceEntriesToActive(entries, students);
      renderAttendanceMarkTable(entries);
      setAttendanceStatus((marked ? "Modify mode for " : "Mark attendance for ") + ymdToDmy(currentAttendanceDate) + ".");
      if (hasSheets() && !(c && c.pending)) {
        refreshAttendanceByDateFromSheets(currentAttendanceDate).then(function () {
          var fresh = loadAttendanceCache()[currentAttendanceDate];
          var fMarked = !!(fresh && fresh.marked) && !forceFillMode;
          attendanceEditMode = fMarked;
          setSubmitLabel();
          if (currentAttendanceDate === todayYmd()) setMarkBtnLabel(fMarked);
        });
      }
    }

    function runBacklogFlowThenOpenToday() {
      var today = todayYmd();
      if (!hasSheets()) {
        openAttendanceForDate(today, false);
        return;
      }
      var localHandled = {};
      var pendBulk = loadAttendanceBulkPending();
      for (var pbi = 0; pbi < pendBulk.length; pbi++) {
        if (pendBulk[pbi] && pendBulk[pbi].date) localHandled[String(pendBulk[pbi].date)] = true;
      }
      function applyBulkLocal(dateIso, status, msg) {
        var c = loadAttendanceCache();
        c[dateIso] = {
          date: dateIso,
          dayLabel: ymdToDmy(dateIso),
          entries: buildEntriesFromLocalStudents().map(function (e) {
            e.status = status;
            return e;
          }),
          marked: true,
          synced: false,
          pending: true,
          savedAt: new Date().toISOString(),
        };
        saveAttendanceCache(c);
        upsertBulkPending(dateIso, status);
        localHandled[dateIso] = true;
        retryPendingBulkAttendanceInBackground();
        setAttendanceStatus(msg + " Syncing in background...");
      }

      function presentBacklogFromQueue(queueRef) {
        while (queueRef.length && localHandled[queueRef[0]]) queueRef.shift();
        saveBacklogQueueCache(today, queueRef);
        if (!queueRef.length) {
          openAttendanceForDate(today, false);
          return;
        }
        var oldDate = queueRef[0];
        openBacklogDialog(oldDate).then(function (choice) {
          if (choice === "holiday") {
            applyBulkLocal(oldDate, "H", "Marked " + ymdToDmy(oldDate) + " as holiday locally.");
            queueRef.shift();
            presentBacklogFromQueue(queueRef);
            return;
          }
          if (choice === "ignore") {
            applyBulkLocal(oldDate, "I", "Ignored " + ymdToDmy(oldDate) + " locally (I).");
            queueRef.shift();
            presentBacklogFromQueue(queueRef);
            return;
          }
          openAttendanceForDate(oldDate, true);
        });
      }

      var cached = loadBacklogQueueCache();
      if (shouldFastOpenToday) {
        shouldFastOpenToday = false;
        openAttendanceForDate(today, false);
        if (hasSheets()) refreshAttendanceByDateFromSheets(today);
        return;
      }
      if (cached.beforeDate === today && cached.dates.length) {
        presentBacklogFromQueue(cached.dates.slice());
        return;
      }
      // Open instantly from local cache; fetch backlog queue in background.
      openAttendanceForDate(today, false);
      KVSheets.sheetsCall("getPendingAttendanceDates", { beforeDate: today, skipDates: Object.keys(localHandled) })
        .then(function (res) {
          var dates = Array.isArray(res && res.dates) ? res.dates.slice() : [];
          saveBacklogQueueCache(today, dates);
          if (dates.length) {
            setAttendanceStatus(
              "Past pending attendance found for " + ymdToDmy(dates[0]) + ". You can fill from next click."
            );
          }
        })
        .catch(function () {
          // Keep already opened local list.
        });
    }

    markBtn.addEventListener("click", function () {
      var today = todayYmd();
      var c = loadAttendanceCache()[today];
      // When today's attendance already exists, open modify immediately.
      if (c && c.marked) {
        shouldFastOpenToday = true;
      }
      runBacklogFlowThenOpenToday();
    });

    submitBtn.addEventListener("click", function () {
      var sels = tbody.querySelectorAll("select.attendance-status-select");
      if (!sels.length) {
        alert("Click 'Mark today attendance' first.");
        return;
      }
      var date = String(currentAttendanceDate || todayYmd());
      var payloadEntries = [];
      for (var i = 0; i < sels.length; i++) {
        var s = sels[i];
        payloadEntries.push({
          rollNo: String(s.getAttribute("data-roll") || "").trim(),
          studentName: String(s.getAttribute("data-name") || "").trim(),
          gender: String(s.getAttribute("data-gender") || "").trim(),
          status: String(s.value || "P").toUpperCase() === "A" ? "A" : "P",
        });
      }
      var cache = loadAttendanceCache();
      cache[date] = {
        date: date,
        dayLabel: date,
        entries: payloadEntries,
        marked: true,
        synced: false,
        pending: true,
        savedAt: new Date().toISOString(),
      };
      saveAttendanceCache(cache);
      upsertPending(date, payloadEntries);
      if (date === todayYmd()) {
        setMarkBtnLabel(true);
        setAttendancePostMarkButtonsVisible(true);
      }

      var isUpdate = attendanceEditMode;
      setAttendanceStatus((isUpdate ? "Attendance updated for " : "Attendance marked for ") + date + " (saved locally). Syncing in background...");
      if (typeof window.KV_showOkDialog === "function") {
        window.KV_showOkDialog(isUpdate ? "Attendance updated." : "Attendance marked for the day.");
      } else {
        alert(isUpdate ? "Attendance updated." : "Attendance marked for the day.");
      }
      panel.hidden = true;
      attendanceEditMode = true;
      setSubmitLabel();
      syncAttendanceDateInBackground(date, payloadEntries);
      if (date !== todayYmd()) {
        var b = loadBacklogQueueCache();
        if (b.beforeDate === todayYmd()) {
          b.dates = b.dates.filter(function (d) { return String(d) !== String(date); });
          saveBacklogQueueCache(b.beforeDate, b.dates);
        }
        setTimeout(function () {
          runBacklogFlowThenOpenToday();
        }, 50);
      }
    });

    absBtn.addEventListener("click", function () {
      var date = todayYmd();
      var c = loadAttendanceCache()[date];
      function showFromCache(current) {
        if (!(current && current.marked && current.entries && current.entries.length)) return false;
        var abs0 = current.entries.filter(function (e) { return String(e.status || "P").toUpperCase() === "A"; });
        var rows0 = [["Roll No", "Student Name"]];
        for (var i0 = 0; i0 < abs0.length; i0++) rows0.push([String(abs0[i0].rollNo || ""), String(abs0[i0].studentName || "")]);
        if (!abs0.length) rows0.push(["—", "No absentees"]);
        openModal("Today's Absentees (" + ymdToDmy(date) + ")", rows0, {
          exportable: false,
          subtitle: modalClassSubtitle(),
          classOnSecondLine: true,
        });
        return true;
      }
      if (showFromCache(c)) {
        if (hasSheets() && !(c && c.pending)) refreshAttendanceByDateFromSheets(date);
        return;
      }
      if (!hasSheets()) {
        alert("Attendance is not marked yet.");
        return;
      }
      absBtn.disabled = true;
      var prev = absBtn.textContent;
      absBtn.textContent = "Loading…";
      KVSheets.sheetsCall("getTodayAbsentees", { date: date })
        .then(function (res) {
          absBtn.disabled = false;
          absBtn.textContent = prev;
          if (!res.marked) {
            alert("Attendance is not marked yet.");
            return;
          }
          var abs = res.absentees || [];
          var rows = [["Roll No", "Student Name"]];
          for (var i = 0; i < abs.length; i++) rows.push([String(abs[i].rollNo || ""), String(abs[i].studentName || "")]);
          if (!abs.length) rows.push(["—", "No absentees"]);
          openModal("Today's Absentees (" + ymdToDmy(res.date || date) + ")", rows, {
            exportable: false,
            subtitle: modalClassSubtitle(),
            classOnSecondLine: true,
          });
          refreshAttendanceByDateFromSheets(date);
        })
        .catch(function () {
          absBtn.disabled = false;
          absBtn.textContent = prev;
          alert("Could not fetch absentees right now.");
        });
    });

    if (waBtn) {
      waBtn.addEventListener("click", function () {
        shareTodayAbsenteesOnWhatsApp();
      });
    }

    sumBtn.addEventListener("click", function () {
      var date = todayYmd();
      var c = loadAttendanceCache()[date];
      function showSummary(current) {
        if (!(current && current.marked && current.entries && current.entries.length)) return false;
        var s0 = summaryFromEntries(current.entries, current.dayLabel || date, date);
        openModal("Today's Attendance Summary (" + ymdToDmy(date) + ")", [
          ["Metric", "Girls", "Boys", "Total"],
          ["Total", String(s0.totals.girls || 0), String(s0.totals.boys || 0), String(s0.totals.total || 0)],
          ["Present", String(s0.present.girls || 0), String(s0.present.boys || 0), String(s0.present.total || 0)],
          ["Absent", String(s0.absent.girls || 0), String(s0.absent.boys || 0), String(s0.absent.total || 0)],
        ], { exportable: false, headerBlue: true, subtitle: modalClassSubtitle(), classOnSecondLine: true });
        return true;
      }
      if (showSummary(c)) {
        if (hasSheets() && !(c && c.pending)) refreshAttendanceByDateFromSheets(date);
        return;
      }
      if (!hasSheets()) {
        alert("Attendance is not marked yet.");
        return;
      }
      sumBtn.disabled = true;
      var prev = sumBtn.textContent;
      sumBtn.textContent = "Loading…";
      KVSheets.sheetsCall("getTodayAttendanceSummary", { date: date })
        .then(function (res) {
          sumBtn.disabled = false;
          sumBtn.textContent = prev;
          if (!res.marked) {
            alert("Attendance is not marked yet.");
            return;
          }
          openModal("Today's Attendance Summary (" + ymdToDmy(res.date || date) + ")", [
            ["Metric", "Girls", "Boys", "Total"],
            ["Total", String(res.totals.girls || 0), String(res.totals.boys || 0), String(res.totals.total || 0)],
            ["Present", String(res.present.girls || 0), String(res.present.boys || 0), String(res.present.total || 0)],
            ["Absent", String(res.absent.girls || 0), String(res.absent.boys || 0), String(res.absent.total || 0)],
          ], { exportable: false, headerBlue: true, subtitle: modalClassSubtitle(), classOnSecondLine: true });
          refreshAttendanceByDateFromSheets(date);
        })
        .catch(function () {
          sumBtn.disabled = false;
          sumBtn.textContent = prev;
          alert("Could not fetch summary right now.");
        });
    });

    if (samagamBtn) {
      samagamBtn.addEventListener("click", function () {
        var entries = todayAttendanceEntriesForSamagam();
        if (!window.KVSamagam || typeof KVSamagam.startFlow !== "function") {
          alert("SAMAGAM helper is not loaded. Refresh the page.");
          return;
        }
        KVSamagam.startFlow(entries);
      });
    }

    if (monthlyBtn) {
      monthlyBtn.addEventListener("click", function () {
        if (!hasSheets()) {
          alert("Configure the Google Apps Script web app URL in settings first.");
          return;
        }
        openMonthlyDialog();
      });
    }

    if (monthlyCloseBtn) monthlyCloseBtn.addEventListener("click", closeMonthlyDialog);
    if (monthlyBackdrop) monthlyBackdrop.addEventListener("click", closeMonthlyDialog);
    if (monthlyGoBtn) {
      monthlyGoBtn.addEventListener("click", function () {
        var monthVal = monthlySel ? String(monthlySel.value || "").trim() : "";
        if (!monthVal) return;
        monthlyGoBtn.disabled = true;
        var prevTxt = monthlyGoBtn.textContent;
        monthlyGoBtn.textContent = "Loading…";
        KVSheets.sheetsCall("getMonthlyAttendanceReport", {
          month: monthVal,
        })
          .then(function (res) {
            monthlyGoBtn.disabled = false;
            monthlyGoBtn.textContent = prevTxt;
            closeMonthlyDialog();
            renderMonthlyReportModal(monthVal, res);
          })
          .catch(function (err) {
            monthlyGoBtn.disabled = false;
            monthlyGoBtn.textContent = prevTxt;
            alert(formatShortUserMessage(err && err.message ? err.message : err));
          });
      });
    }

    primeTodayAttendanceDraftFromStudents();
    var initToday = loadAttendanceCache()[todayYmd()];
    setMarkBtnLabel(!!(initToday && initToday.marked));
    setAttendancePostMarkButtonsVisible(!!(initToday && initToday.marked));
    runAttendanceBackgroundSync({ preloadBacklog: true });
    refreshAttendanceByDateFromSheets(todayYmd()).then(function () {
      var c = loadAttendanceCache()[todayYmd()];
      setMarkBtnLabel(!!(c && c.marked));
      setAttendancePostMarkButtonsVisible(!!(c && c.marked));
    });
    setSubmitLabel();
    try {
      window.__kvRunAttendanceBackgroundSync = runAttendanceBackgroundSync;
      window.__kvPrimeAttendanceTodayDraft = primeTodayAttendanceDraftFromStudents;
    } catch (_e) {}
    if (window.KVSamagam && typeof KVSamagam.checkDevServer === "function") {
      KVSamagam.checkDevServer().then(function (ok) {
        if (!ok && statusLine) {
          statusLine.textContent =
            "Status: Mark to SAMAGAM needs start-web.bat (Vaayu dev server). Close any npm serve terminal and restart.";
        }
      });
    }
  }

  function wireTimetableModule() {
    var btnClass = document.getElementById("btnTimetableClass");
    var btnTeacher = document.getElementById("btnTimetableTeacher");
    if (!btnClass || !btnTeacher) return;

    var TT_CACHE_SS = "kvTimetableDayV2";

    function hasSheets() {
      return !!(window.KVSheets && typeof KVSheets.getSheetsUrl === "function" && KVSheets.getSheetsUrl());
    }

    function timetableYmdToday() {
      try {
        return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata" }).format(new Date()).slice(0, 10);
      } catch (_e) {
        var d = new Date();
        var y = d.getFullYear();
        var m = d.getMonth() + 1;
        var dd = d.getDate();
        return y + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd;
      }
    }

    function timetableCacheRead() {
      try {
        var raw = sessionStorage.getItem(TT_CACHE_SS);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (_e) {
        return null;
      }
    }

    function timetableCacheWrite(pack) {
      try {
        sessionStorage.setItem(TT_CACHE_SS, JSON.stringify(pack));
      } catch (_e) {}
    }

    function timetablePackEnsure(ymd) {
      var p = window.__kvTimetableDayPack;
      if (!p || p.ymd !== ymd) {
        p = { ymd: ymd, classRes: null, teacherRes: null };
        window.__kvTimetableDayPack = p;
      }
      return p;
    }

    function timetablePackMerge(ymd, classRes, teacherRes) {
      var p = timetablePackEnsure(ymd);
      if (classRes) p.classRes = classRes;
      if (teacherRes) p.teacherRes = teacherRes;
      timetableCacheWrite(p);
    }

    var _timetablePrefetchInflight = null;
    function prefetchTimetablesForToday() {
      if (!hasSheets()) return;
      var ymd = timetableYmdToday();
      var p = window.__kvTimetableDayPack;
      if (p && p.ymd === ymd && p.classRes && p.teacherRes && (p.classRes.slots || []).length) return;
      var disk = timetableCacheRead();
      if (disk && disk.ymd === ymd && disk.classRes && disk.teacherRes && (disk.classRes.slots || []).length) {
        window.__kvTimetableDayPack = disk;
        return;
      }
      if (_timetablePrefetchInflight) return;
      _timetablePrefetchInflight = Promise.all([
        KVSheets.sheetsCall("getClassTimetableForDate", { date: ymd }),
        KVSheets.sheetsCall("getTeacherTimetableForDate", { date: ymd }),
      ])
        .then(function (arr) {
          timetablePackMerge(ymd, arr[0], arr[1]);
        })
        .catch(function () {})
        .finally(function () {
          _timetablePrefetchInflight = null;
        });
    }

    try {
      var boot = timetableCacheRead();
      if (boot && boot.ymd === timetableYmdToday()) window.__kvTimetableDayPack = boot;
    } catch (_e) {}

    try {
      window.__kvTimetableOnShow = function () {};
      window.__kvPrefetchTimetables = prefetchTimetablesForToday;
    } catch (_e) {}

    function openClassModalFromRes(res) {
      var rows = [["Slot", "Time", "Subject", "Teacher"]];
      var slots = (res && res.slots) || [];
      for (var i = 0; i < slots.length; i++) {
        var s = slots[i];
        if (s.kind === "break") {
          rows.push([String(s.label || "Break"), String(s.timeRange || ""), "—", "—"]);
        } else {
          rows.push([
            String(s.label || ""),
            String(s.timeRange || ""),
            s.subject ? String(s.subject) : "—",
            s.teacher ? String(s.teacher) : "—",
          ]);
        }
      }
      var title = (res && res.title ? res.title : "Class timetable") + " (" + (res && res.dateDisplay ? res.dateDisplay : "") + ")";
      openModal(title, rows, { exportable: true, headerBlue: true });
    }

    function openTeacherModalFromRes(res) {
      var rows = [["Slot", "Time", "Class", "Subject"]];
      var slots = (res && res.slots) || [];
      for (var j = 0; j < slots.length; j++) {
        var t = slots[j];
        if (t.kind === "break") {
          rows.push([String(t.label || "Break"), String(t.timeRange || ""), "—", "—"]);
        } else {
          rows.push([
            String(t.label || ""),
            String(t.timeRange || ""),
            t.clazz ? String(t.clazz) : "—",
            t.subject ? String(t.subject) : "—",
          ]);
        }
      }
      var title2 =
        (res && res.title ? res.title : "Teacher timetable") + " (" + (res && res.dateDisplay ? res.dateDisplay : "") + ")";
      openModal(title2, rows, { exportable: true, headerBlue: true });
    }

    btnClass.addEventListener("click", function () {
      if (!hasSheets()) {
        alert("Configure the Google Apps Script web app URL in settings first.");
        return;
      }
      var ymd = timetableYmdToday();
      var pack = window.__kvTimetableDayPack;
      if (pack && pack.ymd === ymd && pack.classRes && (pack.classRes.slots || []).length) {
        openClassModalFromRes(pack.classRes);
        return;
      }
      btnClass.disabled = true;
      var prev = btnClass.textContent;
      btnClass.textContent = "Loading…";
      KVSheets.sheetsCall("getClassTimetableForDate", { date: ymd })
        .then(function (res) {
          timetablePackMerge(ymd, res, null);
          openClassModalFromRes(res);
        })
        .catch(function (e) {
          alert(formatShortUserMessage(e && e.message ? e.message : e));
        })
        .finally(function () {
          btnClass.disabled = false;
          btnClass.textContent = prev;
        });
    });

    btnTeacher.addEventListener("click", function () {
      if (!hasSheets()) {
        alert("Configure the Google Apps Script web app URL in settings first.");
        return;
      }
      var ymdT = timetableYmdToday();
      var packT = window.__kvTimetableDayPack;
      if (packT && packT.ymd === ymdT && packT.teacherRes && (packT.teacherRes.slots || []).length) {
        openTeacherModalFromRes(packT.teacherRes);
        return;
      }
      btnTeacher.disabled = true;
      var prevT = btnTeacher.textContent;
      btnTeacher.textContent = "Loading…";
      KVSheets.sheetsCall("getTeacherTimetableForDate", { date: ymdT })
        .then(function (res) {
          timetablePackMerge(ymdT, null, res);
          openTeacherModalFromRes(res);
        })
        .catch(function (e) {
          alert(formatShortUserMessage(e && e.message ? e.message : e));
        })
        .finally(function () {
          btnTeacher.disabled = false;
          btnTeacher.textContent = prevT;
        });
    });
  }

  function wireSettingsTimetableEditor() {
    var btnClass = document.getElementById("btnSettingsClassTimetable");
    var btnTeacher = document.getElementById("btnSettingsTeacherTimetable");
    var entityWrap = document.getElementById("settingsEntityNameWrap");
    var entityLabel = document.getElementById("settingsEntityNameLabel");
    var entityInput = document.getElementById("settingsEntityNameInput");
    var gridWrap = document.getElementById("settingsTimetableGridWrap");
    var btnSave = document.getElementById("btnSettingsTimetableSave");
    var thead = document.getElementById("settingsTimetableHead");
    var tbody = document.getElementById("settingsTimetableBody");
    if (!btnClass || !btnTeacher || !entityWrap || !entityLabel || !entityInput || !gridWrap || !btnSave || !thead || !tbody) return;

    var ttEditorState = {
      dayKeys: [],
      periodLabels: [],
      entityType: "",
    };
    var ttEditorCache = {
      classRes: null,
      teacherResByCode: {},
    };

    function hasSheets() {
      return !!(window.KVSheets && typeof KVSheets.getSheetsUrl === "function" && KVSheets.getSheetsUrl());
    }

    function currentEntityName() {
      return String((entityInput && entityInput.value) || "").trim();
    }

    function setModeButtonState(type) {
      btnClass.className = type === "class" ? "btn primary" : "btn outline";
      btnTeacher.className = type === "teacher" ? "btn primary" : "btn outline";
    }

    function setEntityField(type) {
      entityWrap.hidden = false;
      entityWrap.style.display = "";
      entityLabel.textContent = type === "class" ? "Class" : "Teacher Name";
      entityInput.placeholder = type === "class" ? "e.g. VII A" : "e.g. TGT WE";
    }

    function resetEditorUi() {
      ttEditorState.dayKeys = [];
      ttEditorState.periodLabels = [];
      ttEditorState.entityType = "";
      entityWrap.hidden = true;
      entityWrap.style.display = "none";
      gridWrap.hidden = true;
      btnSave.hidden = true;
      thead.innerHTML = "";
      tbody.innerHTML = "";
      setModeButtonState("");
    }

    function buildHead(type, periodLabels) {
      var html = "<tr><th>Day</th>";
      var i;
      for (i = 0; i < periodLabels.length; i++) {
        html += "<th>Period " + periodLabels[i] + "</th>";
      }
      html += "</tr>";
      thead.innerHTML = html;
    }

    function buildBody(type, dayKeys, periodLabels, rowsMap) {
      var html = "";
      var di, pi;
      for (di = 0; di < dayKeys.length; di++) {
        var dayKey = dayKeys[di];
        html += '<tr><td class="tt-day-cell">' + dayKey + "</td>";
        for (pi = 0; pi < periodLabels.length; pi++) {
          var period = periodLabels[pi];
          var row = rowsMap[dayKey] || {};
          var cell = row[period] || {};
          var leftVal = type === "class" ? String(cell.subject || "") : String(cell.clazz || "");
          var rightVal = type === "class" ? String(cell.teacher || "") : String(cell.subject || "");
          html += '<td><div class="tt-cell-stack">';
          html +=
            '<input class="tt-mini-input" type="text" data-day="' +
            dayKey +
            '" data-period="' +
            period +
            '" data-part="left" value="' +
            escapeHtml(leftVal) +
            '" placeholder="' +
            (type === "class" ? "Subject" : "Class") +
            '" />';
          html +=
            '<input class="tt-mini-input" type="text" data-day="' +
            dayKey +
            '" data-period="' +
            period +
            '" data-part="right" value="' +
            escapeHtml(rightVal) +
            '" placeholder="' +
            (type === "class" ? "Teacher" : "Subject") +
            '" />';
          html += "</div></td>";
        }
        html += "</tr>";
      }
      tbody.innerHTML = html;
    }

    function collectRows(type) {
      var rows = [];
      var di, pi;
      for (di = 0; di < ttEditorState.dayKeys.length; di++) {
        var dayKey = ttEditorState.dayKeys[di];
        var periods = {};
        for (pi = 0; pi < ttEditorState.periodLabels.length; pi++) {
          var period = ttEditorState.periodLabels[pi];
          var leftEl = tbody.querySelector('input[data-day="' + dayKey + '"][data-period="' + period + '"][data-part="left"]');
          var rightEl = tbody.querySelector('input[data-day="' + dayKey + '"][data-period="' + period + '"][data-part="right"]');
          var left = String((leftEl && leftEl.value) || "").trim();
          var right = String((rightEl && rightEl.value) || "").trim();
          if (type === "class") {
            periods[period] = { subject: left, teacher: right };
          } else {
            periods[period] = { clazz: left, subject: right };
          }
        }
        rows.push({ dayKey: dayKey, periods: periods });
      }
      return rows;
    }

    function renderEditor(type, res) {
      ttEditorState.dayKeys = Array.isArray(res && res.dayKeys) ? res.dayKeys : [];
      ttEditorState.periodLabels = Array.isArray(res && res.periodLabels) ? res.periodLabels : [];
      ttEditorState.entityType = type;
      buildHead(type, ttEditorState.periodLabels);
      buildBody(type, ttEditorState.dayKeys, ttEditorState.periodLabels, (res && res.rowsMap) || {});
      gridWrap.hidden = false;
      btnSave.hidden = false;
    }

    function cacheEditorRes(type, teacherCode, res) {
      if (!res) return;
      if (type === "class") ttEditorCache.classRes = res;
      else ttEditorCache.teacherResByCode[String(teacherCode || "").trim().toLowerCase()] = res;
    }

    function getCachedEditorRes(type, teacherCode) {
      if (type === "class") return ttEditorCache.classRes;
      var key = String(teacherCode || "").trim().toLowerCase();
      return ttEditorCache.teacherResByCode[key] || null;
    }

    function prefetchEditorData() {
      if (!hasSheets()) return;
      KVSheets.sheetsCall("getTimetableEditorData", { entityType: "class", teacherCode: "" })
        .then(function (res) {
          cacheEditorRes("class", "", res);
        })
        .catch(function () {});
      KVSheets.sheetsCall("getTimetableEditorData", { entityType: "teacher", teacherCode: "" })
        .then(function (res) {
          var tc = String((res && res.teacherCode) || "").trim();
          cacheEditorRes("teacher", tc, res);
          cacheEditorRes("teacher", "", res);
        })
        .catch(function () {});
    }

    function defaultEditorRes(type) {
      var dayKeys = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
      var periodLabels = ["1", "2", "3", "4", "5", "6", "7", "8"];
      var rowsMap = {};
      for (var di = 0; di < dayKeys.length; di++) {
        rowsMap[dayKeys[di]] = {};
        for (var pi = 0; pi < periodLabels.length; pi++) {
          rowsMap[dayKeys[di]][periodLabels[pi]] = type === "class" ? { subject: "", teacher: "" } : { clazz: "", subject: "" };
        }
      }
      return { dayKeys: dayKeys, periodLabels: periodLabels, rowsMap: rowsMap };
    }

    function loadEditor(type) {
      if (!hasSheets()) {
        alert("Configure the Google Apps Script web app URL in settings first.");
        return;
      }
      setModeButtonState(type);
      setEntityField(type);
      gridWrap.hidden = true;
      btnSave.hidden = true;
      thead.innerHTML = "";
      tbody.innerHTML = "";
      ttEditorState.dayKeys = [];
      ttEditorState.periodLabels = [];
      var entityName = currentEntityName();
      var cached = getCachedEditorRes(type, type === "teacher" ? entityName : "");
      renderEditor(type, cached || defaultEditorRes(type));
      ttEditorState.entityType = type;
    }

    btnClass.addEventListener("click", function () {
      loadEditor("class");
    });

    btnTeacher.addEventListener("click", function () {
      loadEditor("teacher");
    });

    btnSave.addEventListener("click", function () {
      if (!hasSheets()) {
        alert("Configure the Google Apps Script web app URL in settings first.");
        return;
      }
      var type = ttEditorState.entityType;
      if (type !== "class" && type !== "teacher") {
        alert("Open Class Time Table or Teacher's Time Table first.");
        return;
      }
      var entityName = currentEntityName();
      if (type === "teacher" && !entityName) {
        alert("Enter Teacher Name first.");
        return;
      }
      if (!ttEditorState.dayKeys.length || !ttEditorState.periodLabels.length) {
        alert("Open timetable first.");
        return;
      }
      var rows = collectRows(type);
      btnSave.disabled = true;
      var prev = btnSave.textContent;
      btnSave.textContent = "Saving…";
      KVSheets.sheetsCall("saveTimetableEditorData", {
        entityType: type,
        teacherCode: type === "teacher" ? entityName : "",
        rows: rows,
      })
        .then(function (res) {
          alert("Timetable saved. Updated rows: " + String(res.updatedRows || 0));
        })
        .catch(function (e) {
          alert(formatShortUserMessage(e && e.message ? e.message : e));
        })
        .finally(function () {
          btnSave.disabled = false;
          btnSave.textContent = prev;
        });
    });

    setModeButtonState("");
    resetEditorUi();
    prefetchEditorData();
    window.__prefetchSettingsTimetableEditor = prefetchEditorData;
    window.__resetSettingsTimetableEditor = resetEditorUi;
  }

  function wireEvents() {
    wireAppNavigation();
    wireInstructionsModal();
    wireQuerySubtabs();
    wireFeeSubtabs();
    wireFeeModule();
    wireConsolidatedSheets();
    wireAttendanceModule();
    wireTimetableModule();
    wireSettingsTimetableEditor();

    var marksEntryToggle = document.getElementById("marksEntryToggle");
    if (marksEntryToggle) {
      marksEntryToggle.addEventListener("change", function () {
        if (_marksEntryToggleProgrammatic) return;
        if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
          _marksEntryToggleProgrammatic = true;
          marksEntryToggle.checked = !_marksEntryToggle.checked;
          _marksEntryToggleProgrammatic = false;
          alert(formatShortUserMessage("Configure KV_SHEETS_WEB_APP_URL first.", 100));
          return;
        }
        var want = marksEntryToggle.checked;
        _marksEntryPolicySaveInFlight = true;
        _marksEntryEnabled = want;
        updateMarksPickerUI();
        KVSheets.sheetsCall("setMarksEntryPolicy", { enabled: want })
          .then(function (data) {
            _marksEntryEnabled = data.marksEntryEnabled !== false;
            syncMarksEntryToggleFromCache();
            updateMarksPickerUI();
          })
          .catch(function (e) {
            _marksEntryToggleProgrammatic = true;
            marksEntryToggle.checked = !want;
            _marksEntryToggleProgrammatic = false;
            _marksEntryEnabled = !want;
            updateMarksPickerUI();
            alert(formatShortUserMessage(e.message || String(e)));
          })
          .finally(function () {
            _marksEntryPolicySaveInFlight = false;
            updateMarksEntryToggleRowState();
          });
      });
    }

    var btnHomeSync = document.getElementById("btnHomeSyncSheets");
    if (btnHomeSync) {
      var homeSyncDefaultLabel = btnHomeSync.textContent;
      btnHomeSync.addEventListener("click", function () {
        if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
          alert(
            "Set KV_SHEETS_WEB_APP_URL in sheets-webapp-config.js (deployed web app URL) to sync with Google Sheets."
          );
          return;
        }
        var btn = btnHomeSync;
        btn.disabled = true;
        btn.textContent = "Syncing…";
        pullSheetsIntoApp({ silent: false }).finally(function () {
          btn.disabled = false;
          btn.textContent = homeSyncDefaultLabel;
        });
      });
    }

    var marksMaxEl = document.getElementById("marksMax");
    if (marksMaxEl) {
      marksMaxEl.addEventListener("input", function () {
        revalidateAllMarksInputs();
      });
      marksMaxEl.addEventListener("change", function () {
        revalidateAllMarksInputs();
      });
      marksMaxEl.addEventListener("blur", function () {
        var t = String(this.value).trim();
        if (!t) return;
        var n = parseFloat(t.replace(/,/g, "."));
        if (isNaN(n) || n <= 0) {
          showMarksValidationMessage("Maximum marks must be a positive number.");
          this.value = "";
          revalidateAllMarksInputs();
        }
      });
    }

    var marksExamEl = document.getElementById("marksExam");
    if (marksExamEl) {
      marksExamEl.addEventListener("change", function () {
        if (_marksSelectProgrammatic) return;
        rebuildMarksSubjectSelectForExam(this.value);
        _marksPickerEditing = false;
        editingMarksSlipId = null;
        if (typeof window !== "undefined") window.__marksEditRecord = null;
        setMarksCancelEditingVisible(false);
        marksClearEntryMetaFields();
        renderMarksStudentTable();
        updateMarksPickerUI();
      });
    }
    var marksSubEl = document.getElementById("marksSubject");
    if (marksSubEl) {
      marksSubEl.addEventListener("change", function () {
        if (_marksSelectProgrammatic) return;
        _marksPickerEditing = false;
        editingMarksSlipId = null;
        if (typeof window !== "undefined") window.__marksEditRecord = null;
        setMarksCancelEditingVisible(false);
        marksClearEntryMetaFields();
        renderMarksStudentTable();
        updateMarksPickerUI();
      });
    }

    var btnCopyTeacherLink = document.getElementById("btnMarksCopyTeacherLink");
    if (btnCopyTeacherLink) {
      btnCopyTeacherLink.addEventListener("click", function () {
        var text = buildMarksTeacherShareClipText();
        if (!text) {
          alert(
            "Set KV_SHEETS_WEB_APP_URL in sheets-webapp-config.js, deploy Apps Script with TeacherMarks.html (?teacher=1), then try again."
          );
          return;
        }
        copyTextToClipboard(text).then(
          function () {
            alert("Copied.");
          },
          function () {
            try {
              window.prompt("Copy this text (Ctrl+C / OK):", text);
            } catch (e2) {
              alert("Could not copy. Check browser permissions or try again.");
            }
          }
        );
      });
    }

    var btnEditSel = document.getElementById("btnMarksEditSelected");
    if (btnEditSel) {
      btnEditSel.addEventListener("click", function () {
        if (!_marksEntryEnabled) {
          showMarksValidationMessage(MARKS_ENTRY_DISABLED_MSG);
          return;
        }
        var res = _resolvedMarksSlip;
        if (!res || !res.available) return;
        if (res.source === "local") {
          applySlipToMarksForm(res.record);
          return;
        }
        if (!window.KVSheets) {
          alert("Sheets client not loaded.");
          return;
        }
        var cachedDetail = getCachedSheetSlipDetail(res.slipId);
        if (cachedDetail && cachedDetail.meta && cachedDetail.entries) {
          var cachedRec = sheetApiToRecord(cachedDetail.meta, cachedDetail.entries, res.slipId);
          applySlipToMarksForm(cachedRec);
        }
        KVSheets.sheetsCall("getMarkSlip", { slipId: res.slipId })
          .then(function (data) {
            setCachedSheetSlipDetail(res.slipId, data);
            var rec = sheetApiToRecord(data.meta, data.entries, res.slipId);
            applySlipToMarksForm(rec);
          })
          .catch(function (e) {
            alert(e.message || String(e));
          });
      });
    }
    var btnDlSel = document.getElementById("btnMarksDownloadSelected");
    if (btnDlSel) {
      btnDlSel.addEventListener("click", function () {
        var res = _resolvedMarksSlip;
        if (!res || !res.available) return;
        if (!window.KVReports || typeof window.KVReports.downloadMarksSlipPdf !== "function") {
          alert("PDF export not available.");
          return;
        }
        if (res.source === "local") {
          var payload = recordToPdfPayload(res.record);
          window.KVReports.downloadMarksSlipPdf(payload.meta, payload.rows);
          return;
        }
        if (!window.KVSheets) {
          alert("Cannot reach Google Sheets for this slip. Check KV_SHEETS_WEB_APP_URL in sheets-webapp-config.js and deployment.");
          return;
        }
        var cachedPdfDetail = getCachedSheetSlipDetail(res.slipId);
        if (cachedPdfDetail && cachedPdfDetail.meta && cachedPdfDetail.entries) {
          var cachedMeta = sheetsMetaToPdfMeta(cachedPdfDetail.meta);
          var cachedRows = sheetsEntriesToPdfRows(cachedPdfDetail.meta, cachedPdfDetail.entries);
          window.KVReports.downloadMarksSlipPdf(cachedMeta, cachedRows);
          return;
        }
        KVSheets.sheetsCall("getMarkSlip", { slipId: res.slipId })
          .then(function (data) {
            setCachedSheetSlipDetail(res.slipId, data);
            var pdfMeta = sheetsMetaToPdfMeta(data.meta);
            var pdfRows = sheetsEntriesToPdfRows(data.meta, data.entries);
            window.KVReports.downloadMarksSlipPdf(pdfMeta, pdfRows);
          })
          .catch(function (e) {
            alert(e.message || String(e));
          });
      });
    }

    var marksPanel = document.getElementById("marksEntryPanel");
    if (marksPanel) {
      marksPanel.addEventListener("keydown", function (e) {
        var t = e.target;
        if (!t || t.tagName !== "INPUT" || !t.classList.contains("marks-cell-input")) return;
        if (e.key === "Enter" || e.key === "ArrowDown") {
          if (marksCellBlocksNavigation(t)) {
            e.preventDefault();
            showMarksValidationMessage(marksCellNavigationWarningMessage(t));
            t.value = "";
            applyMarksCellValidation(t);
            t.focus();
            return;
          }
          e.preventDefault();
          focusAdjacentMarksInput(t, 1);
        } else if (e.key === "ArrowUp") {
          if (marksCellBlocksNavigation(t)) {
            e.preventDefault();
            showMarksValidationMessage(marksCellNavigationWarningMessage(t));
            t.value = "";
            applyMarksCellValidation(t);
            t.focus();
            return;
          }
          e.preventDefault();
          focusAdjacentMarksInput(t, -1);
        }
      });
    }

    document.getElementById("dashCat").addEventListener("change", updateDashSub);
    document.getElementById("btnDashFilter").addEventListener("click", function () {
      var activeStudents = activeStudentsOnly(students);
      var cat = document.getElementById("dashCat").value;
      var sub = document.getElementById("dashSub").value;
      var r = filteredStudentNames(activeStudents, cat, sub);
      if (r.error) {
        alert(r.error);
        return;
      }
      if (!r.names.length) {
        alert("No students found.");
        return;
      }
      var data = [["S No", "Student Name"]];
      for (var i = 0; i < r.names.length; i++) data.push([String(i + 1), r.names[i]]);
      openModal(cat + " (" + sub + ")", data);
    });

    document.getElementById("sec1Student").addEventListener("change", updateDetail);
    document.getElementById("sec1Header").addEventListener("change", updateDetail);
    function updateDetail() {
      var activeStudents = activeStudentsOnly(students);
      var name = document.getElementById("sec1Student").value;
      var col = document.getElementById("sec1Header").value;
      var box = document.getElementById("detailDisplay");
      if (!name || col === "") {
        box.innerHTML = '<span class="muted">Pick student and column</span>';
        return;
      }
      var colIdx = parseInt(col, 10);
      var h = HEADERS[colIdx];
      if (/^photo$/i.test(String(h || ""))) {
        var row = null;
        var ri;
        for (ri = 0; ri < activeStudents.length; ri++) {
          if (String(activeStudents[ri]["Student Name"] || "").trim() === String(name).trim()) {
            row = activeStudents[ri];
            break;
          }
        }
        var url = row ? photoUrlFromMasterCell(studentPhotoRawFromRow(row)) : "";
        box.innerHTML = "";
        if (!url) {
          box.innerHTML = "<span class=\"muted\">—</span>";
          return;
        }
        var wrap = document.createElement("div");
        wrap.className = "query-photo-detail-wrap";
        var img = document.createElement("img");
        img.className = "query-photo-detail";
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.src = url;
        img.addEventListener("error", function () {
          box.innerHTML = "<span class=\"muted\">—</span>";
        });
        wrap.appendChild(img);
        var a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "card-desc small";
        a.textContent = "Open photo link";
        wrap.appendChild(a);
        box.appendChild(wrap);
        return;
      }
      box.textContent = getSingleValue(activeStudents, name, colIdx);
    }

    document.getElementById("sec2Header").addEventListener("change", updateSec2Sub);
    document.getElementById("btnListGen").addEventListener("click", function () {
      var activeStudents = activeStudentsOnly(students);
      var col = document.getElementById("sec2Header").value;
      var sub = document.getElementById("sec2SubValue").value;
      var sel = document.getElementById("sec2Header");
      var headerName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "";
      if (!col || !sub) {
        alert("Please select both header and value.");
        return;
      }
      var matches = filteredListByColumn(activeStudents, parseInt(col, 10), sub);
      if (!matches.length) {
        alert("No students found.");
        return;
      }
      var title = headerName + ": " + sub + " (Total: " + matches.length + ")";
      var data = [["S No", "Student Name"]];
      for (var i = 0; i < matches.length; i++) data.push([String(i + 1), matches[i]]);
      openModal(title, data);
    });

    document.getElementById("btnProfile").addEventListener("click", function () {
      var activeStudents = activeStudentsOnly(students);
      var name = document.getElementById("profileStudent").value;
      if (!name) {
        alert("Please select a student.");
        return;
      }
      var rows = studentProfile(activeStudents, name);
      if (!rows) {
        alert("Student not found.");
        return;
      }
      var data = [["Property", "Information"]].concat(rows);
      openModal("Student Profile: " + name, data);
    });

    document.getElementById("btnSumCat").addEventListener("click", function () {
      openModal("Category Enrollment Summary", categoryEnrollmentSummary(activeStudentsOnly(students)));
    });
    document.getElementById("btnSumAdm").addEventListener("click", function () {
      openModal("Admission Category Enrollment Summary", admissionCategorySummary(activeStudentsOnly(students)));
    });

    document.getElementById("btnToggleCols").addEventListener("click", function () {
      var btn = document.getElementById("btnToggleCols");
      var boxes = document.querySelectorAll('input[name="reportCol"]');
      var allOn = true;
      for (var i = 0; i < boxes.length; i++) {
        if (!boxes[i].checked) allOn = false;
      }
      var check = !allOn;
      for (var j = 0; j < boxes.length; j++) boxes[j].checked = check;
      syncSelectedFromDom();
      btn.textContent = check ? "Deselect all" : "Select all";
    });

    document.getElementById("btnShowReport").addEventListener("click", function () {
      var activeStudents = activeStudentsOnly(students);
      var idx = getSelectedIndices();
      if (!idx.length) {
        alert("Select at least one column.");
        return;
      }
      openModal("Custom Student Report", customReportRows(activeStudents, idx));
    });

    document.getElementById("btnExportExcel").addEventListener("click", function () {
      var activeStudents = activeStudentsOnly(students);
      if (!window.KVReports) {
        alert("Export scripts missing. Refresh the page.");
        return;
      }
      var idx = getSelectedIndices();
      if (!idx.length) {
        alert("Select columns.");
        return;
      }
      var data = customReportRows(activeStudents, idx);
      window.KVReports.downloadExcel("Custom Student Report", data);
    });
    document.getElementById("btnExportPdf").addEventListener("click", function () {
      var activeStudents = activeStudentsOnly(students);
      if (!window.KVReports) {
        alert("Export scripts missing. Refresh the page.");
        return;
      }
      var idx = getSelectedIndices();
      if (!idx.length) {
        alert("Select columns.");
        return;
      }
      var data = customReportRows(activeStudents, idx);
      window.KVReports.downloadPdf("Custom Student Report", data);
    });

    document.getElementById("btnMarksSubmit").addEventListener("click", function () {
      if (!_marksEntryEnabled) {
        showMarksValidationMessage(MARKS_ENTRY_DISABLED_MSG);
        return;
      }
      var data = tryBuildMarksSlipRecord();
      if (!data) return;
      var wasEditing = editingMarksSlipId != null;
      if (wasEditing) {
        data.record.id = editingMarksSlipId;
      }
      data.record.savedAt = new Date().toISOString();
      var allMs = loadMarksheets();
      if (wasEditing) {
        var replaced = false;
        for (var ri = 0; ri < allMs.length; ri++) {
          if (String(allMs[ri].id) === String(editingMarksSlipId)) {
            allMs[ri] = data.record;
            replaced = true;
            break;
          }
        }
        if (!replaced) allMs.push(data.record);
        editingMarksSlipId = null;
        setMarksCancelEditingVisible(false);
      } else {
        allMs.push(data.record);
      }
      saveMarksheets(allMs);
      _marksPickerEditing = false;
      if (typeof window !== "undefined") window.__marksEditRecord = null;
      setMarksCancelEditingVisible(false);
      marksClearEntryMetaFields();
      rebuildMarksExamSelectOptions();
      var mex0 = document.getElementById("marksExam");
      rebuildMarksSubjectSelectForExam(mex0 ? mex0.value : "");
      renderMarksStudentTable();
      updateMarksPickerUI();
      /* Same as teacher marks: confirm immediately after local save + UI paint, not after Sheets API. */
      var savedMsg = wasEditing ? "Marks updated." : "Marks saved.";
      function showMarksSavedOptimistic() {
        if (typeof window.KV_showOkDialog === "function") {
          window.KV_showOkDialog(savedMsg);
        } else {
          alert(savedMsg);
        }
      }
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () {
          setTimeout(showMarksSavedOptimistic, 0);
        });
      } else {
        setTimeout(showMarksSavedOptimistic, 0);
      }
      var sheetP = Promise.resolve(true);
      if (window.KVSheets && typeof KVSheets.getSheetsUrl === "function" && KVSheets.getSheetsUrl()) {
        var sheetAction = wasEditing ? "replaceMarkSlip" : "saveMarkSlip";
        sheetP = KVSheets.sheetsCall(sheetAction, { record: data.record })
          .then(function () {
            removeMarksPendingById(data.record.id);
            return true;
          })
          .catch(function (e) {
            upsertMarksPending(data.record, sheetAction);
            showMarksValidationMessage(
              formatShortUserMessage(
                "Saved on device only. Sheets sync failed: " + (e.message || String(e)),
                200
              )
            );
            return false;
          });
      }
      sheetP.finally(function () {
        syncMarkSlipsListFromSheets({ silent: true }).finally(function () {
          if (!marksHasUnsavedMarksDraft()) {
            rebuildMarksExamSelectOptions();
            var mex = document.getElementById("marksExam");
            rebuildMarksSubjectSelectForExam(mex ? mex.value : "");
            updateMarksPickerUI();
          }
        });
      });
    });

    ;["btnMarksCancelEdit", "btnMarksCancelEditFooter"].forEach(function (cid) {
      var cel = document.getElementById(cid);
      if (cel) {
        cel.addEventListener("click", function (ev) {
          if (ev) ev.preventDefault();
          clearMarksEditMode();
        });
      }
    });

    document.getElementById("modalClose").addEventListener("click", closeModal);
    document.getElementById("modalBackdrop").addEventListener("click", function (e) {
      if (e.target.id === "modalBackdrop") closeModal();
    });
    document.getElementById("modalExcel").addEventListener("click", function () {
      if (!window.KVReports || !window._modalData) return;
      window.KVReports.downloadExcel(window._modalTitle || "Report", window._modalData);
    });
    document.getElementById("modalPdf").addEventListener("click", function () {
      if (!window.KVReports || !window._modalData) return;
      window.KVReports.downloadPdf(window._modalTitle || "Report", window._modalData);
    });

    document.getElementById("fileImport").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      function applyImportedRecords(recs) {
        if (!recs.length) {
          alert("No rows found in file.");
          return;
        }
        if (!confirm("Replace all current data with this file? (" + recs.length + " rows)")) return;
        var list = [];
        var nid = 1;
        for (var i = 0; i < recs.length; i++) {
          var o = rowFromImport(recs[i]);
          o.isActive = true;
          o.id = nid++;
          list.push(o);
        }
        var check = hasDuplicateAdmnNos(list);
        if (!check.ok) {
          alert("Import failed: " + check.error);
          return;
        }
        students = list;
        saveStudents(students);
        refreshUI();
        alert("Imported " + students.length + " students.");
      }

      var isExcel = /\.(xlsx|xls)$/i.test(String(f.name || ""));
      var reader = new FileReader();
      reader.onload = function () {
        try {
          if (isExcel) {
            if (!window.XLSX) throw new Error("XLSX library missing.");
            var wb = window.XLSX.read(new Uint8Array(reader.result), { type: "array" });
            var sheetName = wb.Sheets["Data Entry"] ? "Data Entry" : wb.SheetNames[0];
            var ws = wb.Sheets[sheetName];
            if (!ws) throw new Error("No readable sheet found in workbook.");
            var recsX = window.XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
            var recs = recsX.filter(function (row) {
              var keys = Object.keys(row || {});
              for (var i = 0; i < keys.length; i++) {
                if (String(row[keys[i]] != null ? row[keys[i]] : "").trim()) return true;
              }
              return false;
            });
            applyImportedRecords(recs);
          } else {
            var recsCsv = parseCSV(String(reader.result));
            applyImportedRecords(recsCsv);
          }
        } catch (err) {
          alert("Import failed: " + err.message);
        }
        e.target.value = "";
      };
      if (isExcel) reader.readAsArrayBuffer(f);
      else reader.readAsText(f, "UTF-8");
    });

    document.getElementById("btnExportFull").addEventListener("click", function () {
      if (!window.KVReports) {
        alert("Export scripts missing. Refresh the page.");
        return;
      }
      var idx = HEADERS.map(function (_, i) {
        return i;
      });
      var data = customReportRows(activeStudentsOnly(students), idx);
      window.KVReports.downloadExcel("Full student export", data);
    });

    document.getElementById("btnDownloadCsvTemplate").addEventListener("click", function () {
      if (!window.XLSX) {
        alert("Template export requires XLSX library. Refresh the page and try again.");
        return;
      }
      var wb = window.XLSX.utils.book_new();
      var wsInstructions = window.XLSX.utils.aoa_to_sheet(buildTemplateInstructionRows());
      var wsData = window.XLSX.utils.aoa_to_sheet([HEADERS.slice()]);
      window.XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");
      window.XLSX.utils.book_append_sheet(wb, wsData, "Data Entry");
      window.XLSX.writeFile(wb, "students_bulk_template.xlsx");
    });

    var signInBtn = document.getElementById("btnAccountSignIn");
    var signOutBtn = document.getElementById("btnAccountSignOut");
    function applyAccountKeyFromInfo(info) {
      var newKey = preferredAccountKey(info || {});
      var prevKey = currentUserKey();
      setCurrentUserKey(newKey);
      updateAccountUiLine();
      if (newKey !== prevKey) location.reload();
    }

    if (signInBtn) {
      signInBtn.addEventListener("click", function () {
        if (window.AndroidAccount && typeof window.AndroidAccount.signIn === "function") {
          window.AndroidAccount.signIn();
          return;
        }
        if (!window.KVGoogleSignIn || typeof KVGoogleSignIn.signIn !== "function") {
          alert("Google Sign-In is unavailable. Refresh the page and try again.");
          return;
        }
        signInBtn.disabled = true;
        KVGoogleSignIn.signIn()
          .then(function (info) {
            if (info) applyAccountKeyFromInfo(info);
          })
          .catch(function (err) {
            var msg = err && err.message ? err.message : "Google sign-in failed.";
            if (window.__kvOnAndroidSignInError) window.__kvOnAndroidSignInError(msg);
            else alert(msg);
          })
          .finally(function () {
            signInBtn.disabled = false;
          });
      });
    }
    if (signOutBtn) {
      signOutBtn.addEventListener("click", function () {
        if (window.AndroidAccount && typeof window.AndroidAccount.signOut === "function") {
          window.AndroidAccount.signOut();
          return;
        }
        var done = function () {
          setCurrentUserKey("guest");
          location.reload();
        };
        if (window.KVGoogleSignIn && typeof KVGoogleSignIn.signOut === "function") {
          KVGoogleSignIn.signOut().then(done).catch(done);
        } else {
          done();
        }
      });
    }
    window.__kvOnAndroidSignInError = function (msg) {
      if (msg) alert(String(msg));
    };
    window.__kvOnAndroidAccountChanged = function (jsonString) {
      var info = {};
      try {
        info = jsonString ? JSON.parse(String(jsonString)) : {};
      } catch (_e) {}
      applyAccountKeyFromInfo(info);
    };

    function loadSamagamSettingsIntoForm() {
      if (!window.KVSamagam || typeof KVSamagam.loadSamagamSettings !== "function") return;
      var s = KVSamagam.loadSamagamSettings();
      var u = document.getElementById("settingsSamagamUsername");
      var p = document.getElementById("settingsSamagamPassword");
      var c = document.getElementById("settingsSamagamCaptureUrl");
      if (u) u.value = String(s.username || "");
      if (p) p.value = String(s.password || "");
      if (c) {
        c.value = String(s.captureUrl || "");
        if (!c.value && typeof KVSamagam.captureUrl === "function") c.placeholder = KVSamagam.captureUrl();
      }
    }

    var saveSamagamBtn = document.getElementById("btnSaveSamagamSettings");
    if (saveSamagamBtn) {
      saveSamagamBtn.addEventListener("click", function () {
        if (!window.KVSamagam || typeof KVSamagam.saveSamagamSettings !== "function") {
          alert("SAMAGAM helper is not loaded. Refresh the page.");
          return;
        }
        var u = document.getElementById("settingsSamagamUsername");
        var p = document.getElementById("settingsSamagamPassword");
        var c = document.getElementById("settingsSamagamCaptureUrl");
        KVSamagam.saveSamagamSettings({
          username: u ? String(u.value || "").trim() : "",
          password: p ? String(p.value || "") : "",
          captureUrl: c ? String(c.value || "").trim() : "",
        });
        if (typeof window.KV_showOkDialog === "function") {
          window.KV_showOkDialog("SAMAGAM credentials saved on this device.");
        } else {
          alert("SAMAGAM credentials saved.");
        }
      });
    }
    loadSamagamSettingsIntoForm();

    function loadWhatsAppSettingsIntoForm() {
      if (!window.KVWhatsAppParents || typeof KVWhatsAppParents.loadSettings !== "function") return;
      var s = KVWhatsAppParents.loadSettings();
      var n = document.getElementById("settingsWhatsAppGroupName");
      var j = document.getElementById("settingsWhatsAppGroupJid");
      if (n) n.value = String(s.groupName || "");
      if (j) j.value = String(s.groupJid || "");
    }

    var saveWhatsAppBtn = document.getElementById("btnSaveWhatsAppSettings");
    if (saveWhatsAppBtn) {
      saveWhatsAppBtn.addEventListener("click", function () {
        if (!window.KVWhatsAppParents || typeof KVWhatsAppParents.saveSettings !== "function") {
          alert("WhatsApp helper is not loaded. Refresh the page.");
          return;
        }
        var n = document.getElementById("settingsWhatsAppGroupName");
        var j = document.getElementById("settingsWhatsAppGroupJid");
        KVWhatsAppParents.saveSettings({
          groupName: n ? String(n.value || "").trim() : "",
          groupJid: j ? String(j.value || "").trim() : "",
        });
        if (typeof window.KV_showOkDialog === "function") {
          window.KV_showOkDialog("WhatsApp parent group settings saved.");
        } else {
          alert("WhatsApp settings saved.");
        }
      });
    }
    loadWhatsAppSettingsIntoForm();

    function loadUbiSettingsIntoForm() {
      if (!window.KVUbiFee || typeof KVUbiFee.loadUbiSettings !== "function") return;
      var s = KVUbiFee.loadUbiSettings();
      var u = document.getElementById("settingsUbiUsername");
      var p = document.getElementById("settingsUbiPassword");
      var login = document.getElementById("settingsUbiLoginUrl");
      var rec = document.getElementById("settingsUbiReceiptUrl");
      var def = document.getElementById("settingsUbiDefaulterUrl");
      var ay = document.getElementById("settingsUbiAcademicYear");
      var qtr = document.getElementById("settingsUbiQuarter");
      if (u) u.value = String(s.username || "");
      if (p) p.value = String(s.password || "");
      if (login) {
        login.value = String(s.loginUrl || "");
        if (!login.value && typeof KVUbiFee.loginUrl === "function") login.placeholder = KVUbiFee.loginUrl();
      }
      if (rec) rec.value = String(s.receiptUrl || "");
      if (def) def.value = String(s.defaulterUrl || "");
      if (ay) ay.value = String(s.academicYear || "");
      if (qtr) qtr.value = String(s.quarter || "");
    }

    var saveUbiBtn = document.getElementById("btnSaveUbiSettings");
    if (saveUbiBtn) {
      saveUbiBtn.addEventListener("click", function () {
        if (!window.KVUbiFee || typeof KVUbiFee.saveUbiSettings !== "function") {
          alert("UBI fee helper is not loaded. Refresh the page.");
          return;
        }
        var u = document.getElementById("settingsUbiUsername");
        var p = document.getElementById("settingsUbiPassword");
        var login = document.getElementById("settingsUbiLoginUrl");
        var rec = document.getElementById("settingsUbiReceiptUrl");
        var def = document.getElementById("settingsUbiDefaulterUrl");
        var ay = document.getElementById("settingsUbiAcademicYear");
        var qtr = document.getElementById("settingsUbiQuarter");
        KVUbiFee.saveUbiSettings({
          username: u ? String(u.value || "").trim() : "",
          password: p ? String(p.value || "") : "",
          loginUrl: login ? String(login.value || "").trim() : "",
          receiptUrl: rec ? String(rec.value || "").trim() : "",
          defaulterUrl: def ? String(def.value || "").trim() : "",
          academicYear: ay ? String(ay.value || "").trim() : "",
          quarter: qtr ? String(qtr.value || "").trim() : "",
        });
        if (typeof window.KV_showOkDialog === "function") {
          window.KV_showOkDialog("UBI fee portal settings saved.");
        } else {
          alert("UBI settings saved.");
        }
      });
    }
    loadUbiSettingsIntoForm();

    document.getElementById("btnCheckDriveAuth").addEventListener("click", function () {
      if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
        alert("Configure Google Sheets web app URL first.");
        return;
      }
      KVSheets.sheetsCall("checkDriveAuthorization", {})
        .then(function (res) {
          if (res.authorized) {
            alert("Drive authorization is active.");
          } else {
            alert("Drive authorization is not granted yet. Please authorize in Apps Script once.");
          }
        })
        .catch(function (e) {
          alert("Authorization check failed: " + (e && e.message ? e.message : String(e)));
        });
    });

    document.getElementById("btnBackupDrive").addEventListener("click", function () {
      if (!requireSignedInForDrive()) return;
      if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
        alert("Configure Google Sheets web app URL first.");
        return;
      }
      var snapshot = collectLocalDatasetSnapshot();
      KVSheets.sheetsCall("backupDriveJson", { snapshot: snapshot, source: "manual", userKey: currentUserKey() })
        .then(function (res) {
          setDailyBackupMeta({
            ymd: ymdTodayLocal(),
            fileId: String((res && res.fileId) || ""),
            savedAt: String((res && res.savedAt) || new Date().toISOString()),
          });
          alert("Backup completed to Google Drive.");
        })
        .catch(function (e) {
          alert("Backup failed: " + (e && e.message ? e.message : String(e)));
        });
    });

    document.getElementById("btnRestoreDrive").addEventListener("click", function () {
      if (!requireSignedInForDrive()) return;
      if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
        alert("Configure Google Sheets web app URL first.");
        return;
      }
      if (!confirm("Restore latest Google Drive backup and replace current local dataset?")) return;
      KVSheets.sheetsCall("getLatestDriveBackup", { userKey: currentUserKey() })
        .then(function (res) {
          applyLocalDatasetSnapshot(res.snapshot || {});
          students = loadStudents();
          refreshUI();
          rebuildMarksExamSelectOptions();
          rebuildMarksSubjectSelectForExam("");
          updateMarksPickerUI();
          alert("Backup restored successfully.");
        })
        .catch(function (e) {
          alert("Restore failed: " + (e && e.message ? e.message : String(e)));
        });
    });

    document.getElementById("btnSyncTeacherMarks").addEventListener("click", function () {
      if (!window.KVSheets || typeof KVSheets.getSheetsUrl !== "function" || !KVSheets.getSheetsUrl()) {
        alert("Configure Google Sheets web app URL first.");
        return;
      }
      var localMarks = loadMarksheets();
      fetchAllSheetMarkRecords()
        .then(function (sheetMarks) {
          var merged = mergeMarksByLatest(localMarks, sheetMarks);
          saveMarksheets(merged);
          rebuildMarksExamSelectOptions();
          var mex = document.getElementById("marksExam");
          rebuildMarksSubjectSelectForExam(mex ? mex.value : "");
          updateMarksPickerUI();
          alert("Teacher marks sync completed. Local: " + localMarks.length + ", Sheets: " + sheetMarks.length + ", Final: " + merged.length);
        })
        .catch(function (e) {
          alert("Teacher marks sync failed: " + (e && e.message ? e.message : String(e)));
        });
    });

    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var target = this.getAttribute("data-tab");
        if (_suppressEditResetOnce) _suppressEditResetOnce = false;
        else resetStudentFormMode();
        document.querySelectorAll(".tab").forEach(function (t) {
          t.classList.toggle("active", t === tab);
        });
        document.getElementById("panelList").hidden = target !== "list";
        document.getElementById("panelAdd").hidden = target !== "add";
      });
    });

    document.getElementById("formAdd").addEventListener("submit", function (e) {
      e.preventDefault();
      var wasEditing = _editingStudentId != null;
      clearAddFormErrors();
      var o = emptyRowObject();
      var hasError = false;
      for (var i = 0; i < HEADERS.length; i++) {
        var h = HEADERS[i];
        var inp = document.getElementById("add_" + fieldId(h));
        if (h === "Photo") {
          o[h] = String((window.__addPhotoDataByHeader && window.__addPhotoDataByHeader.Photo) || "").trim();
          continue;
        }
        if (inp) o[h] = String(inp.value || "").trim();
        if (h === "Date of Admission" || h === "Date Of Birth") {
          var dmy = normalizeDateToDmy(o[h]);
          if (o[h] && !dmy) {
            setAddFieldError(h, "Use dd/mm/yyyy or calendar.");
            hasError = true;
          }
          o[h] = dmy || "";
        }
      }
      if (hasError) return;
      if (!String(o["R. No."] || "").trim()) {
        setAddFieldError("R. No.", "R. No. is required.");
        return;
      }
      if (!o["Student Name"]) {
        setAddFieldError("Student Name", "Student Name is required.");
        return;
      }
      if (!normalizeAdmnNo(o["Admission No."])) {
        setAddFieldError("Admission No.", "Admission No. is required.");
        return;
      }
      if (admnNoExists(students, o["Admission No."], null)) {
        setAddFieldError("Admission No.", "Admission No. already exists.");
        return;
      }
      if (o["Mobile No"] && (!isDigitsOnly(o["Mobile No"]) || String(o["Mobile No"]).length !== 10)) {
        setAddFieldError("Mobile No", "Must be exactly 10 digits.");
        return;
      }
      if (o["Email ID"] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(o["Email ID"]))) {
        setAddFieldError("Email ID", "Invalid email format.");
        return;
      }
      if (o["UBI ID"] && !isDigitsOnly(o["UBI ID"])) {
        setAddFieldError("UBI ID", "Numeric only.");
        return;
      }
      if (o["Aadhar Card No"] && (!isDigitsOnly(o["Aadhar Card No"]) || String(o["Aadhar Card No"]).length !== 12)) {
        setAddFieldError("Aadhar Card No", "Must be exactly 12 digits.");
        return;
      }
      if (o["APPAR ID"] && !isDigitsOnly(o["APPAR ID"])) {
        setAddFieldError("APPAR ID", "Numeric only.");
        return;
      }
      if (o.PEN && !isDigitsOnly(o.PEN)) {
        setAddFieldError("PEN", "Numeric only.");
        return;
      }
      if (o["Total Quarterly Fee"] && !/^\d+(\.\d+)?$/.test(String(o["Total Quarterly Fee"]))) {
        setAddFieldError("Total Quarterly Fee", "Numeric only.");
        return;
      }
      if (String(o.Gender || "").trim().toLowerCase() === "boy") o["Single Girl Child"] = "NA";
      if (wasEditing) {
        var eidx = -1;
        for (var ei = 0; ei < students.length; ei++) {
          if (Number(students[ei].id) === Number(_editingStudentId)) {
            eidx = ei;
            break;
          }
        }
        if (eidx < 0) {
          setAddFieldError("Student Name", "Student record not found.");
          return;
        }
        o.id = students[eidx].id;
        o.isActive = students[eidx].isActive !== false;
        o["Admission No."] = students[eidx]["Admission No."];
        students[eidx] = o;
        saveStudents(students);
      } else {
        o.isActive = true;
        o.id = nextId(students);
        students.push(o);
        saveStudents(students);
      }
      var rowForSheet = {};
      for (var si = 0; si < HEADERS.length; si++) {
        var hk = HEADERS[si];
        rowForSheet[hk] = o[hk] != null ? o[hk] : "";
      }
      rowForSheet.Status = "Active";
      if (!wasEditing && window.KVSheets && typeof KVSheets.getSheetsUrl === "function" && KVSheets.getSheetsUrl()) {
        KVSheets.sheetsCall("addStudentToMaster", { row: rowForSheet })
          .then(function () {
            removeStudentAddPending(o["Admission No."]);
            pullSheetsIntoApp({ silent: true });
          })
          .catch(function () {
            upsertStudentAddPending(rowForSheet);
          });
      } else if (!wasEditing) {
        upsertStudentAddPending(rowForSheet);
      }
      if (window.__addPhotoDataByHeader) window.__addPhotoDataByHeader.Photo = "";
      document.getElementById("formAdd").reset();
      syncSingleGirlChildByGender();
      resetStudentFormMode();
      refreshUI();
      alert(wasEditing ? "Student updated." : "Student added.");
      document.querySelector('.tab[data-tab="list"]').click();
    });
  }

  function fieldId(h) {
    return h.replace(/[^a-zA-Z0-9]+/g, "_");
  }

  function buildAddForm() {
    var grid = document.getElementById("addFormGrid");
    grid.innerHTML = "";
    if (!window.__addPhotoDataByHeader) window.__addPhotoDataByHeader = {};
    for (var i = 0; i < HEADERS.length; i++) {
      var h = HEADERS[i];
      var label = document.createElement("label");
      label.className = "field";
      var span = document.createElement("span");
      var cfg = ADD_FORM_FIELD_CONFIG[h] || { type: "text" };
      span.textContent = h + (cfg.required ? " *" : "");
      var input = null;
      if (cfg.type === "yearSelect") {
        input = document.createElement("select");
        input.id = "add_" + fieldId(h);
        var empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "— Select —";
        input.appendChild(empty);
        for (var y = 2010; y <= 2040; y++) {
          var op = document.createElement("option");
          op.value = String(y);
          op.textContent = String(y);
          input.appendChild(op);
        }
      } else if (cfg.type === "dateText") {
        var wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.gap = "6px";
        wrap.style.alignItems = "center";
        wrap.style.position = "relative";
        wrap.style.width = "100%";
        wrap.style.maxWidth = "100%";
        wrap.style.minWidth = "0";
        input = document.createElement("input");
        input.type = "text";
        input.id = "add_" + fieldId(h);
        input.placeholder = "dd/mm/yyyy";
        input.style.flex = "1";
        input.style.minWidth = "0";
        var picker = document.createElement("input");
        picker.type = "date";
        picker.id = "add_" + fieldId(h) + "_picker";
        picker.style.position = "absolute";
        picker.style.inset = "0";
        picker.style.width = "100%";
        picker.style.height = "100%";
        picker.style.opacity = "0";
        picker.style.pointerEvents = "auto";
        picker.style.cursor = "pointer";
        picker.style.zIndex = "2";
        picker.title = "Pick date";
        var pickerBtn = document.createElement("button");
        pickerBtn.type = "button";
        pickerBtn.className = "btn outline sm";
        pickerBtn.textContent = "📅";
        pickerBtn.title = "Pick date";
        pickerBtn.style.position = "relative";
        pickerBtn.style.overflow = "hidden";
        pickerBtn.style.flex = "0 0 auto";
        pickerBtn.style.zIndex = "3";
        pickerBtn.appendChild(picker);
        picker.addEventListener("change", function (e) {
          var tId = String(e.target.id || "").replace(/_picker$/, "");
          var t = document.getElementById(tId);
          if (!t) return;
          var dmy = normalizeDateToDmy(e.target.value);
          if (dmy) t.value = dmy;
        });
        wrap.appendChild(input);
        wrap.appendChild(pickerBtn);
        label.appendChild(span);
        label.appendChild(wrap);
        var errDate = document.createElement("span");
        errDate.className = "card-desc small add-field-error";
        errDate.id = "add_err_" + fieldId(h);
        errDate.style.color = "#b91c1c";
        errDate.textContent = "";
        label.appendChild(errDate);
        grid.appendChild(label);
        continue;
      } else if (cfg.type === "photo") {
        var pWrap = document.createElement("div");
        pWrap.style.display = "flex";
        pWrap.style.flexDirection = "column";
        pWrap.style.gap = "6px";
        input = document.createElement("input");
        input.type = "file";
        input.id = "add_" + fieldId(h);
        input.accept = ".jpg,.jpeg,image/jpeg";
        var pHint = document.createElement("span");
        pHint.className = "card-desc small";
        pHint.id = "add_" + fieldId(h) + "_hint";
        pHint.textContent = "Upload JPG";
        input.addEventListener("change", function (e) {
          var f = e.target.files && e.target.files[0];
          var hintEl = document.getElementById(e.target.id + "_hint");
          if (!f) {
            window.__addPhotoDataByHeader.Photo = "";
            if (hintEl) hintEl.textContent = "Upload JPG";
            return;
          }
          if (!/\.jpe?g$/i.test(f.name) && !/image\/jpeg/i.test(String(f.type || ""))) {
            alert("Photo must be JPG/JPEG.");
            e.target.value = "";
            window.__addPhotoDataByHeader.Photo = "";
            if (hintEl) hintEl.textContent = "Upload JPG";
            return;
          }
          var reader = new FileReader();
          reader.onload = function () {
            window.__addPhotoDataByHeader.Photo = String(reader.result || "");
            if (hintEl) hintEl.textContent = "Selected: " + f.name;
          };
          reader.readAsDataURL(f);
        });
        pWrap.appendChild(input);
        pWrap.appendChild(pHint);
        label.appendChild(span);
        label.appendChild(pWrap);
        var errPhoto = document.createElement("span");
        errPhoto.className = "card-desc small add-field-error";
        errPhoto.id = "add_err_" + fieldId(h);
        errPhoto.style.color = "#b91c1c";
        errPhoto.textContent = "";
        label.appendChild(errPhoto);
        grid.appendChild(label);
        continue;
      } else if (cfg.type === "select") {
        var opts = Array.isArray(cfg.options) ? cfg.options.slice() : commonFieldOptions(h, students);
        input = document.createElement("select");
        input.id = "add_" + fieldId(h);
        var em = document.createElement("option");
        em.value = "";
        em.textContent = "— Select —";
        input.appendChild(em);
        for (var oi = 0; oi < opts.length; oi++) {
          var op2 = document.createElement("option");
          op2.value = String(opts[oi]);
          op2.textContent = String(opts[oi]);
          input.appendChild(op2);
        }
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.id = "add_" + fieldId(h);
        input.placeholder = "—";
      }
      label.appendChild(span);
      label.appendChild(input);
      var err = document.createElement("span");
      err.className = "card-desc small add-field-error";
      err.id = "add_err_" + fieldId(h);
      err.style.color = "#b91c1c";
      err.textContent = "";
      label.appendChild(err);
      grid.appendChild(label);
    }
    var gEl = document.getElementById("add_" + fieldId("Gender"));
    if (gEl) gEl.addEventListener("change", syncSingleGirlChildByGender);
    syncSingleGirlChildByGender();
  }

  function buildHeaderSelects() {
    var sec1 = document.getElementById("sec1Header");
    var sec2 = document.getElementById("sec2Header");
    [sec1, sec2].forEach(function (sel) {
      sel.innerHTML = '<option value="">— Choose column —</option>';
      for (var i = 0; i < HEADERS.length; i++) {
        var o = document.createElement("option");
        o.value = String(i);
        o.textContent = HEADERS[i];
        sel.appendChild(o);
      }
    });
  }

  function init() {
    if (String(location.protocol) === "file:") {
      fetch("http://127.0.0.1:3000/api/health", { cache: "no-store" })
        .then(function (r) {
          if (r.ok) location.replace("http://localhost:3000/");
        })
        .catch(function () {
          setTimeout(function () {
            if (String(location.protocol) === "file:") {
              alert(
                "Vaayu is opened as a file (file://). SAMAGAM auto-login will NOT work.\n\n" +
                  "1. Double-click start-web.bat in browser-app\n" +
                  "2. Open http://localhost:3000 in the browser\n" +
                  "3. Do not open index.html directly from the folder"
              );
            }
          }, 800);
        });
    }
    applyKvBranding();
    setCurrentUserKey(preferredAccountKey(currentAccountInfo()));
    students = loadStudents();
    buildHeaderSelects();
    buildAddForm();
    wireEvents();
    updateAccountUiLine();
    refreshUI();
    rebuildMarksExamSelectOptions();
    rebuildMarksSubjectSelectForExam("");
    updateMarksEntryToggleRowState();
    wireSheetsReconnectSync();
    startForegroundSheetPolling();
    pullSheetsIntoApp({ silent: true }).finally(function () {
      if (typeof window.__prefetchSettingsTimetableEditor === "function") {
        window.__prefetchSettingsTimetableEditor();
      }
      tryAutoDriveBackupDaily();
    });
    try {
      if (typeof window.__kvPrefetchTimetables === "function") window.__kvPrefetchTimetables();
    } catch (_e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
