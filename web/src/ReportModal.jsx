import React from "react";
import { downloadReportExcel, downloadReportPdf } from "./reportExport.js";
import { photoUrlFromMasterCell } from "./photoUrl.js";

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
              {body.map((row, ri) => {
                const isProfileKV =
                  headers.length === 2 && headers[0] === "Property" && headers[1] === "Information";
                return (
                  <tr key={ri}>
                    {row.map((cell, ci) => {
                      const prop0 = String(row[0]).trim();
                      const hdrName = String(headers[ci]).trim();
                      const url =
                        photoUrlFromMasterCell(cell) &&
                        ((isProfileKV && ci === 1 && /^photo$/i.test(prop0)) ||
                          (!isProfileKV && /^photo$/i.test(hdrName)))
                          ? photoUrlFromMasterCell(cell)
                          : "";
                      if (url) {
                        return (
                          <td key={ci}>
                            <img
                              className="report-modal-photo-thumb"
                              src={url}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const td = e.currentTarget.parentElement;
                                if (td) td.textContent = "—";
                              }}
                            />
                          </td>
                        );
                      }
                      return <td key={ci}>{cell === "" ? "—" : cell}</td>;
                    })}
                  </tr>
                );
              })}
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
