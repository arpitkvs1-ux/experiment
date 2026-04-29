/**
 * KV Student Dashboard — Google Sheets backend
 *
 * SETUP (one-time):
 * 1. Create a Google Sheet with tabs named exactly: "Master", "Marks", and "Attendance"
 * 2. In Master row 1, paste the same column headers as your CSV (e.g. R.NO., Student Name, house, …)
 * 3. Extensions → Apps Script → paste this file → set SPREADSHEET_ID below to your workbook ID (from the URL)
 * 4. Deploy → New deployment → Type: Web app → Execute as: Me → Who has access: Anyone
 * 5. Add TeacherMarks.html + TeacherMarksPdfInclude.html and the include() function below. Set KV_SHEETS_WEB_APP_URL.
 *    Teachers: .../exec?teacher=1 (pick exam + subject on page; redeploy after changes).
 *    Marks entry lock (Script property KV_MARKS_ENTRY_ENABLED) applies to the class dashboard and the teacher marks page.
 *
 * Marks tab: created automatically with headers:
 * SlipId | Exam | Subject | ExamDate | MaxMarks | Teacher | RollNo | StudentName | Marks | SavedAt | StudentId (= roll / R.NO.)
 */
var CONFIG = {
  /** Required for Web App calls (getActiveSpreadsheet() is empty over HTTP). */
  SPREADSHEET_ID: "PASTE_YOUR_SPREADSHEET_ID_HERE",
  MASTER_TAB: "Master",
  MARKS_TAB: "Marks",
  ATTENDANCE_TAB: "Attendance",
  TIMETABLE_SLOTS_TAB: "Timetable_Slots",
  TIMETABLE_CLASS_TAB: "Timetable_Class",
  TIMETABLE_TEACHER_TAB: "Timetable_Teacher",
  /** Teacher row key in Timetable_Teacher column A (must match your sheet). */
  TIMETABLE_WE_TEACHER_CODE: "TGT WE",
  /** Shown in app modal title for Teacher time table. */
  TIMETABLE_WE_TEACHER_DISPLAY: "Arpit Choudhary, TGT(WE)",
  /** Shown on the teacher marks page and PDF slips — match browser-app/sheets-webapp-config.js */
  SCHOOL_NAME: "KV NIT Agartala",
  /** e.g. "Class VII"; leave "" to show school name only */
  SCHOOL_CLASS: "Class VII",
};

/** Shown to subject teachers when the class teacher disables portal entry (Script property KV_MARKS_ENTRY_ENABLED). */
var MARKS_ENTRY_DISABLED_MSG =
  "Marks Entry/Edit is currently disabled. Please contact the class teacher";

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

var ATTENDANCE_ACADEMIC_START = { year: 2026, month1: 4 }; // April 2026
var ATTENDANCE_MONTHS_COUNT = 12; // Through March 2027

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

function getAttendanceSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(CONFIG.ATTENDANCE_TAB);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.ATTENDANCE_TAB);
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

function toA1Col_(colIndex1) {
  var n = Number(colIndex1 || 0);
  var s = "";
  while (n > 0) {
    var rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || "A";
}

function monthLabel_(year, month1) {
  return Utilities.formatDate(new Date(year, month1 - 1, 1), Session.getScriptTimeZone(), "MMMM yyyy");
}

function academicMonths_() {
  var out = [];
  var y = ATTENDANCE_ACADEMIC_START.year;
  var m = ATTENDANCE_ACADEMIC_START.month1;
  for (var i = 0; i < ATTENDANCE_MONTHS_COUNT; i++) {
    var d = new Date(y, m - 1, 1);
    out.push({
      year: d.getFullYear(),
      month1: d.getMonth() + 1,
      daysInMonth: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
      label: monthLabel_(d.getFullYear(), d.getMonth() + 1),
    });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function isSunday_(year, month1, day) {
  return new Date(year, month1 - 1, day).getDay() === 0;
}

function isSecondSaturday_(year, month1, day) {
  var d = new Date(year, month1 - 1, day);
  return d.getDay() === 6 && day >= 8 && day <= 14;
}

function findMasterColumnIndex_(headers, wantNamesLower) {
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] != null ? headers[i] : "")
      .trim()
      .toLowerCase();
    if (wantNamesLower.indexOf(h) >= 0) return i;
  }
  return -1;
}

/**
 * Creates/refreshes Attendance register from Master:
 * - Col A: Roll No, Col B: Student Name
 * - For each month (Apr 2026..Mar 2027):
 *   Day columns 1..N, Monthly Total, Attendance Upto Last Month (B/F), Total Attendance Till This Month
 * - Sundays + second Saturdays are pre-marked as "H" (holiday) and shaded.
 */
function setupAttendanceRegister_() {
  var master = getMasterSheet_();
  var range = master.getDataRange();
  var data = range.getValues();
  if (!data || data.length < 2) {
    throw new Error('No student rows found in "' + CONFIG.MASTER_TAB + '".');
  }

  var headers = data[0];
  var rollIdx = findMasterColumnIndex_(headers, ["r.no.", "r.no", "roll no", "roll number", "rollno"]);
  var nameIdx = findMasterColumnIndex_(headers, ["student name", "name"]);
  if (rollIdx < 0 || nameIdx < 0) {
    throw new Error('Master must contain "R.NO." (or Roll No) and "Student Name" columns.');
  }

  var students = [];
  for (var r = 1; r < data.length; r++) {
    var roll = String(data[r][rollIdx] != null ? data[r][rollIdx] : "").trim();
    var name = String(data[r][nameIdx] != null ? data[r][nameIdx] : "").trim();
    if (!roll && !name) continue;
    students.push([roll, name]);
  }
  if (!students.length) {
    throw new Error("No students available in Master to populate Attendance.");
  }

  var sh = getAttendanceSheet_();
  sh.clear();

  var months = academicMonths_();
  var headerRow1 = ["Roll No", "Student Name"];
  var headerRow2 = ["Roll No", "Student Name"];
  var monthMeta = []; // { startCol, endCol, dayStartCol, dayEndCol, mtCol, bfCol, cumCol, year, month1 }
  var col = 3;
  var mi;
  for (mi = 0; mi < months.length; mi++) {
    var m = months[mi];
    var dayStart = col;
    for (var d = 1; d <= m.daysInMonth; d++) {
      headerRow1.push(m.label);
      headerRow2.push(String(d));
      col++;
    }
    var mtCol = col++;
    var bfCol = col++;
    var cumCol = col++;
    headerRow1.push(m.label);
    headerRow1.push(m.label);
    headerRow1.push(m.label);
    headerRow2.push("Monthly Total");
    headerRow2.push("Attendance Upto Last Month");
    headerRow2.push("Total Attendance Till This Month");
    monthMeta.push({
      startCol: dayStart,
      endCol: cumCol,
      dayStartCol: dayStart,
      dayEndCol: mtCol - 1,
      mtCol: mtCol,
      bfCol: bfCol,
      cumCol: cumCol,
      year: m.year,
      month1: m.month1,
    });
  }

  var totalCols = headerRow2.length;
  sh.getRange(1, 1, 1, totalCols).setValues([headerRow1]);
  sh.getRange(2, 1, 1, totalCols).setValues([headerRow2]);
  sh.getRange(3, 1, students.length, 2).setValues(students);

  // Merge month titles on row 1.
  for (mi = 0; mi < monthMeta.length; mi++) {
    var mm = monthMeta[mi];
    sh.getRange(1, mm.startCol, 1, mm.endCol - mm.startCol + 1).merge();
  }

  // Add formulas and holiday marks.
  var startStudentRow = 3;
  var endStudentRow = startStudentRow + students.length - 1;
  for (var row = startStudentRow; row <= endStudentRow; row++) {
    for (mi = 0; mi < monthMeta.length; mi++) {
      var meta = monthMeta[mi];
      var dayStartA1 = toA1Col_(meta.dayStartCol) + row;
      var dayEndA1 = toA1Col_(meta.dayEndCol) + row;
      var mtA1 = toA1Col_(meta.mtCol) + row;
      var bfA1 = toA1Col_(meta.bfCol) + row;
      var prevCumA1 = mi > 0 ? toA1Col_(monthMeta[mi - 1].cumCol) + row : "";

      sh.getRange(row, meta.mtCol).setFormula('=COUNTIF(' + dayStartA1 + ":" + dayEndA1 + ',"P")');
      if (mi === 0) {
        sh.getRange(row, meta.bfCol).setValue(0);
      } else {
        sh.getRange(row, meta.bfCol).setFormula("=" + prevCumA1);
      }
      sh.getRange(row, meta.cumCol).setFormula("=" + bfA1 + "+" + mtA1);
    }
  }

  // Holiday pre-fill for Sundays + second Saturdays.
  for (mi = 0; mi < monthMeta.length; mi++) {
    var hm = monthMeta[mi];
    for (var day = 1; day <= months[mi].daysInMonth; day++) {
      if (!isSunday_(hm.year, hm.month1, day) && !isSecondSaturday_(hm.year, hm.month1, day)) continue;
      var holidayCol = hm.dayStartCol + day - 1;
      var rng = sh.getRange(startStudentRow, holidayCol, students.length, 1);
      rng.setValue("H");
      rng.setBackground("#f3f3f3");
    }
  }

  // Header + basic formatting.
  sh.getRange(1, 1, 2, totalCols).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.getRange(1, 1, endStudentRow, totalCols).setBorder(true, true, true, true, true, true, "#c8c8c8", SpreadsheetApp.BorderStyle.SOLID);
  sh.setFrozenRows(2);
  sh.setFrozenColumns(2);
  sh.setColumnWidths(1, 1, 80);
  sh.setColumnWidths(2, 1, 220);
  if (totalCols > 2) sh.setColumnWidths(3, totalCols - 2, 44);

  return {
    ok: true,
    sheet: CONFIG.ATTENDANCE_TAB,
    academicYear: monthLabel_(ATTENDANCE_ACADEMIC_START.year, ATTENDANCE_ACADEMIC_START.month1) + " to " + monthLabel_(months[months.length - 1].year, months[months.length - 1].month1),
    students: students.length,
  };
}

