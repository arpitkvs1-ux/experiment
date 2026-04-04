import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { HEADERS, emptyRowObject } from "./headers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "students.sqlite");
const csvPath = path.join(dataDir, "students.csv");

export function getDb() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_json TEXT NOT NULL
    );
  `);
  return db;
}

export function loadStudents(db) {
  const rows = db.prepare("SELECT id, row_json FROM students ORDER BY id").all();
  return rows.map((r) => ({ id: r.id, ...JSON.parse(r.row_json) }));
}

function seedFromCsvIfEmpty(db) {
  const count = db.prepare("SELECT COUNT(*) AS c FROM students").get().c;
  if (count > 0 || !fs.existsSync(csvPath)) return;
  const raw = fs.readFileSync(csvPath, "utf8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
  const insert = db.prepare("INSERT INTO students (row_json) VALUES (?)");
  const insertMany = db.transaction((list) => {
    for (const rec of list) {
      const o = emptyRowObject();
      for (const h of HEADERS) {
        if (rec[h] != null && String(rec[h]).trim() !== "") o[h] = String(rec[h]).trim();
      }
      insert.run(JSON.stringify(o));
    }
  });
  insertMany(records);
}

export function initDb() {
  const db = getDb();
  seedFromCsvIfEmpty(db);
  return db;
}

export function insertStudent(db, rowObj) {
  const o = emptyRowObject();
  for (const h of HEADERS) {
    if (rowObj[h] != null) o[h] = String(rowObj[h]).trim();
  }
  const info = db.prepare("INSERT INTO students (row_json) VALUES (?)").run(JSON.stringify(o));
  return info.lastInsertRowid;
}

export function deleteStudentById(db, id) {
  const info = db.prepare("DELETE FROM students WHERE id = ?").run(id);
  return info.changes;
}

export { csvPath, HEADERS };
