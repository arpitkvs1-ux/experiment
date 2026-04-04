import { HEADERS } from "./headers.js";

/** Mirrors showFilteredStudents() in Code.gs */
export function filteredStudentNames(students, category, subCategory) {
  if (!category || !subCategory || category === "Select" || subCategory === "Select") {
    return { error: "Please select a category and a value in sub category." };
  }
  const nameKey = "Student Name";
  const catKey = "Category";
  const admnCatKey = "Admn Category";
  const houseKey = "house";
  const genderKey = "Gender";
  const minorityKey = "Minority";
  const sgcKey = "Single Girl Child";
  const rteKey = "RTE";

  const names = [];
  for (const s of students) {
    let isMatch = false;
    if (category === "QUOTA") {
      if (subCategory === "SGC" && String(s[sgcKey] || "").trim().toUpperCase() === "YES") isMatch = true;
      else if (subCategory === "RTE" && String(s[rteKey] || "").trim().toUpperCase() === "YES") isMatch = true;
    } else if (category === "SOCIAL CAT") {
      const studentCat = String(s[catKey] || "").trim();
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
      let targetKey = null;
      if (category === "HOUSE") targetKey = houseKey;
      else if (category === "KV CAT") targetKey = admnCatKey;
      else if (category === "GENDER") targetKey = genderKey;
      else if (category === "MINORITY") targetKey = minorityKey;
      if (targetKey && String(s[targetKey] || "").trim() === String(subCategory).trim()) isMatch = true;
    }
    if (isMatch) {
      const n = String(s[nameKey] || "").trim();
      if (n) names.push(n);
    }
  }
  names.sort();
  return { names };
}

export function getUniqueValues(students, colIndex) {
  const h = HEADERS[colIndex];
  if (!h) return [];
  const values = students.map((s) => String(s[h] ?? "").trim()).filter((v) => v !== "");
  return [...new Set(values)].sort();
}

export function filteredListByColumn(students, colIndex, subValue) {
  const h = HEADERS[colIndex];
  const nameKey = "Student Name";
  if (!h) return [];
  const matches = students
    .filter((s) => String(s[h] ?? "").trim() === String(subValue).trim())
    .map((s) => String(s[nameKey] || "").trim())
    .filter(Boolean);
  matches.sort();
  return matches;
}

export function getSingleValue(students, studentName, colIndex) {
  const h = HEADERS[colIndex];
  if (!h) return "-";
  const row = students.find((s) => String(s["Student Name"] || "").trim() === String(studentName).trim());
  if (!row) return "-";
  const v = row[h];
  return v != null && String(v).trim() !== "" ? String(v) : "-";
}

export function studentProfile(students, studentName) {
  const row = students.find((s) => String(s["Student Name"] || "").trim() === String(studentName).trim());
  if (!row) return null;
  return HEADERS.map((header) => [header, row[header] != null && row[header] !== "" ? String(row[header]) : "-"]);
}

/** Skip empty sheet rows (no roll / no name), same idea as custom report. */
function isDataStudentRow(s) {
  if (String(s["R.NO."] ?? "").trim()) return true;
  if (String(s["Student Name"] ?? "").trim()) return true;
  return false;
}

function genderCell(s) {
  const g = String(s.Gender ?? "").trim();
  if (!g) return "—";
  const l = g.toLowerCase();
  if (l === "boy") return "Boy";
  if (l === "girl") return "Girl";
  return g;
}

function orderGenderColumns(genders) {
  const set = new Set(genders);
  const rest = [...set]
    .filter((g) => g !== "Boy" && g !== "Girl" && g !== "—")
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const out = [];
  if (set.has("Boy")) out.push("Boy");
  if (set.has("Girl")) out.push("Girl");
  out.push(...rest);
  if (set.has("—")) out.push("—");
  return out;
}

/**
 * Gender-wise counts per row dimension + bottom Total row (matches typical KV Tables layout).
 * Blank category/admission values: no detail row; those students still count in Total row only.
 */
export function genderWiseSummary(students, rowKey, rowLabel) {
  const list = students.filter(isDataStudentRow);
  const genders = orderGenderColumns([...new Set(list.map(genderCell))]);
  const rowValues = new Set();
  for (const s of list) {
    const rv = String(s[rowKey] ?? "").trim();
    if (rv) rowValues.add(rv);
  }
  const rowList = [...rowValues].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const matrix = new Map();
  for (const rv of rowList) {
    matrix.set(rv, Object.fromEntries(genders.map((g) => [g, 0])));
  }

  const colTotals = Object.fromEntries(genders.map((g) => [g, 0]));
  let grand = 0;

  for (const s of list) {
    const g = genderCell(s);
    const rv = String(s[rowKey] ?? "").trim();
    grand += 1;
    colTotals[g] = (colTotals[g] || 0) + 1;
    if (rv && matrix.has(rv)) {
      const row = matrix.get(rv);
      row[g] = (row[g] || 0) + 1;
    }
  }

  const header = [rowLabel, ...genders, "Total"];
  const out = [header];
  for (const rv of rowList) {
    const row = matrix.get(rv);
    let lineTotal = 0;
    const line = [rv];
    for (const g of genders) {
      const n = row[g] || 0;
      line.push(String(n));
      lineTotal += n;
    }
    line.push(String(lineTotal));
    out.push(line);
  }
  const totalLine = ["Total"];
  let checkGrand = 0;
  for (const g of genders) {
    const n = colTotals[g] || 0;
    totalLine.push(String(n));
    checkGrand += n;
  }
  totalLine.push(String(grand));
  return out;
}

/** Category enrollment: gender-wise + total (like Tables sheet). */
export function categoryEnrollmentSummary(students) {
  return genderWiseSummary(students, "Category", "Category");
}

/** Admission category: gender-wise + total. */
export function admissionCategorySummary(students) {
  return genderWiseSummary(students, "Admn Category", "Admn Category");
}

export function customReportRows(students, selectedIndices) {
  const headers = selectedIndices.map((i) => HEADERS[i]).filter(Boolean);
  const out = [headers];
  for (const s of students) {
    if (!String(s["R.NO."] ?? s["Student Name"] ?? "").trim()) continue;
    out.push(selectedIndices.map((i) => (HEADERS[i] != null ? String(s[HEADERS[i]] ?? "") : "")));
  }
  return out;
}