/** Run manually once (or whenever Master changes) from Apps Script editor. */
function setupAttendanceRegister() {
  return setupAttendanceRegister_();
}

function setupAttendanceRegisterIntoSheet_(sheetName) {
  var master = getMasterSheet_();
  var range = master.getDataRange();
  var data = range.getValues();
  if (!data || data.length < 2) throw new Error('No student rows found in "' + CONFIG.MASTER_TAB + '".');
  var headers = data[0];
  var rollIdx = findMasterColumnIndex_(headers, ["r.no.", "r.no", "roll no", "roll number", "rollno"]);
  var nameIdx = findMasterColumnIndex_(headers, ["student name", "name"]);
  if (rollIdx < 0 || nameIdx < 0) throw new Error('Master must contain "R.NO." (or Roll No) and "Student Name" columns.');
  var students = [];
  for (var r = 1; r < data.length; r++) {
    var roll = String(data[r][rollIdx] != null ? data[r][rollIdx] : "").trim();
    var name = String(data[r][nameIdx] != null ? data[r][nameIdx] : "").trim();
    if (!roll && !name) continue;
    students.push([roll, name]);
  }
  if (!students.length) throw new Error("No students available in Master to populate Attendance.");

  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  sh.clear();

  var months = academicMonths_();
  var headerRow1 = ["Roll No", "Student Name"];
  var headerRow2 = ["Roll No", "Student Name"];
  var monthMeta = [];
  var col = 3;
  var mi;
  for (mi = 0; mi < months.length; mi++) {
    var m = months[mi];
    var dayStart = col;
    for (var d = 1; d <= m.daysInMonth; d++) {
      headerRow1.push(m.label);
      headerRow2.push(String(d));
      col++;
    }
    var mtCol = col++;
    var bfCol = col++;
    var cumCol = col++;
    headerRow1.push(m.label);
    headerRow1.push(m.label);
    headerRow1.push(m.label);
    headerRow2.push("Monthly Total");
    headerRow2.push("Attendance Upto Last Month");
    headerRow2.push("Total Attendance Till This Month");
    monthMeta.push({
      startCol: dayStart,
      endCol: cumCol,
      dayStartCol: dayStart,
      dayEndCol: mtCol - 1,
      mtCol: mtCol,
      bfCol: bfCol,
      cumCol: cumCol,
      year: m.year,
      month1: m.month1,
    });
  }

  var totalCols = headerRow2.length;
  sh.getRange(1, 1, 1, totalCols).setValues([headerRow1]);
  sh.getRange(2, 1, 1, totalCols).setValues([headerRow2]);
  sh.getRange(3, 1, students.length, 2).setValues(students);
  for (mi = 0; mi < monthMeta.length; mi++) {
    var mm = monthMeta[mi];
    sh.getRange(1, mm.startCol, 1, mm.endCol - mm.startCol + 1).merge();
  }
  var startStudentRow = 3;
  var endStudentRow = startStudentRow + students.length - 1;
  for (var row = startStudentRow; row <= endStudentRow; row++) {
    for (mi = 0; mi < monthMeta.length; mi++) {
      var meta = monthMeta[mi];
      var dayStartA1 = toA1Col_(meta.dayStartCol) + row;
      var dayEndA1 = toA1Col_(meta.dayEndCol) + row;
      var mtA1 = toA1Col_(meta.mtCol) + row;
      var bfA1 = toA1Col_(meta.bfCol) + row;
      var prevCumA1 = mi > 0 ? toA1Col_(monthMeta[mi - 1].cumCol) + row : "";
      sh.getRange(row, meta.mtCol).setFormula('=COUNTIF(' + dayStartA1 + ":" + dayEndA1 + ',"P")');
      if (mi === 0) sh.getRange(row, meta.bfCol).setValue(0);
      else sh.getRange(row, meta.bfCol).setFormula("=" + prevCumA1);
      sh.getRange(row, meta.cumCol).setFormula("=" + bfA1 + "+" + mtA1);
    }
  }
  for (mi = 0; mi < monthMeta.length; mi++) {
    var hm = monthMeta[mi];
    for (var day = 1; day <= months[mi].daysInMonth; day++) {
      if (!isSunday_(hm.year, hm.month1, day) && !isSecondSaturday_(hm.year, hm.month1, day)) continue;
      var holidayCol = hm.dayStartCol + day - 1;
      var rng = sh.getRange(startStudentRow, holidayCol, students.length, 1);
      rng.setValue("H");
      rng.setBackground("#f3f3f3");
    }
  }
  sh.getRange(1, 1, 2, totalCols).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.getRange(1, 1, endStudentRow, totalCols).setBorder(true, true, true, true, true, true, "#c8c8c8", SpreadsheetApp.BorderStyle.SOLID);
  sh.setFrozenRows(2);
  sh.setFrozenColumns(2);
  sh.setColumnWidths(1, 1, 80);
  sh.setColumnWidths(2, 1, 220);
  if (totalCols > 2) sh.setColumnWidths(3, totalCols - 2, 44);
  return { ok: true, sheet: sheetName, students: students.length };
}

function attendanceMonthMeta_() {
  var months = academicMonths_();
  var out = [];
  var col = 3;
  for (var i = 0; i < months.length; i++) {
    var m = months[i];
    var dayStartCol = col;
    col += m.daysInMonth;
    var monthlyTotalCol = col++;
    var broughtForwardCol = col++;
    var cumulativeCol = col++;
    out.push({
      year: m.year,
      month1: m.month1,
      label: m.label,
      dayStartCol: dayStartCol,
      dayEndCol: dayStartCol + m.daysInMonth - 1,
      monthlyTotalCol: monthlyTotalCol,
      broughtForwardCol: broughtForwardCol,
      cumulativeCol: cumulativeCol,
    });
  }
  return out;
}

