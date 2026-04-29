import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { initDb, loadStudents, insertStudent, deleteStudentById, loadTimetable, replaceTimetable, HEADERS } from "./db.js";
import {
  filteredStudentNames,
  getUniqueValues,
  filteredListByColumn,
  getSingleValue,
  studentProfile,
  categoryEnrollmentSummary,
  admissionCategorySummary,
  customReportRows,
} from "./dashboardLogic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, "../../web/dist");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const db = initDb();

function allStudents() {
  return loadStudents(db);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/headers", (_req, res) => {
  res.json({ headers: HEADERS });
});

app.get("/api/students", (_req, res) => {
  res.json({ students: allStudents() });
});

app.get("/api/student-names", (_req, res) => {
  const names = allStudents()
    .map((s) => String(s["Student Name"] || "").trim())
    .filter(Boolean)
    .sort();
  res.json({ names });
});

app.get("/api/student-value", (req, res) => {
  const { name, colIndex } = req.query;
  const col = parseInt(String(colIndex), 10);
  if (!name || Number.isNaN(col)) return res.status(400).json({ error: "name and colIndex required" });
  const v = getSingleValue(allStudents(), name, col);
  res.json({ value: v });
});

app.get("/api/unique/:colIndex", (req, res) => {
  const col = parseInt(req.params.colIndex, 10);
  if (Number.isNaN(col)) return res.status(400).json({ error: "invalid colIndex" });
  res.json({ values: getUniqueValues(allStudents(), col) });
});

app.get("/api/filtered-list", (req, res) => {
  const col = parseInt(String(req.query.colIndex), 10);
  const subValue = req.query.subValue;
  const headerName = req.query.headerName || "";
  if (Number.isNaN(col) || subValue == null) return res.status(400).json({ error: "colIndex and subValue required" });
  const matches = filteredListByColumn(allStudents(), col, subValue);
  res.json({
    title: `${headerName}: ${subValue} (Total: ${matches.length})`,
    names: matches,
  });
});

app.get("/api/profile", (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: "name required" });
  const profile = studentProfile(allStudents(), name);
  if (!profile) return res.status(404).json({ error: "Student not found" });
  res.json({ title: `Student Profile: ${name}`, rows: profile });
});

app.post("/api/dashboard-filter", (req, res) => {
  const { category, subCategory } = req.body || {};
  const result = filteredStudentNames(allStudents(), category, subCategory);
  if (result.error) return res.status(400).json(result);
  res.json({
    title: `${category} (${subCategory})`,
    names: result.names,
  });
});

app.get("/api/summary/category", (_req, res) => {
  res.json({ title: "Category Enrollment Summary", data: categoryEnrollmentSummary(allStudents()) });
});

app.get("/api/summary/admission-category", (_req, res) => {
  res.json({ title: "Admission Category Enrollment Summary", data: admissionCategorySummary(allStudents()) });
});

app.post("/api/report", (req, res) => {
  const { indices } = req.body || {};
  if (!Array.isArray(indices) || indices.length === 0) {
    return res.status(400).json({ error: "indices array required" });
  }
  const nums = indices.map((n) => parseInt(String(n), 10)).filter((n) => !Number.isNaN(n));
  const data = customReportRows(allStudents(), nums);
  res.json({ title: "Custom Student Report", data });
});

app.post("/api/students", (req, res) => {
  const body = req.body || {};
  const row = typeof body.row === "object" && body.row !== null ? body.row : body;
  const name = String(row["Student Name"] || "").trim();
  if (!name) return res.status(400).json({ error: "Student Name is required" });
  const id = insertStudent(db, row);
  res.status(201).json({ id, student: { id, ...row } });
});

app.delete("/api/students/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "invalid id" });
  const changes = deleteStudentById(db, id);
  if (!changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.get("/api/timetable/:entityType/:entityName", (req, res) => {
  const { entityType, entityName } = req.params;
  if (!["class", "teacher"].includes(entityType)) return res.status(400).json({ error: "entityType must be class or teacher" });
  const name = String(entityName || "").trim();
  if (!name) return res.status(400).json({ error: "entityName required" });
  const rows = loadTimetable(db, entityType, name);
  res.json({ entityType, entityName: name, rows });
});

app.put("/api/timetable/:entityType/:entityName", (req, res) => {
  const { entityType, entityName } = req.params;
  if (!["class", "teacher"].includes(entityType)) return res.status(400).json({ error: "entityType must be class or teacher" });
  const name = String(entityName || "").trim();
  if (!name) return res.status(400).json({ error: "entityName required" });
  const inputRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const normalized = [];
  for (const item of inputRows) {
    const dayName = String(item?.dayName || "").trim();
    const periodNo = parseInt(String(item?.periodNo), 10);
    const subject = String(item?.subject || "").trim();
    if (!dayName || Number.isNaN(periodNo) || periodNo < 1 || !subject) {
      return res.status(400).json({ error: "rows must include valid dayName, periodNo (>=1), and subject" });
    }
    normalized.push({ dayName, periodNo, subject });
  }
  replaceTimetable(db, entityType, name, normalized);
  res.json({ ok: true, count: normalized.length });
});

app.get("/api/export/csv", (req, res) => {
  const indicesParam = req.query.indices;
  let indices = HEADERS.map((_, i) => i);
  if (indicesParam) {
    indices = String(indicesParam)
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n < HEADERS.length);
    if (indices.length === 0) indices = HEADERS.map((_, i) => i);
  }
  const data = customReportRows(allStudents(), indices);
  const esc = (cell) => {
    const s = cell == null ? "" : String(cell);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = data.map((row) => row.map(esc).join(",")).join("\r\n");
  const filename = "KV_Report_export.csv";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send("\uFEFF" + csv);
});

if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Student dashboard API http://localhost:${PORT}`);
});
