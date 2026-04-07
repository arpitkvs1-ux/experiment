/**
 * Consolidated mark-slip Excel (reference: referenceScripts/markslip.xlsx layout).
 * Data from local marks storage + student master. Uses KVReports.downloadWorkbookXlsx.
 */
(function (global) {
  var SUBJECT_DEFS = [
    { key: "Hindi", sheet: "Hindi", line: "Hindi", short: "Hin", aliases: ["हिन्दी", "hindi"] },
    { key: "English", sheet: "English", line: "English", short: "Eng", aliases: ["english"] },
    { key: "Maths", sheet: "Maths", line: "Maths", short: "Math", aliases: ["mathematics", "math"] },
    { key: "Science", sheet: "Science", line: "Science", short: "Scie", aliases: ["science"] },
    {
      key: "Social Science",
      sheet: "S.St.",
      line: "Social Science",
      short: "S.St.",
      aliases: ["social science", "s.st.", "sst", "socialscience"],
    },
    { key: "Sanskrit", sheet: "Sanskrit", line: "Sanskrit", short: "Skt", aliases: ["संस्कृत", "sanskrit"] },
    { key: "AI", sheet: "AI", line: "AI", short: "A.I.", aliases: ["ai", "artificial intelligence"] },
  ];

  function normExam(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function normSub(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function subjectMatchesRecord(subStr, def) {
    var s = normSub(subStr);
    if (!s) return false;
    if (normSub(def.key) === s) return true;
    if (normSub(def.line) === s) return true;
    for (var i = 0; i < def.aliases.length; i++) {
      if (normSub(def.aliases[i]) === s) return true;
    }
    return false;
  }

  /** Local slips use examName; Google Sheet listMarkSlips uses exam. */
  function slipExamField(r) {
    if (!r) return "";
    if (r.exam != null && String(r.exam).trim() !== "") return String(r.exam).trim();
    if (r.examName != null && String(r.examName).trim() !== "") return String(r.examName).trim();
    return "";
  }

  function findLatestSlip(marksList, examSelected, def) {
    var en = normExam(examSelected);
    var list = [];
    for (var i = 0; i < marksList.length; i++) {
      var r = marksList[i];
      if (!r || normExam(slipExamField(r)) !== en) continue;
      if (!subjectMatchesRecord(r.subject, def)) continue;
      list.push(r);
    }
    if (!list.length) return null;
    list.sort(function (a, b) {
      return String(b.savedAt || "").localeCompare(String(a.savedAt || ""));
    });
    return list[0];
  }

  function persistId(st) {
    return String(st["R.NO."] != null ? st["R.NO."] : "").trim();
  }

  function studentName(st) {
    return String(st["Student Name"] || "").trim() || "—";
  }

  function findEntry(slip, st) {
    if (!slip || !slip.entries) return null;
    var roll = persistId(st);
    var nm = studentName(st);
    var ent = slip.entries;
    var i;
    for (i = 0; i < ent.length; i++) {
      if (String(ent[i].studentId || "").trim() === roll) return ent[i];
    }
    var sid = String(st.id);
    for (i = 0; i < ent.length; i++) {
      if (String(ent[i].studentId || "").trim() === sid) return ent[i];
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

  function formatDdMmYyyyFromRaw(v) {
    if (v == null || v === "") return "";
    if (typeof v === "string") {
      var t = v.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
        var p = t.slice(0, 10).split("-");
        return p[2] + "/" + p[1] + "/" + p[0];
      }
    }
    var d = v instanceof Date ? v : new Date(v);
    if (!isNaN(d.getTime())) {
      var day = d.getDate();
      var mo = d.getMonth() + 1;
      var y = d.getFullYear();
      return (day < 10 ? "0" : "") + day + "/" + (mo < 10 ? "0" : "") + mo + "/" + y;
    }
    return String(v);
  }

  function markDisplayAndPct(entry, maxMarks) {
    if (!entry) return { display: "", pct: "" };
    var mk = entry.marks;
    var ms = String(mk != null ? mk : "").trim();
    if (!ms) return { display: "", pct: "" };
    if (/^ab$/i.test(ms)) return { display: "AB", pct: "AB" };
    var n = parseFloat(String(ms).replace(/,/g, "."));
    if (isNaN(n) || maxMarks <= 0) return { display: ms, pct: "" };
    var pct = ((n / maxMarks) * 100).toFixed(2);
    return { display: String(ms), pct: pct };
  }

  function defaultSessionLabel() {
    var y = new Date().getFullYear();
    return String(y - 1) + "-" + String(y).slice(-2);
  }

  function buildSubjectSheetAoA(ctx) {
    var school = ctx.schoolName;
    var session = ctx.session || defaultSessionLabel();
    var exam = ctx.examDisplay;
    var classLine = ctx.classLine || "";
    var slip = ctx.slip;
    var def = ctx.subjectDef;
    var examiner = String(ctx.examiner || "").trim();
    var students = ctx.students;

    var maxM = slip && slip.maxMarks != null ? Number(slip.maxMarks) : 0;
    if (isNaN(maxM) || maxM <= 0) maxM = 0;
    var ansBook =
      ctx.answerBookCount != null && String(ctx.answerBookCount).trim() !== ""
        ? String(ctx.answerBookCount).trim()
        : slip && slip.entries
          ? String(slip.entries.length)
          : "";

    var rows = [];
    rows.push([school, "", "", ""]);
    rows.push(["SESSION : " + session, "", "", ""]);
    rows.push(["MARK-STATEMENT", "", "", ""]);
    rows.push([exam, "", "", ""]);
    rows.push(["Class : " + (classLine || "—"), "", "", ""]);
    rows.push(["Subject:  " + def.line, "", "", ""]);
    rows.push(["No. of Ans. Book : " + (ansBook || "—"), "", "", ""]);
    rows.push(["Name of Examiner : " + (examiner || "—"), "", "", ""]);
    if (slip && slip.examDate) {
      rows.push(["Exam date : " + formatDdMmYyyyFromRaw(slip.examDate), "", "", ""]);
    }
    rows.push(["", "", "", ""]);
    rows.push(["Roll", "Name", "Marks", "% Marks"]);

    for (var i = 0; i < students.length; i++) {
      var st = students[i];
      var roll = persistId(st) || "—";
      var nm = studentName(st);
      var en = slip ? findEntry(slip, st) : null;
      var mp = markDisplayAndPct(en, maxM);
      rows.push([roll, nm, mp.display, mp.pct]);
    }
    rows.push(["", "", "", ""]);
    rows.push(["*AB-Absent", "", "", ""]);
    rows.push(["Sign. of Examiner_________________", "", "", ""]);
    rows.push(["Sign. of Checker_________________", "", "", ""]);
    rows.push(["Principal", "", "", ""]);
    return rows;
  }

  function parseNumericMark(display) {
    if (!display || /^ab$/i.test(String(display).trim())) return null;
    var n = parseFloat(String(display).replace(/,/g, "."));
    return isNaN(n) ? null : n;
  }

  function buildResultAnalysisAoA(ctx) {
    var school = ctx.schoolName;
    var session = ctx.session || defaultSessionLabel();
    var exam = ctx.examDisplay;
    var classLine = ctx.classLine || "";
    var students = ctx.students;
    var slipsByKey = ctx.slipsByKey;
    var ptmDate = ctx.ptmDate || "";

    var rows = [];
    rows.push([school, "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["SESSION : " + session, "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["PARENT TEACHER MEETING", "", "", "", "", "", "", "", "", "", "", ""]);
    if (ptmDate) rows.push(["Date : " + ptmDate, "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push([exam + " — Consolidated", "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["Class : " + (classLine || "—"), "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["", "", "", "", "", "", "", "", "", "", "", ""]);

    var head = [
      "Roll No.",
      "Name of Student",
      "Hin",
      "Eng",
      "Math",
      "Scie",
      "S.St.",
      "Skt",
      "A.I.",
      "Total",
      "Remarks",
      "Sign. of Parents",
    ];
    rows.push(head);

    var overallPcts = [];
    var appeared = 0;

    for (var si = 0; si < students.length; si++) {
      var st = students[si];
      var roll = persistId(st) || "—";
      var nm = studentName(st);
      var line = [roll, nm, "", "", "", "", "", "", "", "", "", ""];
      var total = 0;
      var maxTot = 0;
      var hasAny = false;
      for (var k = 0; k < SUBJECT_DEFS.length; k++) {
        var d2 = SUBJECT_DEFS[k];
        var sp = slipsByKey[d2.key];
        var c = "";
        if (sp) {
          var e2 = findEntry(sp, st);
          var m2 = Number(sp.maxMarks);
          if (isNaN(m2) || m2 <= 0) m2 = 0;
          var p2 = markDisplayAndPct(e2, m2);
          c = p2.display;
          if (String(c).trim()) hasAny = true;
          var n2 = parseNumericMark(c);
          if (n2 != null) {
            total += n2;
            maxTot += m2;
          }
        }
        line[2 + k] = c;
      }
      line[9] = maxTot > 0 ? String(total) : "";
      var pct = maxTot > 0 ? (total / maxTot) * 100 : null;
      if (pct != null) overallPcts.push(pct);
      if (hasAny) appeared++;
      rows.push(line);
    }

    rows.push(["", "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["M.M.->", "", "", "", "", "", "", "", "", "", "", ""]);
    for (var mj = 0; mj < SUBJECT_DEFS.length; mj++) {
      var sp2 = slipsByKey[SUBJECT_DEFS[mj].key];
      rows[rows.length - 1][2 + mj] = sp2 && sp2.maxMarks != null ? String(sp2.maxMarks) : "";
    }
    rows.push(["", "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["Class teacher", "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["Exam I/C", "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["Principal", "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["", "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["STANDARD RESULT ANALYSIS (overall %)", "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["Total Strength", String(students.length), "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["Total Appeared (any mark)", String(appeared), "", "", "", "", "", "", "", "", "", ""]);

    var bands = [
      { label: "<33%", test: function (v) { return v >= 0 && v < 33; } },
      { label: "33 to <40", test: function (v) { return v >= 33 && v < 40; } },
      { label: "40 to <50", test: function (v) { return v >= 40 && v < 50; } },
      { label: "50 to <60", test: function (v) { return v >= 50 && v < 60; } },
      { label: "60 to <70", test: function (v) { return v >= 60 && v < 70; } },
      { label: "70 to <80", test: function (v) { return v >= 70 && v < 80; } },
      { label: "80 to <90", test: function (v) { return v >= 80 && v < 90; } },
      { label: "90 and above", test: function (v) { return v >= 90; } },
    ];
    for (var b = 0; b < bands.length; b++) {
      var B = bands[b];
      var cnt = 0;
      for (var p = 0; p < overallPcts.length; p++) {
        if (B.test(overallPcts[p])) cnt++;
      }
      rows.push([B.label, String(cnt), "", "", "", "", "", "", "", "", "", ""]);
    }

    return rows;
  }

  function aoaToSheet(aoa) {
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var maxCol = 0;
    for (var r = 0; r < aoa.length; r++) {
      if (aoa[r] && aoa[r].length > maxCol) maxCol = aoa[r].length;
    }
    var wch = [];
    for (var c = 0; c < maxCol; c++) {
      var m = 10;
      for (var rr = 0; rr < aoa.length; rr++) {
        var row = aoa[rr];
        if (!row || c >= row.length) continue;
        var L = row[c] ? String(row[c]).length : 0;
        if (L > m) m = L;
      }
      wch.push({ wch: Math.min(40, Math.max(8, m + 1)) });
    }
    ws["!cols"] = wch;
    return ws;
  }

  function buildWorkbook(options) {
    var exam = options.exam;
    var students = options.students || [];
    var marksList = options.marksList || [];
    var session = options.session || defaultSessionLabel();
    var ptmDate = options.ptmDate || "";
    var schoolName =
      options.schoolName ||
      (global.KVReports && global.KVReports.getSchoolName
        ? global.KVReports.getSchoolName()
        : "KENDRIYA VIDYALAYA");
    var classLine = options.classLine || "";
    var examinerByKey = options.examinerByKey || {};
    var answerBookByKey = options.answerBookByKey || {};

    var slipsByKey = {};
    for (var i = 0; i < SUBJECT_DEFS.length; i++) {
      var def = SUBJECT_DEFS[i];
      slipsByKey[def.key] = findLatestSlip(marksList, exam, def);
    }

    var wb = XLSX.utils.book_new();
    var ctxBase = {
      schoolName: schoolName,
      session: session,
      examDisplay: exam,
      classLine: classLine,
      students: students,
    };

    for (var j = 0; j < SUBJECT_DEFS.length; j++) {
      var d = SUBJECT_DEFS[j];
      var slip = slipsByKey[d.key];
      var ex = examinerByKey[d.key] != null ? String(examinerByKey[d.key]).trim() : "";
      if (!ex && slip && slip.teacherName) ex = String(slip.teacherName).trim();
      var ab = answerBookByKey[d.key] != null ? String(answerBookByKey[d.key]).trim() : "";
      var sheetAoA = buildSubjectSheetAoA(
        Object.assign({}, ctxBase, {
          slip: slip,
          subjectDef: d,
          examiner: ex,
          answerBookCount: ab,
        })
      );
      var ws = aoaToSheet(sheetAoA);
      XLSX.utils.book_append_sheet(wb, ws, d.sheet.slice(0, 31));
    }

    var raAoA = buildResultAnalysisAoA(
      Object.assign({}, ctxBase, {
        slipsByKey: slipsByKey,
        ptmDate: ptmDate,
      })
    );
    XLSX.utils.book_append_sheet(wb, aoaToSheet(raAoA), "Result Analysis");

    return wb;
  }

  /**
   * Students marked AB on a slip loaded from the sheet (<code>getMarkSlip</code> entries).
   */
  function absentStudentsFromSheetEntries(entries) {
    var out = [];
    if (!entries || !entries.length) return out;
    var i;
    for (i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e) continue;
      var ms = String(e.marks != null ? e.marks : "").trim();
      if (!/^ab$/i.test(ms)) continue;
      var roll = String(e.rollNo != null ? e.rollNo : "").trim() || "—";
      var nm = String(e.studentName != null ? e.studentName : "").trim() || "—";
      out.push({ rollNo: roll, studentName: nm });
    }
    out.sort(function (a, b) {
      var ra = parseFloat(String(a.rollNo).replace(/[^\d.]/g, ""));
      var rb = parseFloat(String(b.rollNo).replace(/[^\d.]/g, ""));
      if (!isNaN(ra) && !isNaN(rb) && ra !== rb) return ra - rb;
      return String(a.rollNo).localeCompare(String(b.rollNo));
    });
    return out;
  }

  /**
   * Rows for UI: marks entry per subject for one exam, from Google Sheets listMarkSlips payload.
   */
  function buildMarksEntryStatusRows(examSelected, slipsFromSheet) {
    var slips = slipsFromSheet || [];
    var out = [];
    var en = normExam(examSelected);
    var i;
    for (i = 0; i < SUBJECT_DEFS.length; i++) {
      var def = SUBJECT_DEFS[i];
      var candidates = [];
      var j;
      for (j = 0; j < slips.length; j++) {
        var r = slips[j];
        if (!r) continue;
        if (normExam(slipExamField(r)) !== en) continue;
        if (!subjectMatchesRecord(String(r.subject || ""), def)) continue;
        candidates.push(r);
      }
      candidates.sort(function (a, b) {
        return String(b.savedAt || "").localeCompare(String(a.savedAt || ""));
      });
      var slip = candidates[0] || null;
      var teacher = slip
        ? String(slip.teacher != null ? slip.teacher : slip.teacherName || "").trim()
        : "";
      out.push({
        subject: def.line,
        key: def.key,
        entered: !!slip,
        teacher: teacher,
        savedAt: slip ? String(slip.savedAt || "").trim() : "",
        slipId: slip ? String(slip.slipId || "").trim() : "",
      });
    }
    return out;
  }

  function collectMissingHints(marksList, exam) {
    var hints = [];
    var en = normExam(exam);
    var any = false;
    for (var x = 0; x < marksList.length; x++) {
      if (marksList[x] && normExam(slipExamField(marksList[x])) === en) {
        any = true;
        break;
      }
    }
    if (!any) {
      hints.push({ id: "no_exam_data", text: "No saved marks slips found for this examination in local data. Sheets will be mostly empty — fill details below or sync from Google Sheets first." });
    }
    for (var i = 0; i < SUBJECT_DEFS.length; i++) {
      var def = SUBJECT_DEFS[i];
      var slip = findLatestSlip(marksList, exam, def);
      if (!slip) {
        hints.push({
          id: "no_slip_" + def.key,
          text: "No marks for " + def.line + " — subject sheet will have headers only.",
        });
      } else {
        if (!String(slip.teacherName || "").trim()) {
          hints.push({
            id: "examiner_" + def.key,
            text: def.line + ": examiner name missing in data.",
            subjectKey: def.key,
            type: "examiner",
          });
        }
      }
    }
    return hints;
  }

  global.KVConsolidated = {
    EXAMS: ["PT1", "PT2", "Half Yearly", "SEE"],
    SUBJECT_DEFS: SUBJECT_DEFS,
    collectMissingHints: collectMissingHints,
    buildWorkbook: buildWorkbook,
    buildMarksEntryStatusRows: buildMarksEntryStatusRows,
    absentStudentsFromSheetEntries: absentStudentsFromSheetEntries,
    defaultSessionLabel: defaultSessionLabel,
  };
})(typeof window !== "undefined" ? window : this);
