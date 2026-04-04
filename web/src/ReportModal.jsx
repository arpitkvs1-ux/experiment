import React from "react";
import { downloadReportExcel, downloadReportPdf } from "./reportExport.js";

export function ReportModal({ title, data, onClose }) {
  if (!data || !data.length) return null;
  const headers = data[0];
  const body = data.slice(1);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal report-modal" role="dialog" aria-labelledby="report-title" onClick={(e) => e.stopPropagation()}>
        <header className="report-header">
          <div>
            <div className="school-name">Kendriya Vidyalaya NIT Agartala</div>
            <h2 id="report-title" className="report-title">
              Class VI - {title}
            </h2>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="table-scroll">
          <table className="data-table report-table">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{cell === "" ? "—" : cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="report-footer">
          <button type="button" className="btn success" onClick={() => downloadReportExcel(title, data)}>
            Download Excel
          </button>
          <button type="button" className="btn pdf" onClick={() => downloadReportPdf(title, data)}>
            Download PDF
          </button>
          <button type="button" className="btn outline" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
