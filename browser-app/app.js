(function () {
  "use strict";

  var STORAGE_KEY = "kv_studentapp_v1";
  var MARKS_STORAGE_KEY = "kv_marksheets_v1";

  var HEADERS = [
    "R.NO.",
    "Adm Year",
    "Admn No",
    "DOA",
    "Student Name",
    "house",
    "Date Of Birth",
    "Gender",
    "Category",
    "Admn Category",
    "Mothers Name",
    "Mobile No",
    "M OCCUPATION",
    "Fathers Name",
    "F OCCUPATION",
    "ADDRESS",
    "ADMISSION CLASS",
    "QUOTA",
    "BG",
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
    "REMARK",
  ];

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
    var admnCatKey = "Admn Category";
    var houseKey = "house";
    var genderKey = "Gender";
    var minorityKey = "Minority";
    var sgcKey = "Single Girl Child";
    var rteKey = "RTE";
    var names = [];
    for (var i = 0; i < students.length; i++) {
      var s = students[i];
      var isMatch = false;
      if (category === "QUOTA") {
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
    if (String(s["R.NO."] != null ? s["R.NO."] : "").trim() !== "") return true;
    if (String(s["Student Name"] != null ? s["Student Name"] : "").trim() !== "") return true;
    return false;
  }

  function studentsForMarksEntry(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (isDataStudentRow(list[i])) out.push(list[i]);
    }
    out.sort(function (a, b) {
      var sa = String(a["R.NO."] != null ? a["R.NO."] : "").trim();
      var sb = String(b["R.NO."] != null ? b["R.NO."] : "").trim();
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
    document.title = school + " — Student dashboard";
    var modalSchool = document.getElementById("modalSchoolName");
    if (modalSchool) modalSchool.textContent = school;
  }

  function normalizeMarksInput(raw, maxMarks) {
    var s = String(raw).trim();
    if (!s) return { error: "Enter marks or AB for every student." };
    if (/^a(b)?$/i.test(s)) return { ok: true, isAb: true, display: "AB" };
    var n = parseFloat(s.replace(/,/g, "."));
    if (isNaN(n)) return { error: "Invalid marks — use a number or AB." };
    if (n < 0) return { error: "Marks cannot be negative." };
    if (n > maxMarks) return { error: "Marks cannot exceed maximum marks (" + maxMarks + ")." };
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
    var s = String(raw).trim();
    if (!s) return { level: "empty" };
    if (/^a(b)?$/i.test(s)) return { level: "ok" };
    if (/[a-z]/i.test(s)) return { level: "bad", message: "Use digits or AB only." };
    if (!/^\d*\.?\d*$/.test(s)) return { level: "bad", message: "Invalid marks." };
    var n = parseFloat(s.replace(/,/g, "."));
    if (isNaN(n)) return { level: "partial" };
    if (n < 0) return { level: "bad", message: "Cannot be negative." };
    if (n > maxMarks) return { level: "bad", message: "Cannot exceed " + maxMarks + "." };
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
    return false;
  }

  function marksCellNavigationWarningMessage(inp) {
    var maxN = getMarksMaxNumber();
    var v = validateMarksRealtime(inp.value, maxN);
    if (v.message) return v.message;
    return "Fix this cell before moving to the next.";
  }

  /** Roll number (R.NO.) stored as marks entry studentId and in Sheets column StudentId. */
  function marksStudentPersistId(st) {
    return String(st["R.NO."] != null ? st["R.NO."] : "").trim();
  }

  /** data-student-id value: roll when present, else stable internal key (empty rolls). */
  function marksStudentDomKey(st) {
    var r = marksStudentPersistId(st);
    return r || "__nir_" + String(st.id);
  }

  function findMarksInputForStudent(st) {
    var key = marksStudentDomKey(st);
    var inputs = document.querySelectorAll("#marksStudentTbody input.marks-cell-input");
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].getAttribute("data-student-id") === key) return inputs[i];
    }
    return null;
  }

  /** Validates form + marks; returns { meta, rows, record } or null. */
  function tryBuildMarksSlipRecord() {
    var maxStr = document.getElementById("marksMax").value.trim();
    var maxMarks = parseFloat(maxStr.replace(/,/g, "."));
    if (!maxStr || isNaN(maxMarks) || maxMarks <= 0) {
      alert("Please enter valid maximum marks (a positive number).");
      return null;
    }
    revalidateAllMarksInputs();
    if (document.querySelector("#marksStudentTbody input.marks-cell-input.marks-invalid")) {
      alert("Fix the marks shown in red before continuing.");
      return null;
    }
    var teacher = document.getElementById("marksTeacher").value.trim();
    if (!teacher) {
      alert("Please enter the subject teacher's name.");
      return null;
    }
    var examDate = document.getElementById("marksExamDate").value;
    if (!examDate) {
      alert("Please select the date of examination.");
      return null;
    }
    var subject = document.getElementById("marksSubject").value;
    var examName = document.getElementById("marksExam").value;
    if (!subject || !examName) {
      alert("Please select subject and examination.");
      return null;
    }
    var list = studentsForMarksEntry(students);
    if (!list.length) {
      alert("No students in the database.");
      return null;
    }
    var rows = [];
    var entries = [];
    for (var mi = 0; mi < list.length; mi++) {
      var st = list[mi];
      var inp = findMarksInputForStudent(st);
      if (!inp) {
        alert("Could not read marks for all students. Refresh the page.");
        return null;
      }
      normalizeAbsentOnBlur(inp);
      var v = normalizeMarksInput(inp.value, maxMarks);
      if (v.error) {
        alert(
          v.error + " (student: " + (String(st["Student Name"] || "").trim() || "—") + ")."
        );
        return null;
      }
      var roll = String(st["R.NO."] != null ? st["R.NO."] : "").trim() || "—";
      var rollId = marksStudentPersistId(st);
      var nm = String(st["Student Name"] || "").trim() || "—";
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
  var MASTER_SHEETS_POLL_MS = 2 * 60 * 1000;
  var _masterVisibilityTimer = null;

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
        students = list;
        saveStudents(students);
        return true;
      })
      .catch(function (e) {
        if (opts && opts.silent) console.warn("Master sync:", e && e.message ? e.message : e);
        else alert(e.message || String(e));
        return false;
      })
      .finally(function () {
        _studentsSyncPromise = null;
      });
    return _studentsSyncPromise;
  }

  function onMasterVisibilityResume() {
    if (document.visibilityState !== "visible") return;
    if (_masterVisibilityTimer) clearTimeout(_masterVisibilityTimer);
    _masterVisibilityTimer = setTimeout(function () {
      _masterVisibilityTimer = null;
      Promise.all([
        syncStudentsFromSheets({ silent: true }),
        syncMarkSlipsListFromSheets({ silent: true }),
      ]).finally(function () {
        refreshUI();
        rebuildMarksExamSelectOptions();
        var mex = document.getElementById("marksExam");
        rebuildMarksSubjectSelectForExam(mex ? mex.value : "");
      });
    }, 600);
  }

  function startMasterAutoSyncTimers() {
    setInterval(function () {
      syncStudentsFromSheets({ silent: true }).finally(function () {
        refreshUI();
      });
    }, MASTER_SHEETS_POLL_MS);
    document.addEventListener("visibilitychange", onMasterVisibilityResume);
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
    if (loc && (!sh || locT >= shT)) {
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

  function clearMarksEntryFormExceptExamSubject() {
    var mx = document.getElementById("marksMax");
    var te = document.getElementById("marksTeacher");
    var dt = document.getElementById("marksExamDate");
    if (mx) mx.value = "";
    if (te) te.value = "";
    if (dt) dt.value = "";
    editingMarksSlipId = null;
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
    if (!exEl || !subEl) return;
    var ex = exEl.value.trim();
    var sub = subEl.value.trim();
    if (!ex || !sub) {
      if (quickEl) quickEl.hidden = true;
      if (dynamicArea) dynamicArea.hidden = true;
      if (statusEl) statusEl.textContent = "";
      if (entryEl) entryEl.hidden = true;
      _resolvedMarksSlip = null;
      return;
    }
    if (_marksPickerEditing) {
      if (quickEl) quickEl.hidden = true;
      if (dynamicArea) dynamicArea.hidden = false;
      if (entryEl) entryEl.hidden = false;
      if (statusEl) statusEl.textContent = "Editing marks — Submit to save, or Cancel.";
      return;
    }
    var res = resolveSlipForExamSubject(ex, sub);
    _resolvedMarksSlip = res;
    if (res.available) {
      if (quickEl) quickEl.hidden = false;
      if (dynamicArea) dynamicArea.hidden = true;
      if (entryEl) entryEl.hidden = true;
      if (summaryEl) summaryEl.textContent = buildMarksExistingSummaryLine(res);
    } else {
      if (quickEl) quickEl.hidden = true;
      if (dynamicArea) dynamicArea.hidden = false;
      if (entryEl) entryEl.hidden = false;
      if (statusEl)
        statusEl.textContent = "No marks on file yet — enter details below and Submit.";
      clearMarksEntryFormExceptExamSubject();
      renderMarksStudentTable();
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
    document.getElementById("marksMax").value = String(record.maxMarks != null ? record.maxMarks : "");
    document.getElementById("marksTeacher").value = String(record.teacherName || "");
    var ed = String(record.examDate || "");
    document.getElementById("marksExamDate").value = ed.length >= 10 ? ed.slice(0, 10) : ed;
    setMarksSelectOrAdd("marksExam", record.examName || "");
    rebuildMarksSubjectSelectForExam(record.examName || "");
    setMarksSelectOrAdd("marksSubject", record.subject || "");
    editingMarksSlipId = record.id;
    var cancelBtn = document.getElementById("btnMarksCancelEdit");
    if (cancelBtn) cancelBtn.hidden = false;
    renderMarksStudentTable();
    var list = studentsForMarksEntry(students);
    for (var li = 0; li < list.length; li++) {
      var st = list[li];
      var inp = findMarksInputForStudent(st);
      if (!inp) continue;
      var en = findMarksEntryForStudent(record, st);
      if (!en) continue;
      var mk = en.marks;
      var ms = String(mk != null ? mk : "").trim();
      if (ms === "" || /^ab$/i.test(ms)) inp.value = /^ab$/i.test(ms) ? "AB" : "";
      else if (typeof mk === "number" && mk % 1 === 0) inp.value = String(mk);
      else inp.value = ms;
    }
    revalidateAllMarksInputs();
    _marksPickerEditing = true;
    updateMarksPickerUI();
  }

  function clearMarksEditMode() {
    editingMarksSlipId = null;
    _marksPickerEditing = false;
    var btn = document.getElementById("btnMarksCancelEdit");
    if (btn) btn.hidden = true;
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
    return genderWiseSummary(students, "Admn Category", "Admn Category");
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
      if (!String(s["R.NO."] ?? s["Student Name"] ?? "").trim()) continue;
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
    var houseIdx = HEADERS.indexOf("house");
    var admnIdx = HEADERS.indexOf("Admn Category");
    var genderIdx = HEADERS.indexOf("Gender");
    var minorityIdx = HEADERS.indexOf("Minority");
    var catIdx = HEADERS.indexOf("Category");
    function uniq(idx) {
      if (idx < 0) return [];
      return getUniqueValues(students, idx);
    }
    if (category === "QUOTA") return ["SGC", "RTE"];
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

  function refreshUI() {
    students = loadStudents();
    fillNameSelects();
    fillManageTable();
    updateDashSub();
    updateSec2Sub();
    renderColCheckboxes();
    var rc = document.getElementById("recordCount");
    if (rc) rc.textContent = String(students.length);
    var hc = document.getElementById("homeRecordCount");
    if (hc) hc.textContent = String(students.length);
    renderMarksStudentTable();
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
      var roll = String(st["R.NO."] != null ? st["R.NO."] : "").trim() || "—";
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
      inp.addEventListener("input", function () {
        applyMarksCellValidation(this);
      });
      inp.addEventListener("blur", function () {
        normalizeAbsentOnBlur(this);
        applyMarksCellValidation(this);
      });
    }
    revalidateAllMarksInputs();
  }

  function fillNameSelects() {
    var names = studentNamesSorted(students);
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

  function updateDashSub() {
    var cat = document.getElementById("dashCat").value;
    var opts = buildSubOptions(cat, students);
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

  function updateSec2Sub() {
    var col = document.getElementById("sec2Header").value;
    var sub = document.getElementById("sec2SubValue");
    if (!col) {
      sub.innerHTML = '<option value="">— Select header first —</option>';
      return;
    }
    var vals = getUniqueValues(students, parseInt(col, 10));
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

  function openModal(title, data) {
    document.getElementById("modalTitle").textContent = title;
    var thead = document.querySelector("#modalTable thead tr");
    var tbody = document.querySelector("#modalTable tbody");
    thead.innerHTML = "";
    tbody.innerHTML = "";
    if (!data || !data.length) return;
    var padded = window.KVReports ? window.KVReports.padRectangular(data) : data;
    var hdr = padded[0];
    for (var h = 0; h < hdr.length; h++) {
      var th = document.createElement("th");
      th.textContent = hdr[h];
      thead.appendChild(th);
    }
    for (var r = 1; r < padded.length; r++) {
      var tr = document.createElement("tr");
      for (var c = 0; c < padded[r].length; c++) {
        var td = document.createElement("td");
        var cell = padded[r][c];
        td.textContent = cell === "" ? "—" : String(cell);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    document.getElementById("modalBackdrop").hidden = false;
    window._modalData = padded;
    window._modalTitle = title;
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
        escapeHtml(String(s["R.NO."] != null ? s["R.NO."] : "").trim() || "—") +
        "</td><td>" +
        escapeHtml(s["Student Name"] || "—") +
        "</td><td>" +
        escapeHtml(s["Admn No"] || "—") +
        "</td><td>" +
        escapeHtml(s.house || "—") +
        '</td><td><button type="button" class="btn danger sm del-btn" data-id="' +
        s.id +
        '">Delete</button></td>';
      tbody.appendChild(tr);
    }
    var dels = tbody.querySelectorAll(".del-btn");
    for (var j = 0; j < dels.length; j++) {
      dels[j].addEventListener("click", function () {
        var id = parseInt(this.getAttribute("data-id"), 10);
        if (!confirm("Delete this student? This cannot be undone.")) return;
        students = students.filter(function (x) {
          return x.id !== id;
        });
        saveStudents(students);
        refreshUI();
      });
    }
  }

  function escapeHtml(t) {
    var d = document.createElement("div");
    d.textContent = t;
    return d.innerHTML;
  }

  function showAppView(navId) {
    document.querySelectorAll(".app-view").forEach(function (el) {
      el.hidden = el.getAttribute("data-view") !== navId;
    });
    document.querySelectorAll(".sidebar-nav .nav-item[data-nav]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-nav") === navId);
    });
    if (navId === "marks") {
      syncMarkSlipsListFromSheets({ silent: true }).finally(function () {
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
        showAppView(this.getAttribute("data-nav"));
      });
    });
  }

  function wireQuerySubtabs() {
    var tabs = document.querySelectorAll(".query-tab[data-query-tab]");
    if (!tabs.length) return;
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
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

  function wireEvents() {
    wireAppNavigation();
    wireQuerySubtabs();

    var marksMaxEl = document.getElementById("marksMax");
    if (marksMaxEl) {
      marksMaxEl.addEventListener("input", function () {
        revalidateAllMarksInputs();
      });
      marksMaxEl.addEventListener("change", function () {
        revalidateAllMarksInputs();
      });
    }

    var marksExamEl = document.getElementById("marksExam");
    if (marksExamEl) {
      marksExamEl.addEventListener("change", function () {
        rebuildMarksSubjectSelectForExam(this.value);
        _marksPickerEditing = false;
        editingMarksSlipId = null;
        var cb0 = document.getElementById("btnMarksCancelEdit");
        if (cb0) cb0.hidden = true;
        updateMarksPickerUI();
      });
    }
    var marksSubEl = document.getElementById("marksSubject");
    if (marksSubEl) {
      marksSubEl.addEventListener("change", function () {
        _marksPickerEditing = false;
        editingMarksSlipId = null;
        var cb1 = document.getElementById("btnMarksCancelEdit");
        if (cb1) cb1.hidden = true;
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
        KVSheets.sheetsCall("getMarkSlip", { slipId: res.slipId })
          .then(function (data) {
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
        KVSheets.sheetsCall("getMarkSlip", { slipId: res.slipId })
          .then(function (data) {
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
            alert(marksCellNavigationWarningMessage(t));
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
            alert(marksCellNavigationWarningMessage(t));
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
      var cat = document.getElementById("dashCat").value;
      var sub = document.getElementById("dashSub").value;
      var r = filteredStudentNames(students, cat, sub);
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
      var name = document.getElementById("sec1Student").value;
      var col = document.getElementById("sec1Header").value;
      var box = document.getElementById("detailDisplay");
      if (!name || col === "") {
        box.innerHTML = '<span class="muted">Pick student and column</span>';
        return;
      }
      box.textContent = getSingleValue(students, name, parseInt(col, 10));
    }

    document.getElementById("sec2Header").addEventListener("change", updateSec2Sub);
    document.getElementById("btnListGen").addEventListener("click", function () {
      var col = document.getElementById("sec2Header").value;
      var sub = document.getElementById("sec2SubValue").value;
      var sel = document.getElementById("sec2Header");
      var headerName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "";
      if (!col || !sub) {
        alert("Please select both header and value.");
        return;
      }
      var matches = filteredListByColumn(students, parseInt(col, 10), sub);
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
      var name = document.getElementById("profileStudent").value;
      if (!name) {
        alert("Please select a student.");
        return;
      }
      var rows = studentProfile(students, name);
      if (!rows) {
        alert("Student not found.");
        return;
      }
      var data = [["Property", "Information"]].concat(rows);
      openModal("Student Profile: " + name, data);
    });

    document.getElementById("btnSumCat").addEventListener("click", function () {
      openModal("Category Enrollment Summary", categoryEnrollmentSummary(students));
    });
    document.getElementById("btnSumAdm").addEventListener("click", function () {
      openModal("Admission Category Enrollment Summary", admissionCategorySummary(students));
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
      var idx = getSelectedIndices();
      if (!idx.length) {
        alert("Select at least one column.");
        return;
      }
      openModal("Custom Student Report", customReportRows(students, idx));
    });

    document.getElementById("btnExportExcel").addEventListener("click", function () {
      if (!window.KVReports) {
        alert("Export scripts missing. Refresh the page.");
        return;
      }
      var idx = getSelectedIndices();
      if (!idx.length) {
        alert("Select columns.");
        return;
      }
      var data = customReportRows(students, idx);
      window.KVReports.downloadExcel("Custom Student Report", data);
    });
    document.getElementById("btnExportPdf").addEventListener("click", function () {
      if (!window.KVReports) {
        alert("Export scripts missing. Refresh the page.");
        return;
      }
      var idx = getSelectedIndices();
      if (!idx.length) {
        alert("Select columns.");
        return;
      }
      var data = customReportRows(students, idx);
      window.KVReports.downloadPdf("Custom Student Report", data);
    });

    document.getElementById("btnMarksSubmit").addEventListener("click", function () {
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
        var cbtn = document.getElementById("btnMarksCancelEdit");
        if (cbtn) cbtn.hidden = true;
      } else {
        allMs.push(data.record);
      }
      saveMarksheets(allMs);
      _marksPickerEditing = false;
      renderMarksStudentTable();
      var sheetP = Promise.resolve();
      if (window.KVSheets && typeof KVSheets.getSheetsUrl === "function" && KVSheets.getSheetsUrl()) {
        var sheetAction = wasEditing ? "replaceMarkSlip" : "saveMarkSlip";
        sheetP = KVSheets.sheetsCall(sheetAction, { record: data.record }).catch(function (e) {
          alert("Saved locally, but Google Sheets sync failed: " + (e.message || String(e)));
        });
      }
      sheetP.finally(function () {
        syncMarkSlipsListFromSheets({ silent: true }).finally(function () {
          rebuildMarksExamSelectOptions();
          var mex = document.getElementById("marksExam");
          rebuildMarksSubjectSelectForExam(mex ? mex.value : "");
          updateMarksPickerUI();
        });
      });
      alert(
        wasEditing
          ? "Marks slip updated (replaced in storage" +
              (window.KVSheets && KVSheets.getSheetsUrl() ? " and Google Sheets" : "") +
              ")."
          : "Marks slip saved on this device (browser storage)."
      );
    });

    document.getElementById("btnMarksCancelEdit").addEventListener("click", function () {
      clearMarksEditMode();
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
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var recs = parseCSV(String(reader.result));
          if (!recs.length) {
            alert("No rows found in CSV.");
            return;
          }
          if (!confirm("Replace all current data with this file? (" + recs.length + " rows)")) return;
          var list = [];
          var nid = 1;
          for (var i = 0; i < recs.length; i++) {
            var o = rowFromImport(recs[i]);
            o.id = nid++;
            list.push(o);
          }
          students = list;
          saveStudents(students);
          refreshUI();
          alert("Imported " + students.length + " students.");
        } catch (err) {
          alert("Import failed: " + err.message);
        }
        e.target.value = "";
      };
      reader.readAsText(f, "UTF-8");
    });

    document.getElementById("btnExportFull").addEventListener("click", function () {
      if (!window.KVReports) {
        alert("Export scripts missing. Refresh the page.");
        return;
      }
      var idx = HEADERS.map(function (_, i) {
        return i;
      });
      var data = customReportRows(students, idx);
      window.KVReports.downloadExcel("Full student export", data);
    });

    document.getElementById("btnClearData").addEventListener("click", function () {
      if (!confirm("Clear all data from this browser?")) return;
      localStorage.removeItem(STORAGE_KEY);
      students = [];
      refreshUI();
    });

    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var target = this.getAttribute("data-tab");
        document.querySelectorAll(".tab").forEach(function (t) {
          t.classList.toggle("active", t === tab);
        });
        document.getElementById("panelList").hidden = target !== "list";
        document.getElementById("panelAdd").hidden = target !== "add";
      });
    });

    document.getElementById("formAdd").addEventListener("submit", function (e) {
      e.preventDefault();
      var o = emptyRowObject();
      for (var i = 0; i < HEADERS.length; i++) {
        var h = HEADERS[i];
        var inp = document.getElementById("add_" + fieldId(h));
        if (inp) o[h] = inp.value.trim();
      }
      if (!o["Student Name"]) {
        alert("Student Name is required.");
        return;
      }
      o.id = nextId(students);
      students.push(o);
      saveStudents(students);
      document.getElementById("formAdd").reset();
      refreshUI();
      alert("Student added.");
      document.querySelector('.tab[data-tab="list"]').click();
    });
  }

  function fieldId(h) {
    return h.replace(/[^a-zA-Z0-9]+/g, "_");
  }

  function buildAddForm() {
    var grid = document.getElementById("addFormGrid");
    grid.innerHTML = "";
    for (var i = 0; i < HEADERS.length; i++) {
      var h = HEADERS[i];
      var label = document.createElement("label");
      label.className = "field";
      var span = document.createElement("span");
      span.textContent = h;
      var input = document.createElement("input");
      input.type = "text";
      input.id = "add_" + fieldId(h);
      input.placeholder = "—";
      label.appendChild(span);
      label.appendChild(input);
      grid.appendChild(label);
    }
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
    applyKvBranding();
    students = loadStudents();
    buildHeaderSelects();
    buildAddForm();
    wireEvents();
    refreshUI();
    rebuildMarksExamSelectOptions();
    rebuildMarksSubjectSelectForExam("");
    startMasterAutoSyncTimers();
    Promise.all([
      syncStudentsFromSheets({ silent: true }),
      syncMarkSlipsListFromSheets({ silent: true }),
    ]).finally(function () {
      refreshUI();
      rebuildMarksExamSelectOptions();
      var mex = document.getElementById("marksExam");
      rebuildMarksSubjectSelectForExam(mex ? mex.value : "");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
