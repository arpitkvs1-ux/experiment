(function () {
  "use strict";

  var STORAGE_KEY = "kv_studentapp_v1";

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

  function refreshUI() {
    students = loadStudents();
    fillNameSelects();
    fillManageTable();
    updateDashSub();
    updateSec2Sub();
    renderColCheckboxes();
    document.getElementById("recordCount").textContent = String(students.length);
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
        s.id +
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

  function wireEvents() {
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
    students = loadStudents();
    buildHeaderSelects();
    buildAddForm();
    wireEvents();
    refreshUI();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
