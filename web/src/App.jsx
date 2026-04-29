import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { ReportModal } from "./ReportModal.jsx";
import { downloadReportExcel, downloadReportPdf } from "./reportExport.js";
import { photoUrlFromMasterCell } from "./photoUrl.js";
import "./App.css";

const DASH_CATS = ["QUOTA", "SOCIAL CAT", "HOUSE", "KV CAT", "GENDER", "MINORITY"];
const TIMETABLE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMETABLE_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

function StudentPhotoDetail({ raw, loading }) {
  const url = loading ? "" : photoUrlFromMasterCell(raw);
  const [ok, setOk] = useState(true);
  if (loading) return "…";
  if (!url || !ok) return <span className="muted">—</span>;
  return (
    <div className="query-photo-detail-wrap">
      <img
        className="query-photo-detail"
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setOk(false)}
      />
      <a href={url} target="_blank" rel="noopener noreferrer" className="card-desc small">
        Open photo link
      </a>
    </div>
  );
}

function buildSubOptions(category, students, headers) {
  const houseIdx = headers.indexOf("house");
  const admnIdx = headers.indexOf("Admn Category");
  const genderIdx = headers.indexOf("Gender");
  const minorityIdx = headers.indexOf("Minority");
  const catIdx = headers.indexOf("Category");

  const uniq = (idx) => {
    if (idx < 0) return [];
    const s = new Set();
    for (const st of students) {
      const v = String(st[headers[idx]] ?? "").trim();
      if (v) s.add(v);
    }
    return [...s].sort();
  };

  if (category === "QUOTA") return ["SGC", "RTE"];
  if (category === "SOCIAL CAT") {
    const base = uniq(catIdx);
    const extra = ["OBC-All", "OBC-CL", "OBC-NCL"];
    return [...new Set([...extra, ...base])].sort();
  }
  if (category === "HOUSE") return uniq(houseIdx);
  if (category === "KV CAT") return uniq(admnIdx);
  if (category === "GENDER") return uniq(genderIdx);
  if (category === "MINORITY") return uniq(minorityIdx);
  return [];
}

