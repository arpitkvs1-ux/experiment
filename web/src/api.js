const base = import.meta.env.VITE_API_URL || "";

async function req(path, options = {}) {
  const r = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) {
    const err = new Error((data && data.error) || r.statusText || "Request failed");
    err.status = r.status;
    err.body = data;
    throw err;
  }
  return data;
}

export const api = {
  headers: () => req("/api/headers"),
  studentNames: () => req("/api/student-names"),
  students: () => req("/api/students"),
  studentValue: (name, colIndex) =>
    req(`/api/student-value?${new URLSearchParams({ name, colIndex: String(colIndex) })}`),
  unique: (colIndex) => req(`/api/unique/${colIndex}`),
  filteredList: (colIndex, subValue, headerName) =>
    req(`/api/filtered-list?${new URLSearchParams({ colIndex: String(colIndex), subValue, headerName })}`),
  profile: (name) => req(`/api/profile?${new URLSearchParams({ name })}`),
  dashboardFilter: (category, subCategory) =>
    req("/api/dashboard-filter", { method: "POST", body: JSON.stringify({ category, subCategory }) }),
  summaryCategory: () => req("/api/summary/category"),
  summaryAdmission: () => req("/api/summary/admission-category"),
  report: (indices) => req("/api/report", { method: "POST", body: JSON.stringify({ indices }) }),
  addStudent: (row) => req("/api/students", { method: "POST", body: JSON.stringify({ row }) }),
  deleteStudent: (id) => req(`/api/students/${id}`, { method: "DELETE" }),
  exportCsvUrl: (indices) => {
    const q = indices && indices.length ? `?indices=${indices.join(",")}` : "";
    return `${base}/api/export/csv${q}`;
  },
};
