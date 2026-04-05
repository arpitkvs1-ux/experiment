/**
 * KV Student Dashboard — Google Sheets backend
 *
 * SETUP (one-time):
 * 1. Create a Google Sheet with two tabs named exactly: "Master" and "Marks"
 * 2. In Master row 1, paste the same column headers as your CSV (e.g. R.NO., Student Name, house, …)
 * 3. Extensions → Apps Script → paste this file → set SPREADSHEET_ID below to your workbook ID (from the URL)
 * 4. Deploy → New deployment → Type: Web app → Execute as: Me → Who has access: Anyone
 * 5. Add TeacherMarks.html + TeacherMarksPdfInclude.html and the include() function below. Set KV_SHEETS_WEB_APP_URL.
 *    Teachers: .../exec?teacher=1 (pick exam + subject on page; redeploy after changes).
 *
 * Marks tab: created automatically with headers:
 * SlipId | Exam | Subject | ExamDate | MaxMarks | Teacher | RollNo | StudentName | Marks | SavedAt | StudentId (= roll / R.NO.)
 */
var CONFIG = {
  /** Required for Web App calls (getActiveSpreadsheet() is empty over HTTP). */
  SPREADSHEET_ID: "PASTE_YOUR_SPREADSHEET_ID_HERE",
  MASTER_TAB: "Master",
  MARKS_TAB: "Marks",
  /** Shown on the teacher marks page and PDF slips — match browser-app/sheets-webapp-config.js */
  SCHOOL_NAME: "KV NIT Agartala",
  /** e.g. "Class VII"; leave "" to show school name only */
  SCHOOL_CLASS: "Class VII",
};

var MARKS_HEADERS = [
  "SlipId",
  "Exam",
  "Subject",
  "ExamDate",
  "MaxMarks",
  "Teacher",
  "RollNo",
  "StudentName",
  "Marks",
  "SavedAt",
  "StudentId",
];

function getSpreadsheet_() {
  var id = CONFIG.SPREADSHEET_ID;
  if (id && id.indexOf("PASTE_") !== 0) {
    return SpreadsheetApp.openById(id);
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error("Set CONFIG.SPREADSHEET_ID to your workbook ID (from the Google Sheet URL).");
  }
  return active;
}

function getMasterSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(CONFIG.MASTER_TAB);
  if (!sh) {
    throw new Error('Missing tab "' + CONFIG.MASTER_TAB + '". Create it with row 1 = student column headers.');
  }
  return sh;
}

function getMarksSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(CONFIG.MARKS_TAB);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.MARKS_TAB);
  }
  return sh;
}

function ensureMarksHeaders_(sh) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, MARKS_HEADERS.length).setValues([MARKS_HEADERS]);
    return;
  }
  var first = sh.getRange(1, 1, 1, 1).getValue();
  if (first === "" || first === null) {
    sh.getRange(1, 1, 1, MARKS_HEADERS.length).setValues([MARKS_HEADERS]);
  }
}

function handleRequest_(body) {
  var action = body.action;
  var payload = body.payload || {};

  if (action === "getStudents") {
    return getStudents_(payload);
  }
  if (action === "saveMarkSlip") {
    return saveMarkSlip_(payload);
  }
  if (action === "replaceMarkSlip") {
    return replaceMarkSlip_(payload);
  }
  if (action === "listMarkSlips") {
    return listMarkSlips_(payload);
  }
  if (action === "getMarkSlip") {
    return getMarkSlip_(payload);
  }

  throw new Error("Unknown action: " + action);
}

function getStudents_() {
  var sh = getMasterSheet_();
  var data = sh.getDataRange().getValues();
  if (data.length < 2) {
    return { ok: true, students: [] };
  }
  var headers = data[0].map(function (h) {
    return String(h != null ? h : "").trim();
  });
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var empty = true;
    for (var c = 0; c < row.length; c++) {
      if (String(row[c] != null ? row[c] : "").trim()) {
        empty = false;
        break;
      }
    }
    if (empty) continue;
    var o = { id: r + 1 };
    for (var hi = 0; hi < headers.length; hi++) {
      var key = headers[hi];
      if (!key) continue;
      var v = row[hi];
      o[key] = v != null ? String(v).trim() : "";
    }
    out.push(o);
  }
  return { ok: true, students: out };
}

function saveMarkSlip_(payload) {
  var record = payload.record;
  if (!record || !record.entries || !record.entries.length) {
    throw new Error("Invalid mark slip payload.");
  }
  var sh = getMarksSheet_();
  ensureMarksHeaders_(sh);
  var slipId = String(record.id);
  var examDate = String(record.examDate || "");
  var savedAt = String(record.savedAt || new Date().toISOString());
  var rows = [];
  for (var i = 0; i < record.entries.length; i++) {
    var e = record.entries[i];
    rows.push([
      slipId,
      String(record.examName || ""),
      String(record.subject || ""),
      examDate,
      record.maxMarks,
      String(record.teacherName || ""),
      String(e.rollNo != null ? e.rollNo : ""),
      String(e.studentName != null ? e.studentName : ""),
      String(e.marks != null ? e.marks : ""),
      savedAt,
      String(e.studentId != null ? e.studentId : ""),
    ]);
  }
  var start = sh.getLastRow() + 1;
  var numCols = MARKS_HEADERS.length;
  // Use offset(numRows, numCols) so range size exactly matches rows (avoids off-by-one vs corner getRange).
  sh.getRange(start, 1)
    .offset(0, 0, rows.length, numCols)
    .setValues(rows);
  return { ok: true, slipId: slipId };
}