export default function App() {
  const [headers, setHeaders] = useState([]);
  const [names, setNames] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [sec1Student, setSec1Student] = useState("");
  const [sec1Col, setSec1Col] = useState("");
  const [sec1Val, setSec1Val] = useState(null);

  const [sec2Col, setSec2Col] = useState("");
  const [sec2Subs, setSec2Subs] = useState([]);
  const [sec2Sub, setSec2Sub] = useState("");

  const [profileStudent, setProfileStudent] = useState("");

  const [dashCat, setDashCat] = useState("HOUSE");
  const [dashSub, setDashSub] = useState("");

  const [selectedCols, setSelectedCols] = useState(() => new Set());

  const [modal, setModal] = useState(null);

  const [manageTab, setManageTab] = useState("list");
  const [newRow, setNewRow] = useState({});
  const [settingsEntityType, setSettingsEntityType] = useState("class");
  const [settingsEntityName, setSettingsEntityName] = useState("");
  const [timetableCells, setTimetableCells] = useState({});
  const [timetableBusy, setTimetableBusy] = useState(false);

  const refresh = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const [hRes, nRes, sRes] = await Promise.all([api.headers(), api.studentNames(), api.students()]);
      setHeaders(hRes.headers || []);
      setNames(nRes.names || []);
      setStudents(sRes.students || []);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const dashSubOptions = useMemo(() => buildSubOptions(dashCat, students, headers), [dashCat, students, headers]);

  useEffect(() => {
    if (dashSubOptions.length && !dashSubOptions.includes(dashSub)) setDashSub(dashSubOptions[0] || "");
  }, [dashSubOptions, dashSub]);

  useEffect(() => {
    if (!sec2Col) {
      setSec2Subs([]);
      setSec2Sub("");
      return;
    }
    api
      .unique(parseInt(sec2Col, 10))
      .then((r) => {
        setSec2Subs(r.values || []);
        setSec2Sub("");
      })
      .catch(() => {
        setSec2Subs([]);
        setSec2Sub("");
      });
  }, [sec2Col]);

  useEffect(() => {
    if (!sec1Student || sec1Col === "") {
      setSec1Val(null);
      return;
    }
    setSec1Val("…");
    api
      .studentValue(sec1Student, parseInt(sec1Col, 10))
      .then((r) => setSec1Val(r.value))
      .catch(() => setSec1Val("Error"));
  }, [sec1Student, sec1Col]);

  const toggleCol = (i) => {
    setSelectedCols((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  const toggleAllCols = () => {
    if (selectedCols.size === headers.length) setSelectedCols(new Set());
    else setSelectedCols(new Set(headers.map((_, i) => i)));
  };

  const openNameListModal = (title, namesList) => {
    const data = [["S No", "Student Name"], ...namesList.map((n, i) => [String(i + 1), n])];
    setModal({ title, data });
  };

  const runDashboardFilter = async () => {
    try {
      const r = await api.dashboardFilter(dashCat, dashSub);
      if (!r.names || !r.names.length) {
        alert("No students found.");
        return;
      }
      openNameListModal(r.title, r.names);
    } catch (e) {
      alert(e.body?.error || e.message);
    }
  };

  const runFilteredList = async () => {
    if (!sec2Col || !sec2Sub) {
      alert("Please select both header and value.");
      return;
    }
    const headerName = headers[parseInt(sec2Col, 10)] || "";
    try {
      const r = await api.filteredList(parseInt(sec2Col, 10), sec2Sub, headerName);
      if (!r.names.length) {
        alert("No students found.");
        return;
      }
      openNameListModal(r.title, r.names);
    } catch (e) {
      alert(e.message);
    }
  };

  const runProfile = async () => {
    if (!profileStudent) {
      alert("Please select a student.");
      return;
    }
    try {
      const r = await api.profile(profileStudent);
      const data = [["Property", "Information"], ...r.rows];
      setModal({ title: r.title, data });
    } catch (e) {
      alert(e.message);
    }
  };

  const runSummaryCategory = async () => {
    try {
      const r = await api.summaryCategory();
      setModal({ title: r.title, data: r.data });
    } catch (e) {
      alert(e.message);
    }
  };

  const runSummaryAdmission = async () => {
    try {
      const r = await api.summaryAdmission();
      setModal({ title: r.title, data: r.data });
    } catch (e) {
      alert(e.message);
    }
  };

  const runReport = async () => {
    const indices = [...selectedCols].sort((a, b) => a - b);
    if (!indices.length) {
      alert("Select at least one column.");
      return;
    }
    try {
      const r = await api.report(indices);
      setModal({ title: r.title, data: r.data });
    } catch (e) {
      alert(e.message);
    }
  };

  const downloadCustomExcel = async () => {
    const indices = [...selectedCols].sort((a, b) => a - b);
    if (!indices.length) {
      alert("Select columns.");
      return;
    }
    try {
      const r = await api.report(indices);
      downloadReportExcel(r.title, r.data);
    } catch (e) {
      alert(e.message);
    }
  };

  const downloadCustomPdf = async () => {
    const indices = [...selectedCols].sort((a, b) => a - b);
    if (!indices.length) {
      alert("Select columns.");
      return;
    }
    try {
      const r = await api.report(indices);
      downloadReportPdf(r.title, r.data);
    } catch (e) {
      alert(e.message);
    }
  };

  const submitNewStudent = async (e) => {
    e.preventDefault();
    try {
      await api.addStudent(newRow);
      setNewRow({});
      await refresh();
      alert("Student added.");
      setManageTab("list");
    } catch (e2) {
      alert(e2.body?.error || e2.message);
    }
  };

  const deleteStudent = async (id) => {
    if (!confirm("Delete this student from the master database? This cannot be undone.")) return;
    try {
      await api.deleteStudent(id);
      await refresh();
    } catch (e) {
      alert(e.message);
    }
  };

  const timetableCellKey = (dayName, periodNo) => `${dayName}__${periodNo}`;

  const loadTimetableFromDb = async () => {
    const entityName = settingsEntityName.trim();
    if (!entityName) {
      alert(`Enter ${settingsEntityType === "class" ? "class" : "teacher"} name/code first.`);
      return;
    }
    setTimetableBusy(true);
    try {
      const r = await api.getTimetable(settingsEntityType, entityName);
      const next = {};
      for (const row of r.rows || []) {
        next[timetableCellKey(row.dayName, row.periodNo)] = row.subject || "";
      }
      setTimetableCells(next);
    } catch (e) {
      alert(e.body?.error || e.message);
    } finally {
      setTimetableBusy(false);
    }
  };

  const saveTimetableToDb = async () => {
    const entityName = settingsEntityName.trim();
    if (!entityName) {
      alert(`Enter ${settingsEntityType === "class" ? "class" : "teacher"} name/code first.`);
      return;
    }
    const rows = [];
    for (const dayName of TIMETABLE_DAYS) {
      for (const periodNo of TIMETABLE_PERIODS) {
        const subject = String(timetableCells[timetableCellKey(dayName, periodNo)] || "").trim();
        if (!subject) continue;
        rows.push({ dayName, periodNo, subject });
      }
    }
    setTimetableBusy(true);
    try {
      await api.saveTimetable(settingsEntityType, entityName, rows);
      alert("Timetable saved.");
    } catch (e) {
      alert(e.body?.error || e.message);
    } finally {
      setTimetableBusy(false);
    }
  };

  if (loading && !headers.length) {
    return (
      <div className="app-shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <h1 className="brand">KV NIT Agartala</h1>
          <p className="tagline">Student management dashboard · API-ready for mobile</p>
        </div>
        <button type="button" className="btn outline" onClick={refresh}>
          Refresh data
        </button>
      </header>

      {err && (
        <div className="banner error">
          {err} — ensure the server is running (<code>npm run dev:server</code>).
        </div>
      )}

      <section className="card grid-full">
        <h2 className="card-title">Dashboard filter</h2>
        <p className="card-desc">Same logic as sheet cells C10/D10 + filtered list (QUOTA, SOCIAL CAT, HOUSE, KV CAT, GENDER, MINORITY).</p>
        <div className="row">
          <label className="field">
            <span>Category</span>
            <select value={dashCat} onChange={(e) => setDashCat(e.target.value)}>
              {DASH_CATS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Sub category</span>
            <select value={dashSub} onChange={(e) => setDashSub(e.target.value)}>
              {dashSubOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn primary" onClick={runDashboardFilter}>
            Show list
          </button>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="card">
          <h2 className="card-title">Student detail</h2>
          <label className="field">
            <span>Student</span>
            <select value={sec1Student} onChange={(e) => setSec1Student(e.target.value)}>
              <option value="">— Choose name —</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Column</span>
            <select value={sec1Col} onChange={(e) => setSec1Col(e.target.value)}>
              <option value="">— Choose column —</option>
              {headers.map((h, i) => (
                <option key={h} value={i}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <div className="detail-box">
            {sec1Val == null ? (
              <span className="muted">Pick student and column</span>
            ) : sec1Col !== "" && /^photo$/i.test(String(headers[parseInt(sec1Col, 10)] || "")) ? (
              <StudentPhotoDetail raw={sec1Val === "…" ? "" : sec1Val} loading={sec1Val === "…"} />
            ) : (
              sec1Val
            )}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">List generator</h2>
          <label className="field">
            <span>Header</span>
            <select value={sec2Col} onChange={(e) => setSec2Col(e.target.value)}>
              <option value="">— Choose column —</option>
              {headers.map((h, i) => (
                <option key={h} value={i}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Value</span>
            <select value={sec2Sub} onChange={(e) => setSec2Sub(e.target.value)}>
              <option value="">— Select header first —</option>
              {sec2Subs.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn primary" onClick={runFilteredList}>
            Generate list
          </button>
        </section>

        <section className="card">
          <h2 className="card-title">Student profile</h2>
          <label className="field">
            <span>Student</span>
            <select value={profileStudent} onChange={(e) => setProfileStudent(e.target.value)}>
              <option value="">— Choose name —</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn accent" onClick={runProfile}>
            Show profile
          </button>
        </section>

        <section className="card">
          <h2 className="card-title">Summaries</h2>
          <p className="card-desc small">Counts derived from the master table (replaces fixed “Tables” sheet ranges).</p>
          <button type="button" className="btn purple" onClick={runSummaryCategory}>
            Category summary
          </button>
          <button type="button" className="btn orange" onClick={runSummaryAdmission}>
            Admission category summary
          </button>
        </section>
      </div>

      <section className="card wide">
        <h2 className="card-title">Custom report</h2>
        <div className="toolbar">
          <button type="button" className="btn outline sm" onClick={toggleAllCols}>
            {selectedCols.size === headers.length ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="checkbox-grid">
          {headers.map((h, i) => (
            <label key={h} className="check-item">
              <input type="checkbox" checked={selectedCols.has(i)} onChange={() => toggleCol(i)} />
              {h}
            </label>
          ))}
        </div>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={runReport}>
            Show report
          </button>
          <button type="button" className="btn success" onClick={downloadCustomExcel}>
            Download Excel (selected)
          </button>
          <button type="button" className="btn pdf" onClick={downloadCustomPdf}>
            Download PDF (selected)
          </button>
        </div>
      </section>

      <section className="card wide">
        <h2 className="card-title">Master database</h2>
        <div className="tabs">
          <button type="button" className={manageTab === "list" ? "tab active" : "tab"} onClick={() => setManageTab("list")}>
            Records ({students.length})
          </button>
          <button type="button" className={manageTab === "add" ? "tab active" : "tab"} onClick={() => setManageTab("add")}>
            Add student
          </button>
        </div>
        {manageTab === "list" && (
          <div className="table-scroll tight">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Admn No</th>
                  <th>House</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{s["Student Name"] || "—"}</td>
                    <td>{s["Admn No"] || "—"}</td>
                    <td>{s.house || "—"}</td>
                    <td>
                      <button type="button" className="btn danger sm" onClick={() => deleteStudent(s.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {manageTab === "add" && (
          <form className="add-form" onSubmit={submitNewStudent}>
            <p className="card-desc small">Required: <strong>Student Name</strong>. Other fields optional; matches Google Sheet columns.</p>
            <div className="form-grid">
              {headers.map((h) => (
                <label key={h} className="field">
                  <span>{h}</span>
                  <input value={newRow[h] ?? ""} onChange={(e) => setNewRow((p) => ({ ...p, [h]: e.target.value }))} placeholder="—" />
                </label>
              ))}
            </div>
            <button type="submit" className="btn success">
              Add to database
            </button>
          </form>
        )}
      </section>

      <section className="card wide">
        <h2 className="card-title">Settings · Timetable manager</h2>
        <p className="card-desc small">Edit and update weekly timetable for a class or teacher in the local database.</p>
        <div className="row">
          <label className="field">
            <span>Timetable type</span>
            <select value={settingsEntityType} onChange={(e) => setSettingsEntityType(e.target.value)}>
              <option value="class">Class</option>
              <option value="teacher">Teacher</option>
            </select>
          </label>
          <label className="field">
            <span>{settingsEntityType === "class" ? "Class name/code" : "Teacher name/code"}</span>
            <input
              value={settingsEntityName}
              onChange={(e) => setSettingsEntityName(e.target.value)}
              placeholder={settingsEntityType === "class" ? "e.g. VI-A" : "e.g. TCH-ENG-01"}
            />
          </label>
          <button type="button" className="btn outline" onClick={loadTimetableFromDb} disabled={timetableBusy}>
            Load timetable
          </button>
          <button type="button" className="btn success" onClick={saveTimetableToDb} disabled={timetableBusy}>
            Save timetable
          </button>
          <button type="button" className="btn secondary" onClick={() => setTimetableCells({})} disabled={timetableBusy}>
            Clear grid
          </button>
        </div>

        <div className="table-scroll">
          <table className="data-table compact timetable-editor">
            <thead>
              <tr>
                <th>Day</th>
                {TIMETABLE_PERIODS.map((p) => (
                  <th key={p}>P{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIMETABLE_DAYS.map((dayName) => (
                <tr key={dayName}>
                  <td>{dayName}</td>
                  {TIMETABLE_PERIODS.map((periodNo) => {
                    const key = timetableCellKey(dayName, periodNo);
                    return (
                      <td key={key}>
                        <input
                          value={timetableCells[key] || ""}
                          onChange={(e) => setTimetableCells((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder="Subject"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modal && <ReportModal title={modal.title} data={modal.data} onClose={() => setModal(null)} />}
    </div>
  );
}