function attendanceColumnForDate_(dt) {
  var y = dt.getFullYear();
  var m1 = dt.getMonth() + 1;
  var day = dt.getDate();
  var meta = attendanceMonthMeta_();
  for (var i = 0; i < meta.length; i++) {
    var mm = meta[i];
    if (mm.year === y && mm.month1 === m1) {
      if (day < 1 || day > mm.dayEndCol - mm.dayStartCol + 1) return null;
      return {
        col: mm.dayStartCol + day - 1,
        year: y,
        month1: m1,
        day: day,
        label: mm.label,
      };
    }
  }
  return null;
}

function genderBucket_(g) {
  var s = String(g != null ? g : "")
    .trim()
    .toLowerCase();
  if (!s) return "other";
  if (s.indexOf("f") === 0 || s === "girl" || s === "female") return "girl";
  if (s.indexOf("m") === 0 || s === "boy" || s === "male") return "boy";
  return "other";
}

function getAttendanceRowsMap_(attendanceSheet) {
  var h1 = String(attendanceSheet.getRange(2, 1).getValue() != null ? attendanceSheet.getRange(2, 1).getValue() : "").trim().toLowerCase();
  var h2 = String(attendanceSheet.getRange(2, 2).getValue() != null ? attendanceSheet.getRange(2, 2).getValue() : "").trim().toLowerCase();
  if (h1 !== "roll no" || h2 !== "student name") {
    throw new Error('Attendance sheet is not initialized. Run "setupAttendanceRegister" once in Apps Script.');
  }
  var last = attendanceSheet.getLastRow();
  if (last < 3) return {};
  var data = attendanceSheet.getRange(3, 1, last - 2, 2).getValues();
  var map = {};
  for (var i = 0; i < data.length; i++) {
    var roll = String(data[i][0] != null ? data[i][0] : "").trim();
    var name = String(data[i][1] != null ? data[i][1] : "").trim();
    var rowNo = i + 3;
    if (roll) map["roll::" + roll] = rowNo;
    if (name) map["name::" + name.toLowerCase()] = rowNo;
  }
  return map;
}

function getMasterStudentsForAttendance_() {
  var sh = getMasterSheet_();
  var data = sh.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0];
  var rollIdx = findMasterColumnIndex_(headers, ["r.no.", "r.no", "roll no", "roll number", "rollno"]);
  var nameIdx = findMasterColumnIndex_(headers, ["student name", "name"]);
  var genderIdx = findMasterColumnIndex_(headers, ["gender"]);
  if (rollIdx < 0 || nameIdx < 0) {
    throw new Error('Master must contain "R.NO." (or Roll No) and "Student Name" columns.');
  }
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var roll = String(data[r][rollIdx] != null ? data[r][rollIdx] : "").trim();
    var name = String(data[r][nameIdx] != null ? data[r][nameIdx] : "").trim();
    if (!roll && !name) continue;
    out.push({
      rollNo: roll,
      studentName: name,
      gender: genderIdx >= 0 ? String(data[r][genderIdx] != null ? data[r][genderIdx] : "").trim() : "",
    });
  }
  return out;
}

