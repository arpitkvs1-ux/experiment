// --- 1. DASHBOARD: FILTERED STUDENT LIST (Existing Logic) ---
function showFilteredStudents() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName("Dashboard");
  var detailsSheet = ss.getSheetByName("AllStudentDetails");
  var category = dashboard.getRange("C10").getValue();
  var subCategory = dashboard.getRange("D10").getValue();
  if (!category || !subCategory || category === "Select" || subCategory === "Select") {
    SpreadsheetApp.getUi().alert("Selection Required", "Please select a category and a value in sub category.");
    return;
  }
  var data = detailsSheet.getDataRange().getDisplayValues();
  var headers = data[0];
  var nameIdx = headers.indexOf("Student Name");
  var catIdx = headers.indexOf("Category");
  var admnCatIdx = headers.indexOf("KV Category");
  var houseIdx = headers.indexOf("House");
  var genderIdx = headers.indexOf("Gender");
  var minorityIdx = headers.indexOf("Minority");
  var sgcIdx = headers.indexOf("Single Girl Child");
  var rteIdx = headers.indexOf("RTE");
  var studentNames = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var isMatch = false;
    if (category === "ADMISSION QUOTA" || category === "QUOTA") {
      if (subCategory === "SGC" && String(row[sgcIdx]).trim().toUpperCase() === "YES") isMatch = true;
      else if (subCategory === "RTE" && String(row[rteIdx]).trim().toUpperCase() === "YES") isMatch = true;
    } else if (category === "SOCIAL CAT") {
      var studentCat = String(row[catIdx]).trim();
      if (subCategory === "OBC-All") {
        if (studentCat === "OBC(CL)" || studentCat === "OBC(NCL)" || studentCat === "OBC-CL" || studentCat === "OBC-NCL") isMatch = true;
      } else {
        if (studentCat === subCategory) isMatch = true;
        else if (subCategory === "OBC-CL" && studentCat === "OBC(CL)") isMatch = true;
        else if (subCategory === "OBC-NCL" && studentCat === "OBC(NCL)") isMatch = true;
      }
    } else {
      var targetIdx = -1;
      if (category === "HOUSE") targetIdx = houseIdx;
      else if (category === "KV CAT") targetIdx = admnCatIdx;
      else if (category === "GENDER") targetIdx = genderIdx;
      else if (category === "MINORITY") targetIdx = minorityIdx;
      if (targetIdx !== -1 && String(row[targetIdx]).trim() === String(subCategory).trim()) isMatch = true;
    }
    if (isMatch) { studentNames.push(row[nameIdx]); }
  }
  if (studentNames.length > 0) {
    studentNames.sort();
    var reportData = [["S No", "Student Name"]];
    studentNames.forEach(function(name, index) { reportData.push([(index + 1), name]); });
    openBrandedPopup(category + " (" + subCategory + ")", reportData);
  } else { SpreadsheetApp.getUi().alert("No Results", "No students found."); }
  dashboard.getRange("C10").setValue("Select");
  dashboard.getRange("D10").setValue("Select");
}

// --- 2. MANAGEMENT DASHBOARD LOGIC ---

function showDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("AllStudentDetails");
  var data = sheet.getDataRange().getDisplayValues();
  var headers = data[0];
  var nameIdx = headers.indexOf("Student Name");
  var studentList = data.slice(1).map(function(row) { return row[nameIdx]; }).filter(function(name) { return name && name.toString().trim() !== ""; }).sort();
  var template = HtmlService.createTemplateFromFile('Sidebar'); 
  template.headers = headers;
  template.studentList = studentList; 
  var html = template.evaluate().setWidth(1150).setHeight(800).setTitle('KV NIT Agartala - Management Dashboard');
  SpreadsheetApp.getUi().showModalDialog(html, " ");
}

/** Section 1: Student Detail */
function getSingleValue(studentName, colIndex) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("AllStudentDetails");
  var data = sheet.getDataRange().getDisplayValues();
  var nameIdx = data[0].indexOf("Student Name");
  for (var i = 1; i < data.length; i++) { if (data[i][nameIdx] === studentName) return data[i][colIndex]; }
  return "-";
}

/** Section 2: List Generator Unique Values */
function getUniqueValuesForHeader(colIndex) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("AllStudentDetails");
  var data = sheet.getDataRange().getDisplayValues();
  var values = data.slice(1).map(function(row) { return row[colIndex]; }).filter(function(v) { return v !== ""; });
  return [...new Set(values)].sort();
}

/** Section 2: Generate Filtered List */
function showFilteredList(colIndex, subValue, headerName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("AllStudentDetails");
  var data = sheet.getDataRange().getDisplayValues();
  var nameIdx = data[0].indexOf("Student Name");
  var matches = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]).trim() === String(subValue).trim()) { matches.push(data[i][nameIdx]); }
  }
  matches.sort();
  var reportData = [["S No", "Student Name"]];
  matches.forEach(function(name, index) { reportData.push([(index + 1), name]); });
  var title = headerName + ": " + subValue + " (Total: " + matches.length + ")";
  openBrandedPopup(title, reportData);
}