/** Remove every Marks row with this SlipId, then append the new rows (same id = edit / resubmit). */
function deleteRowsWithSlipId_(sh, slipId) {
  var id = String(slipId || "").trim();
  if (!id) return;
  var last = sh.getLastRow();
  if (last < 2) return;
  for (var r = last; r >= 2; r--) {
    if (String(sh.getRange(r, 1).getValue()).trim() === id) {
      sh.deleteRow(r);
    }
  }
}

function replaceMarkSlip_(payload) {
  var record = payload.record;
  if (!record || !record.entries || !record.entries.length) {
    throw new Error("Invalid mark slip payload.");
  }
  var sh = getMarksSheet_();
  ensureMarksHeaders_(sh);
  deleteRowsWithSlipId_(sh, String(record.id));
  return saveMarkSlip_(payload);
}

function listMarkSlips_() {
  var sh = getMarksSheet_();
  ensureMarksHeaders_(sh);
  if (sh.getLastRow() < 2) {
    return { ok: true, slips: [] };
  }
  var data = sh.getRange(2, 1, sh.getLastRow(), MARKS_HEADERS.length).getValues();
  var map = {};
  for (var i = 0; i < data.length; i++) {
    var slipId = String(data[i][0] != null ? data[i][0] : "").trim();
    if (!slipId) continue;
    if (!map[slipId]) {
      map[slipId] = {
        slipId: slipId,
        exam: String(data[i][1] != null ? data[i][1] : "").trim(),
        subject: String(data[i][2] != null ? data[i][2] : "").trim(),
        examDate: String(data[i][3] != null ? data[i][3] : "").trim(),
        maxMarks: data[i][4],
        teacher: String(data[i][5] != null ? data[i][5] : "").trim(),
        savedAt: String(data[i][9] != null ? data[i][9] : "").trim(),
      };
    }
  }
  var list = [];
  for (var k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) list.push(map[k]);
  }
  list.sort(function (a, b) {
    return String(b.savedAt).localeCompare(String(a.savedAt));
  });
  return { ok: true, slips: list };
}

function getMarkSlip_(payload) {
  var slipId = String(payload.slipId || "").trim();
  if (!slipId) throw new Error("Missing slipId.");
  var sh = getMarksSheet_();
  ensureMarksHeaders_(sh);
  if (sh.getLastRow() < 2) {
    throw new Error("No marks in sheet.");
  }
  var data = sh.getRange(2, 1, sh.getLastRow(), MARKS_HEADERS.length).getValues();
  var meta = null;
  var entries = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0] != null ? data[i][0] : "").trim() !== slipId) continue;
    if (!meta) {
      meta = {
        examName: String(data[i][1] != null ? data[i][1] : ""),
        subject: String(data[i][2] != null ? data[i][2] : ""),
        examDate: String(data[i][3] != null ? data[i][3] : ""),
        maxMarks: Number(data[i][4]),
        teacherName: String(data[i][5] != null ? data[i][5] : ""),
        savedAt: String(data[i][9] != null ? data[i][9] : ""),
      };
    }
    entries.push({
      rollNo: String(data[i][6] != null ? data[i][6] : ""),
      studentName: String(data[i][7] != null ? data[i][7] : ""),
      marks: data[i][8],
      studentId: data[i][10],
    });
  }
  if (!meta || !entries.length) {
    throw new Error("Slip not found: " + slipId);
  }
  return { ok: true, meta: meta, entries: entries };
}

/** Inline partial HTML (e.g. TeacherMarksPdfInclude) into a template. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Called from TeacherMarks.html via google.script.run (same deployment as POST API). */
function teacherApi(action, payload) {
  var p = payload;
  if (p == null) p = {};
  return handleRequest_({ action: String(action), payload: p });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var result = handleRequest_(body);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err.message || err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  e = e || {};
  var p = e.parameter || {};
  var baseUrl = "";
  try {
    baseUrl = ScriptApp.getService().getUrl();
  } catch (err0) {
    baseUrl = "";
  }
  if (String(p.teacher || "").trim() === "1") {
    var t = HtmlService.createTemplateFromFile("TeacherMarks");
    var sn = String(CONFIG.SCHOOL_NAME || "").trim() || "School name";
    t.schoolName = sn;
    t.schoolClass = String(CONFIG.SCHOOL_CLASS != null ? CONFIG.SCHOOL_CLASS : "").trim();
    return t
      .evaluate()
      .setTitle(sn + " — Teacher marks")
      .addMetaTag("viewport", "width=device-width, initial-scale=1")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  var exam = String(p.exam || "").trim();
  var subject = String(p.subject || "").trim();
  if (exam && subject && baseUrl) {
    var sep = baseUrl.indexOf("?") >= 0 ? "&" : "?";
    var nu = baseUrl + sep + "teacher=1";
    return HtmlService.createHtmlOutput(
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Redirect</title></head><body><script>location.replace(" +
        JSON.stringify(nu) +
        ");</script><p>Redirecting to teacher marks page…</p></body></html>"
    );
  }
  return ContentService.createTextOutput(
    JSON.stringify({
      ok: true,
      message:
        "KV Sheets sync endpoint. POST JSON { action, payload }. Teacher marks page: GET ?teacher=1",
    })
  ).setMimeType(ContentService.MimeType.JSON);
}