function getTodayAttendance_(payload) {
  var tz = Session.getScriptTimeZone();
  var dateIso = String((payload && payload.date) || Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"));
  return getAttendanceByDate_({ date: dateIso });
}

function getAttendanceByDate_(payload) {
  var tz = Session.getScriptTimeZone();
  var dateIso = String((payload && payload.date) || Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"));
  var dt = new Date(dateIso + "T00:00:00");
  if (isNaN(dt.getTime())) throw new Error("Invalid date.");
  var atCol = attendanceColumnForDate_(dt);
  if (!atCol) throw new Error("Date is outside configured attendance academic year.");
  var attendanceSheet = getAttendanceSheet_();
  var students = getMasterStudentsForAttendance_();
  if (!students.length) return { ok: true, date: dateIso, marked: false, entries: [] };
  var rowMap = getAttendanceRowsMap_(attendanceSheet);
  var entries = [];
  var markedCount = 0;
  for (var i = 0; i < students.length; i++) {
    var st = students[i];
    var rowNo = rowMap["roll::" + st.rollNo] || rowMap["name::" + st.studentName.toLowerCase()] || null;
    var raw = "";
    if (rowNo) {
      var cellVal = attendanceSheet.getRange(rowNo, atCol.col).getValue();
      raw = String(cellVal != null ? cellVal : "")
        .trim()
        .toUpperCase();
    }
    var status = raw === "A" ? "A" : raw === "P" ? "P" : raw === "H" ? "H" : raw === "I" ? "I" : "";
    if (status) markedCount++;
    entries.push({
      rollNo: st.rollNo,
      studentName: st.studentName,
      gender: st.gender,
      status: status,
    });
  }
  return {
    ok: true,
    date: dateIso,
    dayLabel: Utilities.formatDate(dt, tz, "dd MMM yyyy"),
    marked: markedCount > 0,
    entries: entries,
  };
}

function saveTodayAttendance_(payload) {
  var tz = Session.getScriptTimeZone();
  var dateIso = String((payload && payload.date) || Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"));
  return saveAttendanceByDate_({ date: dateIso, entries: (payload && payload.entries) || [] });
}

function saveAttendanceByDate_(payload) {
  var tz = Session.getScriptTimeZone();
  var dateIso = String((payload && payload.date) || Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"));
  var entries = (payload && payload.entries) || [];
  if (!entries || !entries.length) throw new Error("No attendance entries received.");
  var dt = new Date(dateIso + "T00:00:00");
  if (isNaN(dt.getTime())) throw new Error("Invalid date.");
  if (isSunday_(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()) || isSecondSaturday_(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())) {
    throw new Error("Selected date is a holiday (Sunday or second Saturday).");
  }
  var atCol = attendanceColumnForDate_(dt);
  if (!atCol) throw new Error("Date is outside configured attendance academic year.");
  var attendanceSheet = getAttendanceSheet_();
  var rowMap = getAttendanceRowsMap_(attendanceSheet);
  var updated = 0;
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i] || {};
    var roll = String(e.rollNo != null ? e.rollNo : "").trim();
    var name = String(e.studentName != null ? e.studentName : "").trim();
    var rowNo = (roll && rowMap["roll::" + roll]) || (name && rowMap["name::" + name.toLowerCase()]) || null;
    if (!rowNo) continue;
    var s = String(e.status != null ? e.status : "")
      .trim()
      .toUpperCase();
    var val = s === "A" ? "A" : "P";
    attendanceSheet.getRange(rowNo, atCol.col).setValue(val);
    updated++;
  }
  return {
    ok: true,
    date: dateIso,
    dayLabel: Utilities.formatDate(dt, tz, "dd MMM yyyy"),
    updated: updated,
  };
}

function markAttendanceDateBulk_(payload) {
  var tz = Session.getScriptTimeZone();
  var dateIso = String((payload && payload.date) || "").trim();
  if (!dateIso) throw new Error("Missing date.");
  var status = String((payload && payload.status) || "")
    .trim()
    .toUpperCase();
  if (status !== "H" && status !== "I") throw new Error("Status must be H or I.");
  var dt = new Date(dateIso + "T00:00:00");
  if (isNaN(dt.getTime())) throw new Error("Invalid date.");
  var atCol = attendanceColumnForDate_(dt);
  if (!atCol) throw new Error("Date is outside configured attendance academic year.");
  var attendanceSheet = getAttendanceSheet_();
  var rowMap = getAttendanceRowsMap_(attendanceSheet);
  var students = getMasterStudentsForAttendance_();
  var updated = 0;
  for (var i = 0; i < students.length; i++) {
    var st = students[i];
    var rowNo = rowMap["roll::" + st.rollNo] || rowMap["name::" + st.studentName.toLowerCase()] || null;
    if (!rowNo) continue;
    attendanceSheet.getRange(rowNo, atCol.col).setValue(status);
    updated++;
  }
  return {
    ok: true,
    date: dateIso,
    dayLabel: Utilities.formatDate(dt, tz, "dd MMM yyyy"),
    status: status,
    updated: updated,
  };
}

function getOldestUnfilledAttendanceDate_(payload) {
  var tz = Session.getScriptTimeZone();
  var beforeDate = String((payload && payload.beforeDate) || Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"));
  var skipDates = (payload && payload.skipDates) || [];
  var skipSet = {};
  for (var si = 0; si < skipDates.length; si++) {
    var sk = String(skipDates[si] != null ? skipDates[si] : "").trim();
    if (sk) skipSet[sk] = true;
  }
  var before = new Date(beforeDate + "T00:00:00");
  if (isNaN(before.getTime())) throw new Error("Invalid beforeDate.");
  var meta = attendanceMonthMeta_();
  var attendanceSheet = getAttendanceSheet_();
  var rowMap = getAttendanceRowsMap_(attendanceSheet);
  var students = getMasterStudentsForAttendance_();
  var rowNos = [];
  for (var i = 0; i < students.length; i++) {
    var st = students[i];
    var rowNo = rowMap["roll::" + st.rollNo] || rowMap["name::" + st.studentName.toLowerCase()] || null;
    if (rowNo) rowNos.push(rowNo);
  }
  if (!rowNos.length) return { ok: true, date: null };
  var rowStart = Math.min.apply(null, rowNos);
  var rowEnd = Math.max.apply(null, rowNos);
  var totalRows = rowEnd - rowStart + 1;
  var maxCol = meta.length ? meta[meta.length - 1].cumulativeCol : 2;
  if (maxCol < 3) return { ok: true, date: null };
  var grid = attendanceSheet.getRange(rowStart, 3, totalRows, maxCol - 2).getValues();
  var wantedRows = {};
  for (i = 0; i < rowNos.length; i++) wantedRows[rowNos[i]] = true;
  var day;
  for (var mi = 0; mi < meta.length; mi++) {
    var m = meta[mi];
    var daysIn = m.dayEndCol - m.dayStartCol + 1;
    for (day = 1; day <= daysIn; day++) {
      var d = new Date(m.year, m.month1 - 1, day);
      if (d >= before) continue;
      if (isSunday_(m.year, m.month1, day) || isSecondSaturday_(m.year, m.month1, day)) continue;
      var colOffset = (m.dayStartCol + day - 1) - 3;
      var hasBlank = false;
      for (var rr = 0; rr < totalRows; rr++) {
        var absRow = rowStart + rr;
        if (!wantedRows[absRow]) continue;
        var v = String(grid[rr][colOffset] != null ? grid[rr][colOffset] : "")
          .trim()
          .toUpperCase();
        if (v !== "P" && v !== "A" && v !== "H" && v !== "I") {
          hasBlank = true;
          break;
        }
      }
      if (hasBlank) {
        var iso = Utilities.formatDate(d, tz, "yyyy-MM-dd");
        if (skipSet[iso]) continue;
        return {
          ok: true,
          date: iso,
          dayLabel: Utilities.formatDate(d, tz, "dd MMM yyyy"),
        };
      }
    }
  }
  return { ok: true, date: null };
}

function getPendingAttendanceDates_(payload) {
  var tz = Session.getScriptTimeZone();
  var beforeDate = String((payload && payload.beforeDate) || Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"));
  var before = new Date(beforeDate + "T00:00:00");
  if (isNaN(before.getTime())) throw new Error("Invalid beforeDate.");
  var skipDates = (payload && payload.skipDates) || [];
  var skipSet = {};
  for (var si = 0; si < skipDates.length; si++) {
    var sk = String(skipDates[si] != null ? skipDates[si] : "").trim();
    if (sk) skipSet[sk] = true;
  }
  var meta = attendanceMonthMeta_();
  var attendanceSheet = getAttendanceSheet_();
  var rowMap = getAttendanceRowsMap_(attendanceSheet);
  var students = getMasterStudentsForAttendance_();
  var rowNos = [];
  for (var i = 0; i < students.length; i++) {
    var st = students[i];
    var rowNo = rowMap["roll::" + st.rollNo] || rowMap["name::" + st.studentName.toLowerCase()] || null;
    if (rowNo) rowNos.push(rowNo);
  }
  if (!rowNos.length) return { ok: true, dates: [] };
  var rowStart = Math.min.apply(null, rowNos);
  var rowEnd = Math.max.apply(null, rowNos);
  var totalRows = rowEnd - rowStart + 1;
  var maxCol = meta.length ? meta[meta.length - 1].cumulativeCol : 2;
  if (maxCol < 3) return { ok: true, dates: [] };
  var grid = attendanceSheet.getRange(rowStart, 3, totalRows, maxCol - 2).getValues();
  var wantedRows = {};
  for (i = 0; i < rowNos.length; i++) wantedRows[rowNos[i]] = true;
  var out = [];
  for (var mi = 0; mi < meta.length; mi++) {
    var m = meta[mi];
    var daysIn = m.dayEndCol - m.dayStartCol + 1;
    for (var day = 1; day <= daysIn; day++) {
      var d = new Date(m.year, m.month1 - 1, day);
      if (d >= before) continue;
      if (isSunday_(m.year, m.month1, day) || isSecondSaturday_(m.year, m.month1, day)) continue;
      var iso = Utilities.formatDate(d, tz, "yyyy-MM-dd");
      if (skipSet[iso]) continue;
      var colOffset = (m.dayStartCol + day - 1) - 3;
      var hasBlank = false;
      for (var rr = 0; rr < totalRows; rr++) {
        var absRow = rowStart + rr;
        if (!wantedRows[absRow]) continue;
        var v = String(grid[rr][colOffset] != null ? grid[rr][colOffset] : "")
          .trim()
          .toUpperCase();
        if (v !== "P" && v !== "A" && v !== "H" && v !== "I") {
          hasBlank = true;
          break;
        }
      }
      if (hasBlank) out.push(iso);
    }
  }
  return { ok: true, dates: out };
}

function parseMonthToken_(token) {
  var s = String(token || "").trim();
  var m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  var y = parseInt(m[1], 10);
  var mo = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) return null;
  return { year: y, month1: mo };
}

function getMonthlyAttendanceReport_(payload) {
  var p = payload || {};
  var mm = parseMonthToken_(p.month);
  if (!mm) throw new Error("Missing/invalid month. Use YYYY-MM.");
  var meta = attendanceMonthMeta_();
  var idx = -1;
  for (var i = 0; i < meta.length; i++) {
    if (meta[i].year === mm.year && meta[i].month1 === mm.month1) {
      idx = i;
      break;
    }
  }
  if (idx < 0) throw new Error("Selected month is outside attendance session.");

  var attendanceSheet = getAttendanceSheet_();
  if (!attendanceSheet) throw new Error("Attendance sheet not found.");
  var rowMap = getAttendanceRowsMap_(attendanceSheet);
  var students = getMasterStudentsForAttendance_();
  if (!students.length) {
    return {
      ok: true,
      month: p.month,
      monthLabel: monthLabel_(mm.year, mm.month1),
      workingDaysMonth: 0,
      totalAttendanceMonth: 0,
      averageAttendanceMonth: 0,
      workingDaysPrev: 0,
      workingDaysTill: 0,
      rows: [],
    };
  }

  var rowNos = [];
  for (i = 0; i < students.length; i++) {
    var st = students[i];
    var rowNo = rowMap["roll::" + st.rollNo] || rowMap["name::" + st.studentName.toLowerCase()] || null;
    if (rowNo) rowNos.push(rowNo);
  }
  if (!rowNos.length) throw new Error("No matching attendance rows for Master students.");

  var rowStart = Math.min.apply(null, rowNos);
  var rowEnd = Math.max.apply(null, rowNos);
  var totalRows = rowEnd - rowStart + 1;
  var colStart = meta[0].dayStartCol;
  var colEnd = meta[idx].dayEndCol;
  var totalCols = colEnd - colStart + 1;
  var grid = attendanceSheet.getRange(rowStart, colStart, totalRows, totalCols).getValues();
  var wantedOffsets = [];
  for (i = 0; i < rowNos.length; i++) wantedOffsets.push(rowNos[i] - rowStart);

  function isSheetMarkedNonWorking(colOffset) {
    for (var wi = 0; wi < wantedOffsets.length; wi++) {
      var rr = wantedOffsets[wi];
      var v = String(grid[rr][colOffset] != null ? grid[rr][colOffset] : "")
        .trim()
        .toUpperCase();
      if (v !== "H" && v !== "I") return false;
    }
    return true;
  }

  var monthWorkCols = [];
  var prevWorkCols = [];
  var allWorkCols = [];
  for (i = 0; i <= idx; i++) {
    var mmeta = meta[i];
    var daysIn = mmeta.dayEndCol - mmeta.dayStartCol + 1;
    for (var day = 1; day <= daysIn; day++) {
      if (isSunday_(mmeta.year, mmeta.month1, day) || isSecondSaturday_(mmeta.year, mmeta.month1, day)) continue;
      var sheetCol = mmeta.dayStartCol + day - 1;
      var colOffset = sheetCol - colStart;
      if (isSheetMarkedNonWorking(colOffset)) continue;
      allWorkCols.push(colOffset);
      if (i === idx) monthWorkCols.push(colOffset);
      else prevWorkCols.push(colOffset);
    }
  }

  function countPresentForRow(rowOffset, cols) {
    var c = 0;
    for (var ci = 0; ci < cols.length; ci++) {
      var v = String(grid[rowOffset][cols[ci]] != null ? grid[rowOffset][cols[ci]] : "")
        .trim()
        .toUpperCase();
      if (v === "P") c++;
    }
    return c;
  }

  var outRows = [];
  var totalAttendanceMonth = 0;
  for (i = 0; i < students.length; i++) {
    st = students[i];
    rowNo = rowMap["roll::" + st.rollNo] || rowMap["name::" + st.studentName.toLowerCase()] || null;
    if (!rowNo) continue;
    var ro = rowNo - rowStart;
    var monthPresent = countPresentForRow(ro, monthWorkCols);
    var prevPresent = countPresentForRow(ro, prevWorkCols);
    var tillPresent = monthPresent + prevPresent;
    totalAttendanceMonth += monthPresent;
    var monthPct = monthWorkCols.length > 0 ? (monthPresent * 100) / monthWorkCols.length : 0;
    var overallPct = allWorkCols.length > 0 ? (tillPresent * 100) / allWorkCols.length : 0;
    outRows.push({
      rollNo: st.rollNo,
      studentName: st.studentName,
      monthAttendance: monthPresent,
      uptoPrev: prevPresent,
      uptoMonth: tillPresent,
      monthPct: monthPct,
      overallPct: overallPct,
    });
  }

  outRows.sort(function (a, b) {
    var an = Number(a.rollNo);
    var bn = Number(b.rollNo);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return String(a.rollNo).localeCompare(String(b.rollNo));
  });

  return {
    ok: true,
    month: p.month,
    monthLabel: monthLabel_(mm.year, mm.month1),
    workingDaysMonth: monthWorkCols.length,
    totalAttendanceMonth: totalAttendanceMonth,
    averageAttendanceMonth: monthWorkCols.length > 0 ? totalAttendanceMonth / monthWorkCols.length : 0,
    workingDaysPrev: prevWorkCols.length,
    workingDaysTill: allWorkCols.length,
    rows: outRows,
  };
}


function getTodayAbsentees_(payload) {
  var data = getTodayAttendance_(payload);
  var absentees = [];
  for (var i = 0; i < data.entries.length; i++) {
    if (String(data.entries[i].status || "") === "A") absentees.push(data.entries[i]);
  }
  return {
    ok: true,
    date: data.date,
    dayLabel: data.dayLabel,
    marked: data.marked,
    absentees: absentees,
  };
}

function getTodayAttendanceSummary_(payload) {
  var data = getTodayAttendance_(payload);
  var out = {
    ok: true,
    date: data.date,
    dayLabel: data.dayLabel,
    marked: data.marked,
    totals: { girls: 0, boys: 0, total: 0 },
    present: { girls: 0, boys: 0, total: 0 },
    absent: { girls: 0, boys: 0, total: 0 },
  };
  for (var i = 0; i < data.entries.length; i++) {
    var e = data.entries[i];
    var bucket = genderBucket_(e.gender);
    out.totals.total++;
    if (bucket === "girl") out.totals.girls++;
    else if (bucket === "boy") out.totals.boys++;
    var st = String(e.status || "").toUpperCase();
    if (st === "A") {
      out.absent.total++;
      if (bucket === "girl") out.absent.girls++;
      else if (bucket === "boy") out.absent.boys++;
    } else if (st === "P") {
      out.present.total++;
      if (bucket === "girl") out.present.girls++;
      else if (bucket === "boy") out.present.boys++;
    }
  }
  return out;
}

function isMarksEntryEnabled_() {
  var raw = PropertiesService.getScriptProperties().getProperty("KV_MARKS_ENTRY_ENABLED");
  if (raw == null || raw === "") return true;
  var s = String(raw).toLowerCase();
  return s !== "false" && s !== "0" && s !== "no" && s !== "off";
}

function getMarksEntryPolicy_() {
  return { ok: true, marksEntryEnabled: isMarksEntryEnabled_() };
}

function setMarksEntryPolicy_(payload) {
  var p = payload || {};
  var en = p.enabled !== false && p.enabled !== 0 && String(p.enabled).toLowerCase() !== "false";
  PropertiesService.getScriptProperties().setProperty("KV_MARKS_ENTRY_ENABLED", en ? "true" : "false");
  return { ok: true, marksEntryEnabled: en };
}

/** Block all mark slip writes from every client when disabled (class dashboard and teacher page). */
function assertMarksEntryAllowed_() {
  if (!isMarksEntryEnabled_()) {
    throw new Error(MARKS_ENTRY_DISABLED_MSG);
  }
}

/** Day key MON..SUN from YYYY-MM-DD in Asia/Kolkata (1=Mon .. 7=Sun). */
function ymdToDayKeyIST_(ymd) {
  var m = String(ymd || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  var d;
  if (m) {
    d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  } else {
    d = new Date();
  }
  var u = parseInt(Utilities.formatDate(d, "Asia/Kolkata", "u"), 10);
  var keys = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  if (u >= 1 && u <= 7) return keys[u - 1];
  return "MON";
}

function formatDmyIST_(ymd) {
  var m = String(ymd || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return m[3] + "/" + m[2] + "/" + m[1];
}

function getTimetableSlotsSheet_() {
  return getSpreadsheet_().getSheetByName(CONFIG.TIMETABLE_SLOTS_TAB);
}

function getTimetableClassSheet_() {
  return getSpreadsheet_().getSheetByName(CONFIG.TIMETABLE_CLASS_TAB);
}

function getTimetableTeacherSheet_() {
  return getSpreadsheet_().getSheetByName(CONFIG.TIMETABLE_TEACHER_TAB);
}

/** Sheet time cells come back as Date (epoch 1899); plain text stays string. */
function formatTimetableTimeCell_(raw, timeZone) {
  if (raw === null || raw === undefined || raw === "") return "";
  var tz = timeZone || "Asia/Kolkata";
  if (Object.prototype.toString.call(raw) === "[object Date]") {
    if (isNaN(raw.getTime())) return "";
    return Utilities.formatDate(raw, tz, "HH:mm");
  }
  return String(raw).trim();
}

function readTimetableSlots_() {
  var sh = getTimetableSlotsSheet_();
  if (!sh || sh.getLastRow() < 2) return [];
  var tz = getSpreadsheet_().getSpreadsheetTimeZone() || "Asia/Kolkata";
  var data = sh.getRange(2, 1, sh.getLastRow(), 5).getValues();
  var out = [];
  var i;
  for (i = 0; i < data.length; i++) {
    var orderCell = data[i][0];
    var typRaw = data[i][1];
    var label = String(data[i][2] != null ? data[i][2] : "").trim();
    var startStr = formatTimetableTimeCell_(data[i][3], tz);
    var endStr = formatTimetableTimeCell_(data[i][4], tz);
    var typ = String(typRaw != null ? typRaw : "")
      .trim()
      .toLowerCase();
    var orderEmpty = orderCell === "" || orderCell === null || orderCell === undefined;
    var typEmpty = typ === "";
    if (orderEmpty && typEmpty && !label && !startStr && !endStr) continue;
    out.push({
      order: Number(orderCell) || i + 1,
      type: typ === "break" ? "break" : "period",
      label: label,
      start: startStr,
      end: endStr,
    });
  }
  out.sort(function (a, b) {
    return a.order - b.order;
  });
  return out.filter(function (s) {
    return !!(s.label || s.start || s.end);
  });
}

function readClassRowForDay_(dayKey) {
  var sh = getTimetableClassSheet_();
  if (!sh || sh.getLastRow() < 2) return null;
  var lastCol = sh.getLastColumn();
  var data = sh.getRange(1, 1, sh.getLastRow(), lastCol).getValues();
  var headers = data[0].map(function (h) {
    return String(h != null ? h : "").trim();
  });
  var r;
  for (r = 1; r < data.length; r++) {
    if (String(data[r][0] != null ? data[r][0] : "").trim().toUpperCase() === dayKey) {
      var row = {};
      var c;
      for (c = 1; c < headers.length; c++) {
        row[headers[c]] = data[r][c];
      }
      return row;
    }
  }
  return null;
}

function readTeacherRowForDay_(teacherCode, dayKey) {
  var code = String(teacherCode || "").trim();
  var sh = getTimetableTeacherSheet_();
  if (!sh || sh.getLastRow() < 2 || !code) return null;
  var lastCol = sh.getLastColumn();
  var data = sh.getRange(1, 1, sh.getLastRow(), lastCol).getValues();
  var headerLen = data[0] ? data[0].length : 0;
  var r;
  for (r = 1; r < data.length; r++) {
    if (
      String(data[r][0] != null ? data[r][0] : "").trim() === code &&
      String(data[r][1] != null ? data[r][1] : "").trim().toUpperCase() === dayKey
    ) {
      var cells = {};
      var c;
      for (c = 2; c < headerLen; c++) {
        var hk = String(data[0][c] != null ? data[0][c] : "").trim();
        if (!hk) continue;
        cells[hk] = data[r][c];
      }
      return cells;
    }
  }
  return null;
}

function splitTeacherCell_(raw) {
  var s = String(raw != null ? raw : "").trim();
  if (!s) return { clazz: "", subject: "" };
  if (s.indexOf("\n") >= 0) {
    var parts = s.split(/\r?\n/);
    return { clazz: String(parts[0] || "").trim(), subject: String(parts[1] || "").trim() };
  }
  if (s.indexOf("/") >= 0) {
    var p2 = s.split("/");
    return { clazz: String(p2[0] || "").trim(), subject: String(p2.slice(1).join("/") || "").trim() };
  }
  return { clazz: "", subject: s };
}

function getClassTimetableForDate_(payload) {
  var p = payload || {};
  var ymd = String(p.date || "").trim();
  if (!ymd) {
    var d = new Date();
    ymd = Utilities.formatDate(d, "Asia/Kolkata", "yyyy-MM-dd");
  }
  var dayKey = ymdToDayKeyIST_(ymd);
  var slots = readTimetableSlots_();
  var row = readClassRowForDay_(dayKey);
  var classLabel = String(CONFIG.SCHOOL_CLASS != null ? CONFIG.SCHOOL_CLASS : "").trim() || "Class";
  var outSlots = [];
  var si;
  for (si = 0; si < slots.length; si++) {
    var sl = slots[si];
    var timeRange = sl.start && sl.end ? sl.start + " – " + sl.end : "";
    if (sl.type === "break") {
      outSlots.push({
        kind: "break",
        label: sl.label || "Break",
        timeRange: timeRange,
        subject: "",
        teacher: "",
        clazz: "",
      });
      continue;
    }
    var pn = String(sl.label != null ? sl.label : "").trim();
    var subK = pn + "_Subject";
    var tK = pn + "_Teacher";
    var subj = row && row[subK] != null ? String(row[subK]).trim() : "";
    var tch = row && row[tK] != null ? String(row[tK]).trim() : "";
    outSlots.push({
      kind: "period",
      period: pn,
      label: "Period " + pn,
      timeRange: timeRange,
      subject: subj,
      teacher: tch,
      clazz: classLabel,
    });
  }
  return {
    ok: true,
    date: ymd,
    dateDisplay: formatDmyIST_(ymd),
    dayKey: dayKey,
    title: "Class timetable — " + classLabel,
    slots: outSlots,
  };
}

function getTeacherTimetableForDate_(payload) {
  var p = payload || {};
  var defaultCode = String(CONFIG.TIMETABLE_WE_TEACHER_CODE != null ? CONFIG.TIMETABLE_WE_TEACHER_CODE : "TGT WE").trim();
  var teacherCode = String(p.teacherCode || "").trim() || defaultCode;
  var ymd = String(p.date || "").trim();
  if (!ymd) {
    var d2 = new Date();
    ymd = Utilities.formatDate(d2, "Asia/Kolkata", "yyyy-MM-dd");
  }
  var dayKey = ymdToDayKeyIST_(ymd);
  var slots = readTimetableSlots_();
  var cells = readTeacherRowForDay_(teacherCode, dayKey);
  var outSlots = [];
  var sj;
  for (sj = 0; sj < slots.length; sj++) {
    var sl2 = slots[sj];
    var tr = sl2.start && sl2.end ? sl2.start + " – " + sl2.end : "";
    if (sl2.type === "break") {
      outSlots.push({
        kind: "break",
        label: sl2.label || "Break",
        timeRange: tr,
        clazz: "",
        subject: "",
      });
      continue;
    }
    var pnum = String(sl2.label != null ? sl2.label : "").trim();
    var rawCell = cells && cells[pnum] != null ? cells[pnum] : "";
    var sp = splitTeacherCell_(rawCell);
    outSlots.push({
      kind: "period",
      period: pnum,
      label: "Period " + pnum,
      timeRange: tr,
      clazz: sp.clazz,
      subject: sp.subject,
    });
  }
  var weCode = String(CONFIG.TIMETABLE_WE_TEACHER_CODE != null ? CONFIG.TIMETABLE_WE_TEACHER_CODE : "TGT WE").trim();
  var titleTeacher =
    teacherCode === weCode && String(CONFIG.TIMETABLE_WE_TEACHER_DISPLAY || "").trim()
      ? String(CONFIG.TIMETABLE_WE_TEACHER_DISPLAY).trim()
      : teacherCode;
  return {
    ok: true,
    teacherCode: teacherCode,
    date: ymd,
    dateDisplay: formatDmyIST_(ymd),
    dayKey: dayKey,
    title: "Teacher timetable — " + titleTeacher,
    slots: outSlots,
  };
}

function timetableEditorDayKeys_() {
  return ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
}

function timetableEditorPeriodLabels_() {
  var slots = readTimetableSlots_();
  var out = [];
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].type !== "period") continue;
    var label = String(slots[i].label != null ? slots[i].label : "").trim();
    if (!label) continue;
    out.push(label);
  }
  return out;
}

function ensureClassTimetableHeaders_(sh, periodLabels) {
  var wanted = ["Day"];
  for (var i = 0; i < periodLabels.length; i++) {
    wanted.push(periodLabels[i] + "_Subject");
    wanted.push(periodLabels[i] + "_Teacher");
  }
  if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, wanted.length).setValues([wanted]);
    return wanted;
  }
  var lastCol = Math.max(sh.getLastColumn(), wanted.length);
  var row = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var next = row.slice(0, wanted.length);
  for (var c = 0; c < wanted.length; c++) {
    if (!String(next[c] != null ? next[c] : "").trim()) next[c] = wanted[c];
  }
  sh.getRange(1, 1, 1, next.length).setValues([next]);
  return next;
}