/** Section 3: Profile Generator */
function showStudentProfile(studentName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("AllStudentDetails");
  var data = sheet.getDataRange().getDisplayValues();
  var headers = data[0];
  var nameIdx = headers.indexOf("Student Name");
  var studentRow = data.find(function(row) { return row[nameIdx] === studentName; });
  if (studentRow) {
    var profileData = [["Property", "Information"]];
    headers.forEach(function(header, index) { profileData.push([header, studentRow[index] || "-"]); });
    openBrandedPopup("Student Profile: " + studentName, profileData);
  }
}

// --- 3. SUMMARIES & TABLES ---
function showAdmissionCategoryTable() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Tables");
  if (!sheet) return;
  var data = sheet.getRange("A11:D19").getDisplayValues().filter(function(row) { return row[0].toString().trim() !== ""; });
  openBrandedPopup("Admission Category Enrollment Summary", data);
}

function showEnrollmentTable() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Tables");
  var data = sheet.getRange("A1:D9").getDisplayValues();
  openBrandedPopup("Category Enrollment Summary", data);
}

function showReport(selectedIndices) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("AllStudentDetails");
  var fullData = sheet.getDataRange().getDisplayValues().filter(function(row) { return row[0].toString().trim() !== ""; });
  var reportData = fullData.map(function(row) { return selectedIndices.map(function(index) { return row[index]; }); });
  openBrandedPopup("Custom Student Report", reportData);
}

function openBrandedPopup(title, data) {
  var template = HtmlService.createTemplateFromFile('ReportPopup');
  template.reportTitle = title;
  template.reportData = data;
  var htmlOutput = template.evaluate().setWidth(980).setHeight(680).setSandboxMode(HtmlService.SandboxMode.IFRAME);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, " "); 
}

function handleExportRequest(type, title, data) {
  try {
    var cleanTitle = title ? title.toString().replace(/["']/g, "").trim() : "Student_Report";
    var fileName = "KV_Report_" + cleanTitle.replace(/\s+/g, "_");
    var cleanData = (typeof data === 'string') ? JSON.parse(data) : data;
    var ss = SpreadsheetApp.create(fileName);
    var sheet = ss.getSheets()[0];
    sheet.insertRowsBefore(1, 2);
    var rowCount = cleanData.length;
    var colCount = cleanData[0].length;
    var tableRange = sheet.getRange(3, 1, rowCount, colCount);
    tableRange.setNumberFormat("@").setValues(cleanData).setWrap(true).setVerticalAlignment("middle");
    sheet.getRange(1, 1).setValue("Kendriya Vidyalaya NIT Agartala").setFontWeight("bold").setFontSize(14);
    sheet.getRange(2, 1).setValue("Class VI - " + cleanTitle).setFontSize(12);
    var lastColLetter = columnToLetter(colCount);
    sheet.getRange("A1:" + lastColLetter + "1").merge().setHorizontalAlignment("center");
    sheet.getRange("A2:" + lastColLetter + "2").merge().setHorizontalAlignment("center");
    sheet.getRange(3, 1, 1, colCount).setFontWeight("bold").setBackground("#eeeeee").setHorizontalAlignment("center").setBorder(true, true, true, true, true, true, "#000000", SpreadsheetApp.BorderStyle.SOLID);
    tableRange.setBorder(true, true, true, true, true, true, "#000000", SpreadsheetApp.BorderStyle.SOLID);
    sheet.setColumnWidth(1, 45);
    if (colCount >= 2) sheet.setColumnWidth(2, 300);
    var folders = DriveApp.getFoldersByName("KV Reports");
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("KV Reports");
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    if (type === 'pdf') {
      return "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export?exportFormat=pdf&format=pdf&size=A4&portrait=true&fitw=true&top_margin=0.5&bottom_margin=0.5&left_margin=0.5&right_margin=0.5&horizontal_alignment=CENTER&gridlines=false&printtitle=false&sheetnames=false&fzr=false&gid=0";
    }
    return ss.getUrl();
  } catch (e) { throw new Error(e.toString()); }
}

function columnToLetter(column) {
  var temp, letter = '';
  while (column > 0) { temp = (column - 1) % 26; letter = String.fromCharCode(temp + 65) + letter; column = (column - temp - 1) / 26; }
  return letter;
}

function processSidebarSave(indices) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = ss.getSheetByName("AllStudentDetails").getDataRange().getDisplayValues();
  var reportData = data.map(function(row) { return indices.map(function(index) { return row[index]; }); });
  return handleExportRequest('sheet', 'Custom Student Report', reportData);
}