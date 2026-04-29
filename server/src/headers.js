/** Column order must match Google Sheet "AllStudentDetails" row 1 */
export const HEADERS = [
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
  "Photo",
  "REMARK",
];

export function emptyRowObject() {
  const o = {};
  for (const h of HEADERS) o[h] = "";
  return o;
}

export function rowToArray(obj) {
  return HEADERS.map((h) => (obj[h] != null ? String(obj[h]) : ""));
}

export function arrayToRow(arr) {
  const o = emptyRowObject();
  HEADERS.forEach((h, i) => {
    if (arr[i] != null && arr[i] !== "") o[h] = String(arr[i]).trim();
  });
  return o;
}