function ensureTeacherTimetableHeaders_(sh, periodLabels) {
  var wanted = ["TeacherCode", "Day"];
  for (var i = 0; i < periodLabels.length; i++) wanted.push(periodLabels[i]);
  if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, wanted.length).setValues([wanted]);
    return wanted;
  }
  var lastCol = Math.max(sh.getLastColumn(), wanted.length);
  var row = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var next = row.slice(0, wanted.length);
  for (var c = 0; c < wanted.length; c++) {
    if (!String(next[c] != null ? next[c] : "").trim()) next[c] = wanted[c];
  }
  sh.getRange(1, 1, 1, next.length).setValues([next]);
  return next;
}

function getTimetableEditorData_(payload) {
  var p = payload || {};
  var entityType = String(p.entityType || "class").trim().toLowerCase();
  if (entityType !== "class" && entityType !== "teacher") throw new Error("entityType must be class or teacher.");
  var periodLabels = timetableEditorPeriodLabels_();
  if (!periodLabels.length) throw new Error('No timetable periods found. Configure "Timetable_Slots" first.');
  var dayKeys = timetableEditorDayKeys_();
  var rowsMap = {};
  var di;
  for (di = 0; di < dayKeys.length; di++) rowsMap[dayKeys[di]] = {};

  if (entityType === "class") {
    var sh = getTimetableClassSheet_();
    if (!sh) throw new Error('Missing tab "' + CONFIG.TIMETABLE_CLASS_TAB + '".');
    var headers = ensureClassTimetableHeaders_(sh, periodLabels);
    if (sh.getLastRow() >= 2) {
      var data = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();
      for (var r = 0; r < data.length; r++) {
        var dayKey = String(data[r][0] != null ? data[r][0] : "").trim().toUpperCase();
        if (dayKeys.indexOf(dayKey) < 0) continue;
        for (var pidx = 0; pidx < periodLabels.length; pidx++) {
          var pn = periodLabels[pidx];
          var sCol = headers.indexOf(pn + "_Subject");
          var tCol = headers.indexOf(pn + "_Teacher");
          rowsMap[dayKey][pn] = {
            subject: sCol >= 0 ? String(data[r][sCol] != null ? data[r][sCol] : "").trim() : "",
            teacher: tCol >= 0 ? String(data[r][tCol] != null ? data[r][tCol] : "").trim() : "",
          };
        }
      }
    }
    return { ok: true, entityType: "class", dayKeys: dayKeys, periodLabels: periodLabels, rowsMap: rowsMap };
  }

  var teacherCode = String(p.teacherCode || CONFIG.TIMETABLE_WE_TEACHER_CODE || "").trim();
  if (!teacherCode) throw new Error("teacherCode is required.");
  var tsh = getTimetableTeacherSheet_();
  if (!tsh) throw new Error('Missing tab "' + CONFIG.TIMETABLE_TEACHER_TAB + '".');
  var theaders = ensureTeacherTimetableHeaders_(tsh, periodLabels);
  if (tsh.getLastRow() >= 2) {
    var tdata = tsh.getRange(2, 1, tsh.getLastRow() - 1, theaders.length).getValues();
    for (var tr = 0; tr < tdata.length; tr++) {
      var code = String(tdata[tr][0] != null ? tdata[tr][0] : "").trim();
      var dkey = String(tdata[tr][1] != null ? tdata[tr][1] : "").trim().toUpperCase();
      if (code !== teacherCode || dayKeys.indexOf(dkey) < 0) continue;
      for (var tp = 0; tp < periodLabels.length; tp++) {
        var label = periodLabels[tp];
        var col = theaders.indexOf(label);
        var parts = splitTeacherCell_(col >= 0 ? tdata[tr][col] : "");
        rowsMap[dkey][label] = { clazz: parts.clazz, subject: parts.subject };
      }
    }
  }
  return { ok: true, entityType: "teacher", teacherCode: teacherCode, dayKeys: dayKeys, periodLabels: periodLabels, rowsMap: rowsMap };
}

function saveTimetableEditorData_(payload) {
  var p = payload || {};
  var entityType = String(p.entityType || "class").trim().toLowerCase();
  if (entityType !== "class" && entityType !== "teacher") throw new Error("entityType must be class or teacher.");
  var rows = p.rows || [];
  if (!rows || !rows.length) throw new Error("No rows to save.");
  var periodLabels = timetableEditorPeriodLabels_();
  if (!periodLabels.length) throw new Error('No timetable periods found. Configure "Timetable_Slots" first.');
  var dayKeys = timetableEditorDayKeys_();

  if (entityType === "class") {
    var sh = getTimetableClassSheet_();
    if (!sh) throw new Error('Missing tab "' + CONFIG.TIMETABLE_CLASS_TAB + '".');
    var headers = ensureClassTimetableHeaders_(sh, periodLabels);
    var dataByDay = {};
    for (var i = 0; i < rows.length; i++) {
      var dk = String(rows[i].dayKey != null ? rows[i].dayKey : "").trim().toUpperCase();
      if (dayKeys.indexOf(dk) < 0) continue;
      dataByDay[dk] = rows[i].periods || {};
    }
    if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
    var out = [];
    for (var d = 0; d < dayKeys.length; d++) {
      var day = dayKeys[d];
      var line = [day];
      var pmap = dataByDay[day] || {};
      for (var pi = 0; pi < periodLabels.length; pi++) {
        var k = periodLabels[pi];
        var cell = pmap[k] || {};
        line.push(String(cell.subject != null ? cell.subject : "").trim());
        line.push(String(cell.teacher != null ? cell.teacher : "").trim());
      }
      out.push(line);
    }
    sh.getRange(2, 1, out.length, headers.length).setValues(out);
    return { ok: true, updatedRows: out.length };
  }

  var teacherCode = String(p.teacherCode || CONFIG.TIMETABLE_WE_TEACHER_CODE || "").trim();
  if (!teacherCode) throw new Error("teacherCode is required.");
  var tsh = getTimetableTeacherSheet_();
  if (!tsh) throw new Error('Missing tab "' + CONFIG.TIMETABLE_TEACHER_TAB + '".');
  var theaders = ensureTeacherTimetableHeaders_(tsh, periodLabels);
  var existing = tsh.getLastRow() >= 2 ? tsh.getRange(2, 1, tsh.getLastRow() - 1, theaders.length).getValues() : [];
  var keep = [];
  for (var er = 0; er < existing.length; er++) {
    if (String(existing[er][0] != null ? existing[er][0] : "").trim() !== teacherCode) keep.push(existing[er]);
  }
  var byDay = {};
  for (var ri = 0; ri < rows.length; ri++) {
    var dd = String(rows[ri].dayKey != null ? rows[ri].dayKey : "").trim().toUpperCase();
    if (dayKeys.indexOf(dd) < 0) continue;
    byDay[dd] = rows[ri].periods || {};
  }
  for (var dj = 0; dj < dayKeys.length; dj++) {
    var dayKey = dayKeys[dj];
    var line2 = [teacherCode, dayKey];
    var periodMap = byDay[dayKey] || {};
    for (var pj = 0; pj < periodLabels.length; pj++) {
      var pkey = periodLabels[pj];
      var c = periodMap[pkey] || {};
      var clazz = String(c.clazz != null ? c.clazz : "").trim();
      var subject = String(c.subject != null ? c.subject : "").trim();
      var merged = "";
      if (clazz && subject) merged = clazz + " / " + subject;
      else if (subject) merged = subject;
      else if (clazz) merged = clazz;
      line2.push(merged);
    }
    keep.push(line2);
  }
  if (tsh.getLastRow() > 1) tsh.deleteRows(2, tsh.getLastRow() - 1);
  if (keep.length) tsh.getRange(2, 1, keep.length, theaders.length).setValues(keep);
  return { ok: true, updatedRows: dayKeys.length };
}

function handleRequest_(body) {
  var action = body.action;
  var payload = body.payload || {};

  if (action === "getStudents") {
    return getStudents_(payload);
  }
  if (action === "setStudentActiveStatus") {
    return setStudentActiveStatus_(payload);
  }
  if (action === "addStudentToMaster") {
    return addStudentToMaster_(payload);
  }
  if (action === "getMarksEntryPolicy") {
    return getMarksEntryPolicy_();
  }
  if (action === "setMarksEntryPolicy") {
    return setMarksEntryPolicy_(payload);
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
  if (action === "getTodayAttendance") {
    return getTodayAttendance_(payload);
  }
  if (action === "saveTodayAttendance") {
    return saveTodayAttendance_(payload);
  }
  if (action === "getAttendanceByDate") {
    return getAttendanceByDate_(payload);
  }
  if (action === "saveAttendanceByDate") {
    return saveAttendanceByDate_(payload);
  }
  if (action === "markAttendanceDateBulk") {
    return markAttendanceDateBulk_(payload);
  }
  if (action === "getOldestUnfilledAttendanceDate") {
    return getOldestUnfilledAttendanceDate_(payload);
  }
  if (action === "getPendingAttendanceDates") {
    return getPendingAttendanceDates_(payload);
  }
  if (action === "getMonthlyAttendanceReport") {
    return getMonthlyAttendanceReport_(payload);
  }
  if (action === "getTodayAbsentees") {
    return getTodayAbsentees_(payload);
  }
  if (action === "getTodayAttendanceSummary") {
    return getTodayAttendanceSummary_(payload);
  }
  if (action === "getClassTimetableForDate") {
    return getClassTimetableForDate_(payload);
  }
  if (action === "getTeacherTimetableForDate") {
    return getTeacherTimetableForDate_(payload);
  }
  if (action === "getTimetableEditorData") {
    return getTimetableEditorData_(payload);
  }
  if (action === "saveTimetableEditorData") {
    return saveTimetableEditorData_(payload);
  }

  throw new Error("Unknown action: " + action);
}

function normalizeAdmnNo_(v) {
  return String(v != null ? v : "")
    .trim()
    .toUpperCase();
}

function ensureMasterStatusColumn_(sh, headers) {
  var i;
  for (i = 0; i < headers.length; i++) {
    if (String(headers[i] != null ? headers[i] : "").trim().toLowerCase() === "status") return i + 1;
  }
  var col = headers.length + 1;
  sh.getRange(1, col).setValue("Status");
  return col;
}

function setStudentActiveStatus_(payload) {
  var p = payload || {};
  var admnNo = normalizeAdmnNo_(p.admnNo);
  if (!admnNo) throw new Error("admnNo is required.");
  var isActive = p.isActive !== false;
  var sh = getMasterSheet_();
  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 2 || lc < 1) throw new Error("Master sheet has no student data.");
  var data = sh.getRange(1, 1, lr, lc).getValues();
  var headers = data[0];
  var admnCol = -1;
  for (var c = 0; c < headers.length; c++) {
    if (String(headers[c] != null ? headers[c] : "").trim().toLowerCase() === "admn no") {
      admnCol = c + 1;
      break;
    }
  }
  if (admnCol < 1) throw new Error('Missing "Admn No" column in Master.');
  var statusCol = ensureMasterStatusColumn_(sh, headers);
  var targetRow = -1;
  for (var r = 2; r <= lr; r++) {
    var raw = data[r - 1][admnCol - 1];
    if (normalizeAdmnNo_(raw) === admnNo) {
      targetRow = r;
      break;
    }
  }
  if (targetRow < 0) throw new Error("Student not found for Admn No: " + admnNo);
  var statusText = isActive ? "Active" : "Deactivated";
  sh.getRange(targetRow, statusCol).setValue(statusText);
  return { ok: true, admnNo: admnNo, status: statusText };
}

function addStudentToMaster_(payload) {
  var p = payload || {};
  var row = p.row || {};
  var admnNo = normalizeAdmnNo_(row["Admn No"]);
  var rollNo = String(row["R.NO."] != null ? row["R.NO."] : "").trim();
  var studentName = String(row["Student Name"] != null ? row["Student Name"] : "").trim();
  if (!rollNo) throw new Error("R.NO. is required.");
  if (!studentName) throw new Error("Student Name is required.");
  if (!admnNo) throw new Error("Admn No is required.");
  var sh = getMasterSheet_();
  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  var data = lr >= 1 ? sh.getRange(1, 1, lr, lc).getValues() : [];
  if (!data.length) throw new Error("Master sheet headers are missing.");
  var headers = data[0];
  var admnCol = -1;
  for (var c = 0; c < headers.length; c++) {
    if (String(headers[c] != null ? headers[c] : "").trim().toLowerCase() === "admn no") {
      admnCol = c + 1;
      break;
    }
  }
  if (admnCol < 1) throw new Error('Missing "Admn No" column in Master.');
  for (var r = 2; r <= lr; r++) {
    var existingAdmn = normalizeAdmnNo_(data[r - 1][admnCol - 1]);
    if (existingAdmn === admnNo) throw new Error("Admn No already exists: " + admnNo);
  }
  var statusCol = ensureMasterStatusColumn_(sh, headers);
  var useLastCol = Math.max(sh.getLastColumn(), statusCol);
  var headersNow = sh.getRange(1, 1, 1, useLastCol).getValues()[0];
  var out = [];
  for (var i = 0; i < headersNow.length; i++) {
    var h = String(headersNow[i] != null ? headersNow[i] : "").trim();
    if (!h) {
      out.push("");
      continue;
    }
    if (h.toLowerCase() === "status") out.push("Active");
    else out.push(row[h] != null ? String(row[h]).trim() : "");
  }
  sh.getRange(sh.getLastRow() + 1, 1, 1, out.length).setValues([out]);
  return { ok: true, admnNo: admnNo };
}

/** Prefer plain https in cell; else use formula so IMAGE/HYPERLINK URLs reach the client. */
function masterPhotoCellEffective_(displayVal, formulaVal) {
  var d = String(displayVal != null ? displayVal : "").trim();
  var f = String(formulaVal != null ? formulaVal : "").trim();
  if (/^https?:\/\//i.test(d)) return d;
  if (/^=(?:IMAGE|HYPERLINK)\s*\(/i.test(f)) return f;
  return d;
}

function getStudents_() {
  var sh = getMasterSheet_();
  var range = sh.getDataRange();
  var data = range.getValues();
  if (data.length < 2) {
    return { ok: true, students: [] };
  }
  var formulas = range.getFormulas();
  var headers = data[0].map(function (h) {
    return String(h != null ? h : "").trim();
  });
  var photoCol = -1;
  var pi;
  for (pi = 0; pi < headers.length; pi++) {
    if (String(headers[pi]).toLowerCase() === "photo") {
      photoCol = pi;
      break;
    }
  }
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
      if (hi === photoCol && photoCol >= 0) {
        var fCell = formulas[r] && formulas[r][photoCol] != null ? formulas[r][photoCol] : "";
        o[key] = masterPhotoCellEffective_(v, fCell);
      } else {
        o[key] = v != null ? String(v).trim() : "";
      }
    }
    out.push(o);
  }
  return { ok: true, students: out };
}

function saveMarkSlip_(payload) {
  assertMarksEntryAllowed_();
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

/**
 * Remove every Marks row with this SlipId (one bulk read of column A, then row deletes).
 * Avoid getRange(r,1).getValue() in a loop — that is O(sheet rows) round-trips and can take minutes.
 */
function deleteRowsWithSlipId_(sh, slipId) {
  var id = String(slipId || "").trim();
  if (!id) return;
  var last = sh.getLastRow();
  if (last < 2) return;
  var colA = sh.getRange(2, 1, last, 1).getValues();
  var toDelete = [];
  var i;
  for (i = 0; i < colA.length; i++) {
    if (String(colA[i][0] != null ? colA[i][0] : "").trim() === id) {
      toDelete.push(i + 2);
    }
  }
  if (!toDelete.length) return;
  toDelete.sort(function (a, b) {
    return b - a;
  });
  for (i = 0; i < toDelete.length; i++) {
    sh.deleteRow(toDelete[i]);
  }
}

function replaceMarkSlip_(payload) {
  assertMarksEntryAllowed_();
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
